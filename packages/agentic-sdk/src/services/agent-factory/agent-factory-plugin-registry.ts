/**
 * Agent Factory plugin registry service - CRUD for plugins, project associations,
 * dependencies, and filesystem discovery of .claude/agentfactory/ plugins.
 * Large methods (syncProject, importPlugin, etc.) are in plugin-project-sync-import-compare.ts.
 */
import { eq, and } from 'drizzle-orm';
import fs from 'fs/promises';
import * as schema from '../../db/database-schema';
import { generateId } from '../../lib/nanoid-id-generator';
import {
  importPlugin,
  comparePlugins,
  syncProject,
  getInstalledComponents,
  uninstallComponent,
} from './plugin-project-sync-import-compare';
import {
  extractDependencies,
  installDependency,
  AgentFactoryValidationError,
} from './plugin-dependency-extract-and-install';
import {
  discoverAgentFactoryPlugins,
  deletePluginWithFiles as deletePluginFilesHelper,
} from './plugin-discovery-and-file-deletion';
import type { AgentFactoryService } from './agent-factory-plugin-service-interface';

export type { AgentFactoryService };
export { AgentFactoryValidationError };

export class PluginAlreadyAssignedError extends Error {
  constructor(message: string = 'Plugin already assigned to project') {
    super(message);
    this.name = 'PluginAlreadyAssignedError';
  }
}

