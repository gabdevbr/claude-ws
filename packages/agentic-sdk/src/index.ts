/**
 * Public API - exports createApp factory, config loader, shared modules, and all service factories
 */
export { createApp } from './app-factory';
export { loadEnvConfig, type EnvConfig } from './config/env-config';

// Shared modules - re-exported for use by claude-ws via @agentic-sdk/* path alias
export { createLogger, logger, type Logger } from './lib/pino-logger';
export {
  type Model,
  AVAILABLE_MODELS,
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_ALIAS,
  getModelById,
  isValidModelId,
  modelIdToDisplayName,
  getModelShortName,
} from './lib/claude-available-models';
export { safeCompare } from './lib/timing-safe-compare';

// --- Projects ---
export { createProjectService } from './services/project/project-crud';

// --- Tasks ---
export { createTaskService } from './services/task/task-crud-and-reorder';

// --- Attempts ---
export { createAttemptService } from './services/attempt/attempt-crud-and-logs';
export { createUploadService } from './services/attempt/attempt-file-upload-storage';

// --- Checkpoints ---
export { createCheckpointService } from './services/checkpoint/checkpoint-crud-and-rewind';
export { createCheckpointOperationsService } from './services/checkpoints/fork-and-rewind-operations';

// --- Files ---
export { createFileService } from './services/file/filesystem-read-write';
export { createFileOperationsService } from './services/files/operations-and-upload';
export { createFileContentReadWriteService, type FileContentResult } from './services/files/content-read-write';
export {
  createFileTreeAndContentService,
} from './services/files/tree-and-content';
export {
  createFileTreeBuilderService,
  type GitFileStatusCode,
  type FileEntry,
  type FileTreeResult,
} from './services/files/tree-builder';
export {
  LANGUAGE_MAP,
  BINARY_EXTENSIONS,
  EXCLUDED_DIRS,
  EXCLUDED_FILES,
  MAX_FILE_SIZE,
  CONTENT_TYPE_MAP,
  getContentTypeForExtension,
  detectLanguage,
} from './services/files/mime-and-language-constants';

// --- Search ---
export { createSearchService } from './services/search/content-search-and-file-glob';
export { createFileSearchService } from './services/files/search-and-content-search';
export { createChatHistorySearchService } from './services/chat-history-search';

// --- Shells ---
export { createShellService, toShellInfo, type ShellInfo } from './services/shell/shell-process-db-tracking';

// --- Commands ---
export {
  createCommandService,
  type CommandInfo,
  type CommandContent,
  type CommandPromptResult,
  type CommandFileError,
} from './services/command/slash-command-listing';

// --- Force-create helpers ---
export {
  createForceCreateService,
  ForceCreateError,
  sanitizeDirName,
  type ForceCreateParams,
  type ForceCreateResult,
} from './services/force-create-project-and-task';

// --- Auth ---
export { createAuthVerificationService } from './services/auth-verification';

// --- Attempt Workflow ---
export { createAttemptWorkflowService } from './services/attempts/workflow-tree';

// --- Agent Factory (all exports) ---
export * from './agent-factory-exports-barrel';

// --- File Search: Filesystem Scan Helpers ---
export {
  EXCLUDED_DIRS as SEARCH_EXCLUDED_DIRS,
  EXCLUDED_FILES as SEARCH_EXCLUDED_FILES,
  BINARY_EXTENSIONS as SEARCH_BINARY_EXTENSIONS,
  MAX_SEARCH_FILE_SIZE,
  simpleFuzzyMatch,
  collectAllFiles,
  escapeRegex,
  type ContentMatch,
  searchFileContent,
  type ContentFileResult,
  searchDirContent,
} from './services/files/search-filesystem-scan-helpers';

// --- File Operations: Path Security & Compression Helpers ---
export {
  validateRootPath,
  validatePathWithinRoot,
  isCompressedFile,
  extractArchive as extractArchiveCompressed,
} from './services/files/operations-path-security-and-compression-helpers';
