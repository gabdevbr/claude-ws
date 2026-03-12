/**
 * TypeScript interface for the AgentFactory plugin service.
 * Separated from the implementation to keep files under 200 lines.
 * Avoids TS inference truncation on large object literals with self-references.
 */

export interface AgentFactoryService {
  listPlugins(filters?: { type?: string; projectId?: string }): Promise<any>;
  /** List plugins, filtering out imported ones whose source no longer exists on disk */
  listPluginsWithExistenceFilter(filters?: { type?: string }): Promise<any[]>;
  getPlugin(id: string): Promise<any>;
  createPlugin(data: {
    type: 'skill' | 'command' | 'agent' | 'agent_set';
    name: string;
    description?: string;
    sourcePath?: string;
    storageType?: 'local' | 'imported' | 'external';
    agentSetPath?: string;
    metadata?: string;
  }): Promise<any>;
  /** Create plugin record AND generate file on disk. Returns {plugin} or {error, statusCode}. */
  createPluginWithFile(data: {
    type: 'skill' | 'command' | 'agent';
    name: string;
    description?: string;
    storageType?: string;
    metadata?: any;
  }): Promise<{ plugin: any } | { error: string; statusCode: number }>;
  updatePlugin(id: string, data: Partial<any>): Promise<any>;
  /** Delete plugin from DB and optionally remove its files from disk */
  deletePluginWithFiles(id: string): Promise<void>;
  deletePlugin(id: string): Promise<void>;
  listProjectPlugins(projectId: string): Promise<any>;
  /** List project plugins, removing orphans (missing source) from DB */
  listProjectPluginsWithOrphanCleanup(projectId: string): Promise<any[]>;
  associatePlugin(projectId: string, pluginId: string): Promise<any>;
  disassociatePlugin(projectId: string, pluginId: string): Promise<void>;
  listDependencies(pluginId: string): Promise<any>;
  addDependency(pluginId: string, dep: { type: string; spec: string }): Promise<any>;
  removeDependency(depId: string): Promise<void>;
  getPluginFile(id: string): Promise<string | null>;
  updatePluginFile(id: string, content: string): Promise<{ success: boolean } | null>;
  discoverPlugins(basePath: string): Promise<Array<{ name: string; type: string; sourcePath: string }>>;
  importPlugin(data: { type: string; name: string; description?: string; sourcePath: string; metadata?: string }): Promise<any>;
  comparePlugins(discovered: Array<{ type: string; name: string; description?: string; sourcePath: string; metadata?: any }>): Promise<{ plugins: any[] }>;
  syncProject(projectId: string, projectPath: string): Promise<any>;
  getInstalledComponents(projectId: string, projectPath: string): Promise<{ installed: string[] }>;
  uninstallComponent(projectId: string, componentId: string, projectPath: string): Promise<any>;
  extractDependencies(sourcePath: string, type: string, useClaude?: boolean): Promise<any>;
  installDependency(id: string): Promise<any>;
  handleUpload(data: unknown): Promise<{ error: string }>;
  confirmUpload(body: unknown): Promise<{ error: string }>;
  updateUploadSession(sessionId: string, items: unknown[]): Promise<{ error: string }>;
  cancelUploadSession(sessionId: string): Promise<void>;
}
