/**
 * Agent Factory plugin dependency operations: extractDependencies and installDependency.
 * Split from agent-factory-plugin-registry.ts to keep files under 200 lines.
 */
import path from 'path';
import * as schema from '../../db/database-schema';
import { dependencyExtractor } from './dependency-extractor';
import { claudeDependencyAnalyzer } from './claude-dependency-analyzer';
import { installScriptGenerator } from './install-script-generator';

export class AgentFactoryValidationError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AgentFactoryValidationError';
  }
}

/**
 * Extract dependencies from a plugin source path using regex or Claude analysis.
 * Returns libraries, plugins, install scripts, and dependency tree metadata.
 */
export async function extractDependencies(
  sourcePath: string,
  type: string,
  useClaude?: boolean
): Promise<any> {
  const { existsSync } = await import('fs');
  const { homedir } = await import('os');
  const resolvedPath = path.resolve(sourcePath);
  if (!resolvedPath.startsWith(homedir())) {
    throw new AgentFactoryValidationError('Access denied', 403);
  }
  if (!existsSync(sourcePath)) {
    throw new AgentFactoryValidationError('Source path not found', 404);
  }

  let extracted;
  if (useClaude) {
    const analyzed = await claudeDependencyAnalyzer.analyze(sourcePath, type);
    extracted = { libraries: analyzed.libraries, plugins: analyzed.plugins };
  } else {
    extracted = await dependencyExtractor.extract(sourcePath, type);
  }

  const installScripts = installScriptGenerator.generateAll(extracted.libraries);
  const dependencyTree = (extracted.plugins || []).map((c: any) => ({
    type: c.type, name: c.name, depth: 1,
  }));

  return {
    libraries: extracted.libraries,
    plugins: extracted.plugins || [],
    installScripts,
    dependencyTree,
    depth: 1,
    hasCycles: false,
    totalPlugins: (extracted.plugins || []).length,
    resolvedAt: Date.now(),
    analysisMethod: useClaude ? 'claude-sdk' : 'regex',
  };
}

/**
 * Mark a plugin dependency as installed in the database and return the install command.
 */
export async function installDependency(db: any, id: string): Promise<any> {
  const { eq } = await import('drizzle-orm');
  const dep = await db.select().from(schema.pluginDependencies)
    .where(eq(schema.pluginDependencies.id, id)).get();
  if (!dep) return null;

  let installCommand = '';
  if (dep.dependencyType === 'python') installCommand = `pip install ${dep.spec}`;
  else if (dep.dependencyType === 'npm') installCommand = `npm install ${dep.spec}`;
  else if (dep.dependencyType === 'system') installCommand = `# System package: ${dep.spec}`;

  await db.update(schema.pluginDependencies)
    .set({ installed: true })
    .where(eq(schema.pluginDependencies.id, id));

  return { success: true, message: 'Dependency marked as installed', installCommand };
}
