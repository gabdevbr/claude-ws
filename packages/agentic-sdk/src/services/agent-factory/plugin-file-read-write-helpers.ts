/**
 * Agent Factory plugin file read/write helpers - secure read and save of plugin files,
 * source path file listing with home-dir security checks.
 * Extracted from plugin-filesystem-operations.ts to keep files under 200 lines.
 */
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import type { FileNode } from './plugin-filesystem-operations';

/** Map file extension to a CodeMirror-compatible language identifier */
export function getLanguageFromExtension(ext: string): string {
  const langMap: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    c: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift', kt: 'kotlin',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', sql: 'sql',
    json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml', html: 'html',
    htm: 'html', css: 'css', scss: 'scss', sass: 'sass', less: 'less',
    md: 'markdown', markdown: 'markdown', txt: 'text', toml: 'toml',
    ini: 'ini', cfg: 'ini', dockerfile: 'dockerfile', docker: 'dockerfile',
    makefile: 'makefile', cmake: 'cmake',
  };
  return langMap[ext.toLowerCase()] || 'text';
}

/** Read a specific file from a plugin's directory, with home-dir security check */
export async function readPluginFile(
  plugin: { type: string; sourcePath: string | null; agentSetPath?: string | null },
  fileParts: string[]
): Promise<{ content: string; language: string; name: string; path: string; size: number } | { error: string; status: number }> {
  const homeDir = homedir();
  let filePath: string;

  if (plugin.type === 'skill') {
    filePath = path.join(path.dirname(plugin.sourcePath!), ...fileParts);
  } else if (plugin.type === 'agent_set') {
    filePath = path.join(plugin.agentSetPath!, ...fileParts);
  } else {
    filePath = plugin.sourcePath!;
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(homeDir)) return { error: 'Access denied', status: 403 };
  if (!existsSync(filePath)) return { error: 'File not found', status: 404 };

  const stats = await fs.stat(filePath);
  if (stats.isDirectory()) return { error: 'Is a directory', status: 400 };

  const content = await fs.readFile(filePath, 'utf-8');
  const ext = fileParts[fileParts.length - 1]?.split('.').pop() || '';
  return {
    name: fileParts[fileParts.length - 1],
    path: fileParts.join('/'),
    content,
    language: getLanguageFromExtension(ext),
    size: stats.size,
  };
}

/** Save a file within a plugin's directory, with security check */
export async function savePluginFile(
  plugin: { type: string; sourcePath: string | null; agentSetPath?: string | null; storageType: string },
  filePath: string,
  content: string
): Promise<{ success: boolean } | { error: string; status: number }> {
  if (plugin.storageType !== 'local') return { error: 'Only local components can be edited', status: 403 };

  const basePath = plugin.type === 'agent_set' ? plugin.agentSetPath : plugin.sourcePath;
  if (!basePath) return { error: 'Component path not found', status: 404 };

  let fullPath: string;
  if (plugin.type === 'skill') {
    fullPath = path.join(path.dirname(plugin.sourcePath!), filePath);
  } else if (plugin.type === 'agent_set') {
    fullPath = path.join(basePath, filePath);
  } else {
    fullPath = plugin.sourcePath!;
  }

  const resolved = path.resolve(fullPath);
  const pluginBaseDir = path.resolve(path.dirname(basePath));
  if (!resolved.startsWith(pluginBaseDir + path.sep) && resolved !== pluginBaseDir) {
    return { error: 'Access denied: path outside plugin directory', status: 403 };
  }
  if (!resolved.startsWith(homedir())) return { error: 'Access denied', status: 403 };

  const dirPath = path.dirname(fullPath);
  if (!existsSync(dirPath)) await fs.mkdir(dirPath, { recursive: true });

  await fs.writeFile(fullPath, content, 'utf-8');
  return { success: true };
}

/** List files from an arbitrary source path (for discovered components), with home-dir security check */
export async function listSourcePathFiles(
  sourcePath: string,
  type: 'skill' | 'command' | 'agent',
  buildTree: (dirPath: string, rel?: string) => Promise<FileNode[]>
): Promise<{ files: FileNode[] } | { error: string; status: number }> {
  const resolved = path.resolve(sourcePath);
  if (!resolved.startsWith(homedir())) return { error: 'Access denied', status: 403 };
  if (!existsSync(sourcePath)) return { error: 'Source path not found', status: 404 };
  if (type === 'skill') return { files: await buildTree(sourcePath, '') };
  const fileName = sourcePath.split('/').pop()!;
  return { files: [{ name: fileName, path: fileName, type: 'file' }] };
}

/** Read file content from a basePath + filePath, with home-dir security check */
export async function readSourceFileContent(
  basePath: string,
  filePath: string
): Promise<{ name: string; path: string; content: string; language: string; size: number } | { error: string; status: number }> {
  let fullPath: string;
  try {
    const stats = await fs.stat(basePath);
    fullPath = stats.isFile() ? basePath : path.join(basePath, filePath);
  } catch {
    return { error: 'File not found', status: 404 };
  }

  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(homedir())) return { error: 'Access denied', status: 403 };
  if (!existsSync(fullPath)) return { error: 'File not found', status: 404 };

  const stats = await fs.stat(fullPath);
  if (stats.isDirectory()) return { error: 'Is a directory', status: 400 };

  const content = await fs.readFile(fullPath, 'utf-8');
  const ext = filePath.split('.').pop() || '';
  return {
    name: filePath.split('/').pop() || filePath,
    path: filePath,
    content,
    language: getLanguageFromExtension(ext),
    size: stats.size,
  };
}
