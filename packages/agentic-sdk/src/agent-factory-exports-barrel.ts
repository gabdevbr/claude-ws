/**
 * Agent Factory public exports barrel - re-exports all agent-factory service factories,
 * helpers, and types for consumption by the SDK index. Separated to keep index.ts under 200 lines.
 */

// --- Agent Factory: Core registry ---
export { createAgentFactoryService } from './services/agent-factory/agent-factory-plugin-registry';
export { createAgentFactoryProjectSyncService } from './services/agent-factory/project-sync-and-install';
export {
  createAgentFactoryFilesystemService,
  type FileNode,
  type DiscoveredItem as AgentFactoryDiscoveredItem,
  type DiscoveredFolder as AgentFactoryDiscoveredFolder,
} from './services/agent-factory/plugin-filesystem-operations';

// --- Agent Factory: Dir Resolver ---
export {
  getDataDir,
  getAgentFactoryDir,
  getGlobalClaudeDir,
} from './services/agent-factory/dir-resolver';

// --- Agent Factory: Archive Extraction ---
export {
  extractZip,
  extractTar,
  extractGzip,
  extractArchive,
} from './services/agent-factory/archive-extraction';

// --- Agent Factory: Upload Helpers ---
export {
  type ExtractedItem,
  detectPluginType,
  extractDescriptionFromMarkdown,
  moveDirectory,
  moveDirectoryContents,
  processFile,
  processDirectory,
  previewDirectory,
  previewDirectoryContents,
} from './services/agent-factory/upload-filesystem-helpers';

// --- Agent Factory: Upload Analysis & Import ---
export {
  type UploadSession,
  analyzeForPreview,
  analyzeAndOrganize,
  importFromSession,
} from './services/agent-factory/upload-analysis-and-import';

// --- Agent Factory: Component Import ---
export {
  createAgentFactoryImportService,
  ImportError,
} from './services/agent-factory/component-import';

// --- Agent Factory: Dependency Parsers ---
export {
  type LibraryDep,
  type PluginDep,
  extractLibraries,
  extractComponents,
  analyzePackageFiles,
} from './services/agent-factory/dependency-extractor-parsers';

// --- Agent Factory: Dependency Extractor ---
export {
  type ExtractedDeps,
  DependencyExtractor,
  dependencyExtractor,
} from './services/agent-factory/dependency-extractor';

// --- Agent Factory: Claude Dependency Analyzer ---
export {
  type AnalysisResult,
  ClaudeDependencyAnalyzer,
  claudeDependencyAnalyzer,
} from './services/agent-factory/claude-dependency-analyzer';

// --- Agent Factory: Install Script Templates ---
export {
  generateNpm,
  generatePnpm,
  generateYarn,
  generatePip,
  generatePoetry,
  generateCargo,
  generateGo,
} from './services/agent-factory/install-script-templates';

// --- Agent Factory: Install Script Generator ---
export {
  type GeneratedScripts,
  InstallScriptGenerator,
  installScriptGenerator,
} from './services/agent-factory/install-script-generator';

// --- Agent Factory: Dependency Cache ---
export {
  type CachedDependencyData,
  type DependencyCacheService,
  createDependencyCacheService,
} from './services/agent-factory/dependency-cache';

// --- Agent Factory: Dependency Resolver ---
export {
  type ResolveOptions,
  type ResolvedComponent,
  type ResolvedDependencyTree,
  type DependencyResolverService,
  createDependencyResolverService,
} from './services/agent-factory/dependency-resolver';

// --- Agent Factory: Plugin File Generator ---
export {
  type GeneratePluginFileOptions,
  type PluginFileExistsError,
  generatePluginFile,
  getPluginPath,
  pluginExists,
} from './services/agent-factory/plugin-file-generator';

// --- Agent Factory: Component Discovery ---
export {
  EXCLUDED_DIRS as AF_COMPONENT_EXCLUDED_DIRS,
  type DiscoveredItem,
  type DiscoveredFolder,
  discoverComponents,
  scanDirectoryForComponents,
  scanComponentDirectory,
  buildFolderHierarchy,
  parseYamlFrontmatter,
} from './services/agent-factory/component-discovery';

// --- Agent Factory: Component Install Helpers ---
export {
  copyDirectory,
  installSingleFile,
  installAgentSet,
  isAgentSetInstalled,
  uninstallAgentSet,
} from './services/agent-factory/component-install-copy-helpers';
