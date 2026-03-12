/**
 * Agent Factory plugin filesystem service - file tree listing, file read/write,
 * and plugin directory operations. File IO helpers are in plugin-file-read-write-helpers.ts.
 */
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { discoverComponents, type DiscoveredItem, type DiscoveredFolder } from './component-discovery';
import {
  readPluginFile,
  savePluginFile,
  listSourcePathFiles,
  readSourceFileContent,
} from './plugin-file-read-write-helpers';

export type { DiscoveredItem, DiscoveredFolder };

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export function createAgentFactoryFilesystemService() {
  return {
    /** Build a recursive file tree for a plugin directory, sorted dirs-first */
    async buildPluginFileTree(dirPath: string, relativePath = ''): Promise<FileNode[]> {
      const fullPath = path.join(dirPath, relativePath);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const nodes: FileNode[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const entryPath = path.join(relativePath, entry.name);
        const node: FileNode = {
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? 'directory' : 'file',
        };
        if (entry.isDirectory()) {
          node.children = await this.buildPluginFileTree(dirPath, entryPath);
        }
        nodes.push(node);
      }

      return nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    },

    /** List files for a plugin based on its type and paths */
    async listPluginFiles(plugin: {
      type: string;
      sourcePath: string | null;
      agentSetPath?: string | null;
    }): Promise<{ files: FileNode[]; error?: string }> {
      const pluginPath = plugin.type === 'agent_set' ? plugin.agentSetPath : plugin.sourcePath;
      if (!pluginPath) return { files: [], error: 'Plugin path not found' };

      if (plugin.type === 'skill') {
        const skillDir = path.dirname(pluginPath);
        if (!existsSync(skillDir)) return { files: [], error: 'Skill directory not found' };
        return { files: await this.buildPluginFileTree(skillDir, '') };
      }

      if (plugin.type === 'agent_set') {
        if (!existsSync(pluginPath)) return { files: [], error: 'Agent set directory not found' };
        return { files: await this.buildPluginFileTree(pluginPath, '') };
      }

      // command / agent: single file
      if (!existsSync(pluginPath)) return { files: [], error: 'Plugin file not found' };
      const fileName = pluginPath.split('/').pop()!;
      return { files: [{ name: fileName, path: fileName, type: 'file' }] };
    },

    /** Read a specific file from a plugin's directory, with security check */
    async readPluginFile(plugin: {
      type: string;
      sourcePath: string | null;
      agentSetPath?: string | null;
    }, fileParts: string[]) {
      return readPluginFile(plugin, fileParts);
    },

    /** Save a file within a plugin's directory, with security check */
    async savePluginFile(plugin: {
      type: string;
      sourcePath: string | null;
      agentSetPath?: string | null;
      storageType: string;
    }, filePath: string, content: string) {
      return savePluginFile(plugin, filePath, content);
    },

    /** List files from an arbitrary source path (for discovered components), with home-dir security check */
    async listSourcePathFiles(sourcePath: string, type: 'skill' | 'command' | 'agent') {
      return listSourcePathFiles(sourcePath, type, this.buildPluginFileTree.bind(this));
    },

    /** Read file content from a basePath + filePath, with home-dir security check */
    async readSourceFileContent(basePath: string, filePath: string) {
      return readSourceFileContent(basePath, filePath);
    },

    /** Scan the home directory for skill/command/agent components, building folder hierarchy */
    async discoverComponents(excludeDir: string): Promise<Array<DiscoveredFolder | DiscoveredItem>> {
      return discoverComponents(excludeDir);
    },

    /** Compare discovered components against imported ones by file modification time */
    async compareWithImported(
      discovered: Array<{ type: string; name: string; description?: string; sourcePath: string; metadata?: Record<string, unknown> }>,
      imported: Array<{ id: string; type: string; name: string; sourcePath: string | null; updatedAt: number }>
    ) {
      const result: Array<typeof discovered[number] & { status: 'new' | 'update' | 'current'; existingPlugin?: { id: string; sourcePath: string | null; updatedAt: number } }> = [];

      for (const comp of discovered) {
        const existing = imported.find(c => c.type === comp.type && c.name === comp.name);
        if (!existing) { result.push({ ...comp, status: 'new' }); continue; }

        const sourceExists = comp.sourcePath && existsSync(comp.sourcePath);
        const importedExists = existing.sourcePath && existsSync(existing.sourcePath);
        if (!sourceExists || !importedExists) { result.push({ ...comp, status: 'new' }); continue; }

        try {
          const srcMtime = (await fs.stat(comp.sourcePath)).mtimeMs;
          const impMtime = (await fs.stat(existing.sourcePath!)).mtimeMs;
          result.push({
            ...comp,
            status: srcMtime > impMtime ? 'update' : 'current',
            existingPlugin: { id: existing.id, sourcePath: existing.sourcePath, updatedAt: existing.updatedAt },
          });
        } catch {
          result.push({ ...comp, status: 'new' });
        }
      }

      return result;
    },
  };
}
