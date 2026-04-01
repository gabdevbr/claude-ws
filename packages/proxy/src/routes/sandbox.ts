/**
 * Sandbox Management Routes — Project and key CRUD for the proxy.
 */
import type { FastifyInstance } from 'fastify';
import type { ContainerPool } from '../services/container-pool';
import type { KeyStore } from '../services/key-store';
import { nanoid } from 'nanoid';

interface SandboxDeps {
  pool: ContainerPool;
  keyStore: KeyStore;
}

export async function registerSandboxRoutes(app: FastifyInstance, deps: SandboxDeps) {
  const { pool, keyStore } = deps;

  // ========== Projects ==========

  // List all projects with container status
  app.get('/api/sandbox/projects', async () => {
    return pool.listAll();
  });

  // Create project → allocate container + generate API key
  // projectId is optional — auto-generated if not provided (like MongoDB ObjectId)
  app.post<{ Body: { projectId?: string; projectName: string } }>(
    '/api/sandbox/projects',
    async (req) => {
      const { projectName } = req.body;
      const projectId = req.body.projectId || nanoid(24);
      const container = await pool.createProject(projectId, projectName);
      const { id: keyId, rawKey } = await keyStore.create(projectId, 'default');
      // Auto-start container so it's immediately ready
      await pool.ensureRunning(projectId);
      return { ...container, status: 'running', apiKey: rawKey, apiKeyId: keyId };
    },
  );

  // Start project container
  app.post<{ Params: { projectId: string } }>(
    '/api/sandbox/projects/:projectId/start',
    async (req) => {
      await pool.start(req.params.projectId);
      return { success: true };
    },
  );

  // Stop project container
  app.post<{ Params: { projectId: string } }>(
    '/api/sandbox/projects/:projectId/stop',
    async (req) => {
      await pool.stop(req.params.projectId);
      return { success: true };
    },
  );

  // Delete project + container
  app.delete<{ Params: { projectId: string } }>(
    '/api/sandbox/projects/:projectId',
    async (req) => {
      await pool.remove(req.params.projectId);
      return { success: true };
    },
  );

  // Health check for a specific project container
  app.get<{ Params: { projectId: string } }>(
    '/api/sandbox/projects/:projectId/health',
    async (req) => {
      const container = await pool.getByProject(req.params.projectId);
      if (!container) return { status: 'not_found' };
      return { status: container.status, port: container.port };
    },
  );

  // ========== Project Env Overrides ==========

  // Get per-project env overrides
  app.get<{ Params: { projectId: string } }>(
    '/api/sandbox/projects/:projectId/env',
    async (req) => {
      return pool.getCustomEnv(req.params.projectId);
    },
  );

  // Update per-project env overrides (hot-reload via .env.sandbox file)
  app.put<{ Params: { projectId: string }; Body: Record<string, string> }>(
    '/api/sandbox/projects/:projectId/env',
    async (req) => {
      const { projectId } = req.params;
      await pool.setCustomEnv(projectId, req.body);

      // Write .env.sandbox to mounted data dir so core picks it up without restart
      const container = await pool.getByProject(projectId);
      if (container?.dataPath) {
        const { writeFileSync, mkdirSync } = await import('fs');
        mkdirSync(container.dataPath, { recursive: true });
        const lines = Object.entries(req.body)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}=${v}`);
        writeFileSync(`${container.dataPath}/.env.sandbox`, lines.join('\n') + '\n');
      }

      return { success: true };
    },
  );

  // ========== API Keys ==========

  // Create API key
  app.post<{ Body: { projectId: string; name?: string } }>(
    '/api/sandbox/keys',
    async (req) => {
      const { projectId, name } = req.body;
      return keyStore.create(projectId, name);
    },
  );

  // List keys for project
  app.get<{ Querystring: { projectId: string } }>(
    '/api/sandbox/keys',
    async (req) => {
      return keyStore.listForProject(req.query.projectId);
    },
  );

  // Revoke key
  app.delete<{ Params: { keyId: string } }>(
    '/api/sandbox/keys/:keyId',
    async (req) => {
      await keyStore.revoke(req.params.keyId);
      return { success: true };
    },
  );

  // ========== Pool Status ==========

  app.get('/api/sandbox/pool', async () => {
    return pool.getStatus();
  });
}
