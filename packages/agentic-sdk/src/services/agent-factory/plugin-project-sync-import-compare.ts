/**
 * Agent Factory plugin project-level operations: syncProject, getInstalledComponents,
 * uninstallComponent, importPlugin, comparePlugins.
 * Split from agent-factory-plugin-registry.ts to keep files under 200 lines.
 */
import path from 'path';
import * as schema from '../../db/database-schema';
import { generateId } from '../../lib/nanoid-id-generator';

/**
 * Import a plugin from an external source path into the agent-factory data directory.
 * Copies files and registers a DB record with storageType 'imported'.
 */
export async function importPlugin(
  db: any,
  data: { type: string; name: string; description?: string; sourcePath: string; metadata?: string }
): Promise<any> {
  const { type, name, description, sourcePath, metadata } = data;
  if (!type || !name || !sourcePath) return null;

  const { existsSync } = await import('fs');
  const { cp, readFile, writeFile, mkdir } = await import('fs/promises');

  if (!existsSync(sourcePath)) return null;

  const homeDir = (await import('os')).homedir();
  const dataDir = process.env.DATA_DIR || path.join(homeDir, 'data');
  const afDir = path.join(dataDir, 'agent-factory');
  const typeDir = path.join(afDir, `${type}s`);

  await mkdir(typeDir, { recursive: true });

  let targetPath: string;
  if (type === 'skill') {
    targetPath = path.join(typeDir, name);
    await cp(sourcePath, targetPath, { recursive: true });
  } else {
    const fileName = path.basename(sourcePath);
    targetPath = path.join(typeDir, fileName);
    const content = await readFile(sourcePath, 'utf-8');
    await writeFile(targetPath, content, 'utf-8');
  }

  const id = generateId('plg');
  const now = Date.now();
  const record = {
    id, type, name,
    description: description || null,
    sourcePath: targetPath,
    storageType: 'imported' as const,
    metadata: metadata || null,
    createdAt: now, updatedAt: now,
  };
  await db.insert(schema.agentFactoryPlugins).values(record);
  return record;
}

/**
 * Compare discovered plugins against imported ones by file modification time.
 * Returns each with a status of 'new', 'update', or 'current'.
 */
export async function comparePlugins(
  db: any,
  discovered: Array<{ type: string; name: string; description?: string; sourcePath: string; metadata?: any }>
): Promise<{ plugins: any[] }> {
  const { existsSync } = await import('fs');
  const { stat } = await import('fs/promises');

  const imported = await db.select().from(schema.agentFactoryPlugins)
    .where((await import('drizzle-orm')).eq(schema.agentFactoryPlugins.storageType, 'imported' as any)).all();

  const result: Array<any> = [];
  for (const comp of discovered) {
    const existing = imported.find((c: any) => c.type === comp.type && c.name === comp.name);
    if (!existing) { result.push({ ...comp, status: 'new' }); continue; }

    const sourceExists = comp.sourcePath && existsSync(comp.sourcePath);
    const importedExists = existing.sourcePath && existsSync(existing.sourcePath);
    if (!sourceExists || !importedExists) { result.push({ ...comp, status: 'new' }); continue; }

    try {
      const sourceStats = await stat(comp.sourcePath);
      const importedStats = await stat(existing.sourcePath!);
      if (sourceStats.mtimeMs > importedStats.mtimeMs) {
        result.push({ ...comp, status: 'update', existingPlugin: { id: existing.id, sourcePath: existing.sourcePath, updatedAt: existing.updatedAt } });
      } else {
        result.push({ ...comp, status: 'current', existingPlugin: { id: existing.id, sourcePath: existing.sourcePath, updatedAt: existing.updatedAt } });
      }
    } catch { result.push({ ...comp, status: 'new' }); }
  }
  return { plugins: result };
}

/**
 * Sync selected components from the agent-factory data directory into the project's .claude directory.
 * Reads project-settings.json to determine which components to copy, then updates config.json.
 */
