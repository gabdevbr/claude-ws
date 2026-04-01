/**
 * Core Server — Standalone Fastify + Socket.io server for sandbox mode.
 *
 * This is the per-project container entry point. It uses createApp() from
 * agentic-sdk to get ALL API routes (90+), then adds sandbox-specific
 * extras: .env.sandbox hot-reload, MinIO sync, Socket.io events.
 *
 * Replaces the old manual HTTP handler that only had ~15 routes.
 */

// ── 1. Load environment BEFORE anything else ──

import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';
import { existsSync, watchFile, readFileSync, mkdirSync, symlinkSync, lstatSync, rmSync } from 'fs';
import { homedir } from 'os';

const userCwd = process.env.CLAUDE_WS_USER_CWD || process.cwd();
dotenvConfig({ path: join(userCwd, '.env') });

// Load sandbox env overrides from mounted data dir (hot-reloadable)
const sandboxEnvPath = '/app/data/.env.sandbox';
function loadSandboxEnv() {
  if (!existsSync(sandboxEnvPath)) return;
  const content = readFileSync(sandboxEnvPath, 'utf-8');
  for (const line of content.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.substring(0, idx).trim();
      const value = line.substring(idx + 1).trim();
      if (key && value) process.env[key] = value;
    }
  }
}
loadSandboxEnv();

// Watch for changes — hot-reload env without restart
watchFile(sandboxEnvPath, { interval: 2000 }, () => {
  console.log('[Core] .env.sandbox changed, reloading env...');
  loadSandboxEnv();
});

// ── 2. Pre-import setup ──

import { applyClaudeCodeSettingsFallback } from '../../src/lib/claude-code-settings';
applyClaudeCodeSettingsFallback();

// Enable SDK file checkpointing, disable Claude Code env markers
process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';
delete process.env.CLAUDECODE;

// Persist session files in mounted volume so SessionManager can validate/auto-fix.
// SDK stores sessions at ~/.claude/projects/ — symlink to /app/data/sessions (persistent).
const sessionPersistDir = '/app/data/sessions';
const claudeProjectsDir = join(homedir(), '.claude', 'projects');
try {
  mkdirSync(sessionPersistDir, { recursive: true });
  mkdirSync(join(homedir(), '.claude'), { recursive: true });
  if (!existsSync(claudeProjectsDir)) {
    symlinkSync(sessionPersistDir, claudeProjectsDir);
  } else if (!lstatSync(claudeProjectsDir).isSymbolicLink()) {
    rmSync(claudeProjectsDir, { recursive: true, force: true });
    symlinkSync(sessionPersistDir, claudeProjectsDir);
  }
} catch (err) {
  console.warn('[Core] Failed to symlink session dir:', err);
}

// Run data migrations
import { runMigrations } from '../../src/lib/migrations/migration-runner';
runMigrations();

// ── 3. Imports ──

import { createApp, loadEnvConfig } from '../../packages/agentic-sdk/src/index';
import { setupSocketAndEvents } from '../../src/lib/setup-socket-and-events';
import { getMinioPullQueueWorker, enqueueProjectPullSync } from '../../src/lib/minio-pull-queue';
import { getMinioPushQueueWorker, enqueueProjectPushSync } from '../../src/lib/minio-push-queue';
import { createLogger } from '../../src/lib/logger';

const log = createLogger('CoreServer');
const projectId = process.env.PROJECT_ID || '';

// ── 4. Main ──

async function main() {
  // Load env config AFTER .env.sandbox is loaded
  const envConfig = loadEnvConfig();

  // Override dataDir for container — always /app/data
  const containerEnvConfig = {
    ...envConfig,
    dataDir: '/app/data',
  };

  // Create Fastify app with ALL agentic-sdk routes (90+)
  const app = await createApp(containerEnvConfig);

  // ── Add MinIO sync routes (not in SDK) ──

  app.post('/api/sync/minio/push', async (request, reply) => {
    const body = request.body as any;
    const pid = body?.projectId?.trim() || projectId;
    if (!pid) return reply.code(400).send({ error: 'projectId is required' });
    const project = await app.services.project.getById(pid);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const result = await enqueueProjectPushSync(project.path, project.id);
    return reply.code(202).send({ success: true, accepted: true, ...result });
  });

  app.post('/api/sync/minio/pull', async (request, reply) => {
    const body = request.body as any;
    const pid = body?.projectId?.trim() || projectId;
    if (!pid) return reply.code(400).send({ error: 'projectId is required' });
    const project = await app.services.project.getById(pid);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const result = await enqueueProjectPullSync(project.path, project.id);
    return reply.code(202).send({ success: true, accepted: true, ...result });
  });

  // ── Start Fastify (creates the underlying HTTP server) ──

  const port = containerEnvConfig.port;
  await app.listen({ port, host: '0.0.0.0' });
  log.info(`> Core Fastify ready on http://0.0.0.0:${port}`);
  if (projectId) log.info(`> Serving project: ${projectId}`);

  // ── Wire Socket.io to Fastify's HTTP server ──

  const corsOrigins = process.env.CORS_ORIGIN
    ? [process.env.CORS_ORIGIN]
    : ['http://localhost:3000', 'http://localhost:4000', 'http://localhost:5000'];

  const { shutdown } = await setupSocketAndEvents(app.server, {
    userCwd,
    corsOrigins,
  });

  // ── Start MinIO queue workers ──

  const minioPullQueueWorker = getMinioPullQueueWorker();
  const minioPushQueueWorker = getMinioPushQueueWorker();
  minioPullQueueWorker.start();
  minioPushQueueWorker.start();

  // ── Graceful shutdown ──

  const handleShutdown = (signal: string) => {
    minioPullQueueWorker.stop();
    minioPushQueueWorker.stop();
    shutdown(signal);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

main().catch((err) => {
  log.error({ err }, '[CoreServer] Failed to start');
  process.exit(1);
});