export function createAgentFactoryService(db: any): AgentFactoryService {
  return {
    async listPlugins(filters?: { type?: string; projectId?: string }) {
      if (filters?.projectId) return this.listProjectPlugins(filters.projectId);
      const query = db.select().from(schema.agentFactoryPlugins);
      if (filters?.type) return query.where(eq(schema.agentFactoryPlugins.type, filters.type as any)).all();
      return query.all();
    },

    async listPluginsWithExistenceFilter(filters?: { type?: string }) {
      const { existsSync } = await import('fs');
      const all = await this.listPlugins(filters);
      return (all as any[]).filter((plugin: any) => {
        if (plugin.storageType === 'imported') return plugin.sourcePath && existsSync(plugin.sourcePath);
        return true;
      });
    },

    async getPlugin(id: string) {
      return db.select().from(schema.agentFactoryPlugins).where(eq(schema.agentFactoryPlugins.id, id)).get();
    },

    async createPlugin(data: { type: 'skill' | 'command' | 'agent' | 'agent_set'; name: string; description?: string; sourcePath?: string; storageType?: 'local' | 'imported' | 'external'; agentSetPath?: string; metadata?: string }) {
      const id = generateId('plg');
      const now = Date.now();
      const record = { id, type: data.type, name: data.name, description: data.description || null, sourcePath: data.sourcePath || null, storageType: data.storageType || 'local' as const, agentSetPath: data.agentSetPath || null, metadata: data.metadata || null, createdAt: now, updatedAt: now };
      await db.insert(schema.agentFactoryPlugins).values(record);
      return record;
    },

    async createPluginWithFile(data: { type: 'skill' | 'command' | 'agent'; name: string; description?: string; storageType?: string; metadata?: any }) {
      const { generatePluginFile, getPluginPath, pluginExists } = await import('./plugin-file-generator');
      const { type, name, description, storageType = 'local', metadata } = data;
      const pluginType = type as 'skill' | 'command' | 'agent';
      if (!['skill', 'command', 'agent'].includes(pluginType)) return { error: 'Invalid type. Must be skill, command, or agent', statusCode: 400 };
      if (pluginExists(pluginType, name)) return { error: `Plugin file already exists at ${getPluginPath(pluginType, name)}`, statusCode: 409 };
      const allPlugins = await this.listPlugins({ type: pluginType });
      if ((allPlugins as any[]).find((p: any) => p.name === name)) return { error: 'Plugin with this name already exists in database', statusCode: 409 };
      try {
        await generatePluginFile({ type: pluginType, name, description: description || undefined });
      } catch (fileError: unknown) {
        const err = fileError as Error & { code?: string };
        if (err.code === 'PLUGIN_EXISTS') return { error: err.message, statusCode: 409 };
        return { error: 'Failed to create plugin file on disk', statusCode: 500 };
      }
      const actualPath = getPluginPath(pluginType, name);
      const plugin = await this.createPlugin({ type: pluginType, name, description: description || undefined, sourcePath: actualPath, storageType: storageType as any, metadata: metadata ? JSON.stringify(metadata) : undefined });
      return { plugin };
    },

    async updatePlugin(id: string, data: Partial<schema.AgentFactoryPlugin>) {
      await db.update(schema.agentFactoryPlugins).set({ ...data, updatedAt: Date.now() }).where(eq(schema.agentFactoryPlugins.id, id));
      return this.getPlugin(id);
    },

    async deletePlugin(id: string) {
      await db.delete(schema.agentFactoryPlugins).where(eq(schema.agentFactoryPlugins.id, id));
    },

    async deletePluginWithFiles(id: string) {
      const existing = await this.getPlugin(id);
      if (!existing) return;
      await deletePluginFilesHelper(existing, this.deletePlugin.bind(this));
    },

    async listProjectPlugins(projectId: string) {
      return db.select({ id: schema.agentFactoryPlugins.id, type: schema.agentFactoryPlugins.type, name: schema.agentFactoryPlugins.name, description: schema.agentFactoryPlugins.description, sourcePath: schema.agentFactoryPlugins.sourcePath, storageType: schema.agentFactoryPlugins.storageType, metadata: schema.agentFactoryPlugins.metadata, enabled: schema.projectPlugins.enabled })
        .from(schema.projectPlugins)
        .innerJoin(schema.agentFactoryPlugins, eq(schema.projectPlugins.pluginId, schema.agentFactoryPlugins.id))
        .where(eq(schema.projectPlugins.projectId, projectId))
        .all();
    },

    async listProjectPluginsWithOrphanCleanup(projectId: string) {
      const { existsSync } = await import('fs');
      const assigned = await this.listProjectPlugins(projectId);
      const missingIds: string[] = [];
      const valid = (assigned as any[]).filter((plugin: any) => {
        const pathToCheck = plugin.type === 'agent_set' ? plugin.agentSetPath : plugin.sourcePath;
        if (pathToCheck && existsSync(pathToCheck)) return true;
        missingIds.push(plugin.id);
        return false;
      });
      for (const pluginId of missingIds) await this.deletePlugin(pluginId);
      return valid;
    },

    async associatePlugin(projectId: string, pluginId: string) {
      try {
        const id = generateId('pp');
        const record = { id, projectId, pluginId, enabled: true, createdAt: Date.now() };
        await db.insert(schema.projectPlugins).values(record);
        return record;
      } catch (err: any) {
        if (err?.message?.includes('UNIQUE') || err?.code === 'SQLITE_CONSTRAINT') throw new PluginAlreadyAssignedError();
        throw err;
      }
    },

    async disassociatePlugin(projectId: string, pluginId: string) {
      await db.delete(schema.projectPlugins).where(and(eq(schema.projectPlugins.projectId, projectId), eq(schema.projectPlugins.pluginId, pluginId)));
    },

    async listDependencies(pluginId: string) {
      return db.select().from(schema.pluginDependencies).where(eq(schema.pluginDependencies.pluginId, pluginId)).all();
    },

    async addDependency(pluginId: string, dep: { type: string; spec: string }) {
      const id = generateId('dep');
      const record = { id, pluginId, dependencyType: dep.type as any, spec: dep.spec, createdAt: Date.now() };
      await db.insert(schema.pluginDependencies).values(record);
      return record;
    },

    async removeDependency(depId: string) {
      await db.delete(schema.pluginDependencies).where(eq(schema.pluginDependencies.id, depId));
    },

    async getPluginFile(id: string) {
      const plugin = await this.getPlugin(id);
      if (!plugin?.sourcePath) return null;
      try { return await fs.readFile(plugin.sourcePath, 'utf-8'); } catch { return null; }
    },

    async updatePluginFile(id: string, content: string) {
      const plugin = await this.getPlugin(id);
      if (!plugin?.sourcePath) return null;
      await fs.writeFile(plugin.sourcePath, content, 'utf-8');
      return { success: true };
    },

    async discoverPlugins(basePath: string) {
      return discoverAgentFactoryPlugins(basePath);
    },

    async importPlugin(data) { return importPlugin(db, data); },
    async comparePlugins(discovered) { return comparePlugins(db, discovered); },
    async syncProject(projectId, projectPath) { return syncProject(db, projectId, projectPath); },
    async getInstalledComponents(projectId, projectPath) { return getInstalledComponents(db, projectId, projectPath); },
    async uninstallComponent(projectId, componentId, projectPath) { return uninstallComponent(db, projectId, componentId, projectPath, this.getPlugin.bind(this)); },

    async extractDependencies(sourcePath: string, type: string, useClaude?: boolean) {
      return extractDependencies(sourcePath, type, useClaude);
    },

    async installDependency(id: string) {
      return installDependency(db, id);
    },

    async handleUpload(_data: unknown) { return { error: 'Archive upload not available in agentic-sdk (requires adm-zip/tar)' }; },
    async confirmUpload(_body: unknown) { return { error: 'Archive upload not available in agentic-sdk (requires adm-zip/tar)' }; },
    async updateUploadSession(_sessionId: string, _items: unknown[]) { return { error: 'Upload sessions not available in agentic-sdk' }; },
    async cancelUploadSession(_sessionId: string): Promise<void> { /* no-op */ },
  };
}
