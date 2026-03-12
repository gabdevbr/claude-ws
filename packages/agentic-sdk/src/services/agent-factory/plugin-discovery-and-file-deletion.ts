/**
 * Agent Factory plugin discovery (scan .claude/agentfactory/) and file deletion helpers.
 * Split from agent-factory-plugin-registry.ts to keep files under 200 lines.
 */
import fs from 'fs/promises';
import path from 'path';

/**
 * Scan basePath/.claude/agentfactory/{skills,commands,agents} for plugin directories.
 * Returns discovered plugins with name, type, and sourcePath.
 */
export async function discoverAgentFactoryPlugins(
  basePath: string
): Promise<Array<{ name: string; type: string; sourcePath: string }>> {
  const agentFactoryDir = path.join(basePath, '.claude', 'agentfactory');
  const discovered: Array<{ name: string; type: string; sourcePath: string }> = [];

  async function scanDir(dir: string, type: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          discovered.push({ name: entry.name, type, sourcePath: path.join(dir, entry.name) });
        }
      }
    } catch { /* directory may not exist */ }
  }

  await Promise.all([
    scanDir(path.join(agentFactoryDir, 'skills'), 'skill'),
    scanDir(path.join(agentFactoryDir, 'commands'), 'command'),
    scanDir(path.join(agentFactoryDir, 'agents'), 'agent'),
  ]);

  return discovered;
}

/**
 * Delete a plugin's files from disk (only if within agent-factory/ directory),
 * then remove the DB record. Skills: delete parent dir. Agent sets: recursive delete. Others: single file.
 */
export async function deletePluginWithFiles(
  existing: any,
  deletePluginFromDb: (id: string) => Promise<void>
): Promise<void> {
  const { existsSync } = await import('fs');
  const { rm } = await import('fs/promises');
  const { dirname: dirnameFs } = await import('path');

  let shouldDeleteFiles = false;
  let deletePath: string | null = null;

  if (existing.storageType === 'local' || existing.storageType === 'imported') {
    if (existing.type === 'agent_set') {
      shouldDeleteFiles = !!(existing.agentSetPath && existing.agentSetPath.includes('/agent-factory/'));
      deletePath = existing.agentSetPath || null;
    } else {
      shouldDeleteFiles = !!(existing.sourcePath && existing.sourcePath.includes('/agent-factory/'));
      deletePath = existing.sourcePath || null;
    }
  }

  if (shouldDeleteFiles && deletePath && existsSync(deletePath)) {
    try {
      if (existing.type === 'skill') {
        await rm(dirnameFs(deletePath), { recursive: true, force: true });
      } else if (existing.type === 'agent_set') {
        await rm(deletePath, { recursive: true, force: true });
      } else {
        await rm(deletePath, { force: true });
      }
    } catch { /* continue with DB deletion even if file deletion fails */ }
  }

  await deletePluginFromDb(existing.id);
}