export async function syncProject(db: any, projectId: string, projectPath: string): Promise<any> {
  const { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, readFileSync, writeFileSync } = await import('fs');

  function copyDirectory(src: string, dest: string) {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const s = path.join(src, entry.name), d = path.join(dest, entry.name);
      entry.isDirectory() ? copyDirectory(s, d) : copyFileSync(s, d);
    }
  }

  const settingsPath = path.join(projectPath, '.claude', 'project-settings.json');
  if (!existsSync(settingsPath)) return { success: false, error: 'Project settings not found' };
  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  const allIds = [...(settings.selectedComponents || []), ...(settings.selectedAgentSets || [])];
  if (allIds.length === 0) return { success: true, installed: [], skipped: [], errors: [] };

  const allComponents = await db.select().from(schema.agentFactoryPlugins).all();
  const selected = allComponents.filter((c: any) => allIds.includes(c.id));
  const claudeDir = path.join(projectPath, '.claude');
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

  const installed: string[] = [], skipped: string[] = [], errors: string[] = [];

  for (const comp of selected) {
    try {
      const sourcePath = comp.type === 'agent_set' ? comp.agentSetPath : comp.sourcePath;
      if (!sourcePath || !existsSync(sourcePath)) { errors.push(`${comp.name}: Source not found`); continue; }

      if (comp.type === 'skill') {
        let skillSrc = sourcePath;
        if (!statSync(sourcePath).isDirectory()) skillSrc = path.dirname(sourcePath);
        const target = path.join(claudeDir, 'skills', comp.name);
        if (existsSync(target)) rmSync(target, { recursive: true, force: true });
        mkdirSync(target, { recursive: true });
        copyDirectory(skillSrc, target);
        installed.push(`skill: ${comp.name}`);
      } else if (comp.type === 'command' || comp.type === 'agent') {
        const dir = path.join(claudeDir, `${comp.type}s`);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const fileName = path.basename(sourcePath);
        copyFileSync(sourcePath, path.join(dir, fileName));
        installed.push(`${comp.type}: ${comp.name}`);
      } else if (comp.type === 'agent_set') {
        for (const subdir of ['skills', 'commands', 'agents']) {
          const src = path.join(sourcePath, subdir);
          if (!existsSync(src)) continue;
          for (const entry of readdirSync(src, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const s = path.join(src, entry.name), targetDir = path.join(claudeDir, subdir);
            if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
            if (entry.isDirectory()) {
              const t = path.join(targetDir, entry.name);
              if (existsSync(t)) rmSync(t, { recursive: true, force: true });
              copyDirectory(s, t);
            } else {
              copyFileSync(s, path.join(targetDir, entry.name));
            }
            installed.push(`agent-set: ${subdir}/${entry.name}`);
          }
        }
      }
    } catch (e: any) { errors.push(`${comp.name}: ${e.message}`); }
  }

  const configPath = path.join(claudeDir, 'config.json');
  let config: any = {};
  try { if (existsSync(configPath)) config = JSON.parse(readFileSync(configPath, 'utf-8')); } catch {}
  config.components = allIds;
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  return { success: true, installed, skipped, errors };
}

/**
 * Check which selected components are actually installed in the project's .claude directory.
 */
export async function getInstalledComponents(
  db: any, projectId: string, projectPath: string
): Promise<{ installed: string[] }> {
  const { existsSync, readFileSync, readdirSync } = await import('fs');

  const settingsPath = path.join(projectPath, '.claude', 'project-settings.json');
  if (!existsSync(settingsPath)) return { installed: [] };

  let settings;
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { return { installed: [] }; }
  const allIds = [...(settings.selectedComponents || []), ...(settings.selectedAgentSets || [])];
  if (allIds.length === 0) return { installed: [] };

  const allComponents = await db.select().from(schema.agentFactoryPlugins).all();
  const selected = allComponents.filter((c: any) => allIds.includes(c.id));
  const claudeDir = path.join(projectPath, '.claude');

  const installed = selected.filter((c: any) => {
    switch (c.type) {
      case 'skill': return existsSync(path.join(claudeDir, 'skills', c.name));
      case 'command': return existsSync(path.join(claudeDir, 'commands', `${c.name}.md`));
      case 'agent': return existsSync(path.join(claudeDir, 'agents', `${c.name}.md`));
      case 'agent_set': {
        if (!c.agentSetPath || !existsSync(c.agentSetPath)) return false;
        for (const subdir of ['skills', 'commands', 'agents']) {
          const src = path.join(c.agentSetPath, subdir);
          if (!existsSync(src)) continue;
          for (const entry of readdirSync(src, { withFileTypes: true })) {
            if (!entry.name.startsWith('.') && existsSync(path.join(claudeDir, subdir, entry.name))) return true;
          }
        }
        return false;
      }
      default: return false;
    }
  }).map((c: any) => c.id);

  return { installed };
}

/**
 * Uninstall a component from the project's .claude directory and update settings/config files.
 */
export async function uninstallComponent(
  db: any, projectId: string, componentId: string, projectPath: string,
  getPlugin: (id: string) => Promise<any>
): Promise<any> {
  const { existsSync, readFileSync, writeFileSync, rmSync, readdirSync } = await import('fs');

  const component = await getPlugin(componentId);
  if (!component) return { success: false, error: 'Component not found' };

  const claudeDir = path.join(projectPath, '.claude');

  switch (component.type) {
    case 'skill': {
      const dir = path.join(claudeDir, 'skills', component.name);
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      break;
    }
    case 'command': {
      const file = path.join(claudeDir, 'commands', `${component.name}.md`);
      if (existsSync(file)) rmSync(file, { force: true });
      break;
    }
    case 'agent': {
      const file = path.join(claudeDir, 'agents', `${component.name}.md`);
      if (existsSync(file)) rmSync(file, { force: true });
      break;
    }
    case 'agent_set': {
      if (component.agentSetPath && existsSync(component.agentSetPath)) {
        for (const subdir of ['skills', 'commands', 'agents']) {
          const src = path.join(component.agentSetPath, subdir);
          if (!existsSync(src)) continue;
          for (const entry of readdirSync(src, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const target = path.join(claudeDir, subdir, entry.name);
            if (existsSync(target)) rmSync(target, { recursive: true, force: true });
          }
        }
      }
      break;
    }
  }

  const settingsPath = path.join(claudeDir, 'project-settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      if (component.type === 'agent_set') {
        settings.selectedAgentSets = (settings.selectedAgentSets || []).filter((id: string) => id !== componentId);
      } else {
        settings.selectedComponents = (settings.selectedComponents || []).filter((id: string) => id !== componentId);
      }
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch {}
  }

  const configPath = path.join(claudeDir, 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (Array.isArray(config.components)) {
        config.components = config.components.filter((id: string) => id !== componentId);
        writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      }
    } catch {}
  }

  return { success: true, message: `Uninstalled ${component.name}` };
}
