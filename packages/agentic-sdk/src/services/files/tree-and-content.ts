/**
 * File tree and content service - recursive directory tree listing with git status overlay,
 * file content reading with language/binary detection, and secure file writing.
 * Self-contained: no Next.js or @/ imports.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getGitStatusMap, type GitStatusResult } from './git-status-map-reader';
import {
  LANGUAGE_MAP,
  BINARY_EXTENSIONS,
  EXCLUDED_DIRS,
  EXCLUDED_FILES,
  MAX_FILE_SIZE,
  CONTENT_TYPE_MAP,
  getContentTypeForExtension,
  detectLanguage,
} from './mime-and-language-constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GitFileStatusCode = 'M' | 'A' | 'D' | 'R' | 'U';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
  gitStatus?: GitFileStatusCode;
}

export interface FileTreeResult {
  entries: FileEntry[];
  basePath: string;
}

export interface FileContentResult {
  content: string | null;
  language: string | null;
  size: number;
  isBinary: boolean;
  mimeType: string;
  mtime: number;
}

// All constants (LANGUAGE_MAP, BINARY_EXTENSIONS, EXCLUDED_DIRS, EXCLUDED_FILES,
// MAX_FILE_SIZE, CONTENT_TYPE_MAP) and helpers (getContentTypeForExtension, detectLanguage)
// are imported from mime-and-language-constants.ts above.


function buildFileTree(
  dirPath: string, basePath: string, maxDepth: number,
  showHidden: boolean, gitStatus: GitStatusResult, currentDepth: number = 0
): FileEntry[] {
  if (currentDepth >= maxDepth) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result: FileEntry[] = [];
    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && EXCLUDED_DIRS.includes(entry.name)) continue;
      if (entry.isFile() && EXCLUDED_FILES.includes(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      if (entry.isDirectory()) {
        const children = buildFileTree(fullPath, basePath, maxDepth, showHidden, gitStatus, currentDepth + 1);
        result.push({
          name: entry.name, path: relativePath, type: 'directory',
          children: children.length > 0 ? children : undefined,
        });
      } else {
        let fileGitStatus = gitStatus.fileStatus.get(relativePath);
        if (!fileGitStatus) {
          const isInUntrackedDir = gitStatus.untrackedDirs.some(dir => relativePath.startsWith(dir + '/'));
          if (isInUntrackedDir) fileGitStatus = 'U';
        }
        result.push({ name: entry.name, path: relativePath, type: 'file', gitStatus: fileGitStatus });
      }
    }
    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createFileTreeAndContentService() {
  return {
    /**
     * Build a recursive file tree for the given directory with git status overlay.
     */
    async listDirectoryTree(
      basePath: string,
      opts?: { depth?: number; showHidden?: boolean }
    ): Promise<FileTreeResult> {
      const resolvedPath = path.resolve(basePath);
      if (!fs.existsSync(resolvedPath)) throw new Error('Path does not exist');
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) throw new Error('Path is not a directory');
      const depth = opts?.depth ?? 10;
      const showHidden = opts?.showHidden ?? true;
      const gitStatus = await getGitStatusMap(resolvedPath);
      const entries = buildFileTree(resolvedPath, resolvedPath, depth, showHidden, gitStatus);
      return { entries, basePath: resolvedPath };
    },

    /**
     * Read file content with security checks, binary detection, and language detection.
     * Throws descriptive errors for caller to map to HTTP status codes.
     */
    getFileContentSync(basePath: string, filePath: string): FileContentResult {
      const fullPath = path.resolve(basePath, filePath);
      const normalizedBase = path.resolve(basePath);
      const home = os.homedir();
      if (!normalizedBase.startsWith(home + path.sep) && normalizedBase !== home) {
        throw new Error('Access denied: base path outside home directory');
      }
      if (!fullPath.startsWith(normalizedBase)) {
        throw new Error('Invalid path: directory traversal detected');
      }
      if (!fs.existsSync(fullPath)) throw new Error('File not found');
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) throw new Error('Path is not a file');
      if (stats.size > MAX_FILE_SIZE) throw new Error('File too large');
      const ext = path.extname(fullPath).toLowerCase();
      const mtimeMs = stats.mtimeMs;
      if (BINARY_EXTENSIONS.includes(ext)) {
        return { content: null, language: null, size: stats.size, isBinary: true, mimeType: getContentTypeForExtension(ext), mtime: mtimeMs };
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      const language = LANGUAGE_MAP[ext] !== undefined ? LANGUAGE_MAP[ext] : detectLanguage(fullPath);
      return { content, language, size: stats.size, isBinary: false, mimeType: getContentTypeForExtension(ext), mtime: mtimeMs };
    },

    /**
     * Write text content to an existing file with security checks.
     * Does not allow creating new files or writing to binary files.
     * Throws descriptive errors for caller to map to HTTP status codes.
     */
    saveFileContentSync(basePath: string, filePath: string, content: string): { success: boolean; size: number } {
      const fullPath = path.resolve(basePath, filePath);
      const normalizedBase = path.resolve(basePath);
      const home = os.homedir();
      if (!normalizedBase.startsWith(home + path.sep) && normalizedBase !== home) {
        throw new Error('Access denied: base path outside home directory');
      }
      if (!fullPath.startsWith(normalizedBase)) {
        throw new Error('Invalid path: directory traversal detected');
      }
      if (!fs.existsSync(fullPath)) throw new Error('File not found');
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) throw new Error('Path is not a file');
      const ext = path.extname(fullPath).toLowerCase();
      if (BINARY_EXTENSIONS.includes(ext)) throw new Error('Cannot write to binary files');
      fs.writeFileSync(fullPath, content, 'utf-8');
      const newStats = fs.statSync(fullPath);
      return { success: true, size: newStats.size };
    },

    isBinaryExtension(ext: string): boolean {
      return BINARY_EXTENSIONS.includes(ext);
    },

    getLanguageForFile(filePath: string): string | null {
      const ext = path.extname(filePath).toLowerCase();
      return LANGUAGE_MAP[ext] !== undefined ? LANGUAGE_MAP[ext] : detectLanguage(filePath);
    },

    getContentType(ext: string): string {
      return getContentTypeForExtension(ext);
    },
  };
}
