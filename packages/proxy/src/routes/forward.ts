/**
 * Forward Routes — HTTP reverse proxy to core containers.
 *
 * Intercepts project creation to allocate containers first,
 * then forwards all other /api/* requests to the correct core.
 * Injects provider keys from proxy env + per-project overrides via headers.
 */
import type { FastifyInstance } from 'fastify';
import type { ContainerPool } from '../services/container-pool';
import type { KeyStore } from '../services/key-store';

interface ForwardDeps {
  pool: ContainerPool;
  keyStore: KeyStore;
}

/** Provider key names mapped to the headers the core expects. */
const PROVIDER_ENV_TO_HEADER: Record<string, string> = {
  ANTHROPIC_AUTH_TOKEN: 'x-provider-anthropic-auth-token',
  ANTHROPIC_API_KEY: 'x-provider-anthropic-auth-token', // alias → same header
  ANTHROPIC_BASE_URL: 'x-provider-anthropic-base-url',
  ANTHROPIC_MODEL: 'x-provider-anthropic-model',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'x-provider-anthropic-default-opus-model',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'x-provider-anthropic-default-sonnet-model',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'x-provider-anthropic-default-haiku-model',
};

/** Build provider headers for a project: proxy env merged with per-project overrides. */
async function buildProviderHeaders(pool: ContainerPool, projectId: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  // Start with proxy's own env
  for (const [envKey, headerName] of Object.entries(PROVIDER_ENV_TO_HEADER)) {
    const value = process.env[envKey];
    if (value && !headers[headerName]) {
      headers[headerName] = value;
    }
  }

  // Override with per-project custom env (stored in DB)
  const customEnv = await pool.getCustomEnv(projectId);
  if (customEnv) {
    for (const [envKey, headerName] of Object.entries(PROVIDER_ENV_TO_HEADER)) {
      if (customEnv[envKey]) {
        headers[headerName] = customEnv[envKey];
      }
    }
  }

  return headers;
}

/** Hook env keys that the proxy resolves for containers. */
const HOOK_ENV_KEYS = ['API_HOOK_URL', 'API_HOOK_URL_DOMAIN', 'API_HOOK_URL_LOCAL', 'API_HOOK_API_KEY'] as const;

/** Build hook-related headers for a project. */
async function buildHookHeaders(pool: ContainerPool, projectId: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  // From proxy env
  for (const key of HOOK_ENV_KEYS) {
    if (process.env[key]) headers[`x-hook-${key.toLowerCase().replace(/_/g, '-')}`] = process.env[key]!;
  }

  // Per-project overrides
  const customEnv = await pool.getCustomEnv(projectId);
  if (customEnv) {
    for (const key of HOOK_ENV_KEYS) {
      if (customEnv[key]) headers[`x-hook-${key.toLowerCase().replace(/_/g, '-')}`] = customEnv[key];
    }
  }

  return headers;
}

export async function registerForwardRoutes(app: FastifyInstance, deps: ForwardDeps) {
  const { pool, keyStore } = deps;
  const dataBase = process.env.POOL_DATA_BASE || '/data/sandbox';

  // ── Intercept: POST /api/projects ──
  // Board creates project here. Proxy must allocate a container first,
  // then forward to the core so it creates the DB record.
  app.post('/api/projects', async (req, reply) => {
    const body = req.body as any;
    const projectName = body?.name || body?.projectName;
    const projectId = body?.id || body?.projectId || require('nanoid').nanoid(8);

    if (!projectName) {
      return reply.code(400).send({ error: 'projectName required' });
    }

    // Check if container already exists, allocate if not
    const existing = await pool.getByProject(projectId);
    const container = existing || await (async () => {
      const c = await pool.createProject(projectId, projectName);
      await keyStore.create(projectId, 'default');
      return c;
    })();

    // Start container so it can handle the project creation in its DB
    const { port } = await pool.ensureRunning(projectId);

    // Forward to core to create the project record in its DB
    const projectPath = `${dataBase}/${projectId}/workspace`;
    try {
      const coreApiKey = process.env.API_ACCESS_KEY || '';
      const response = await fetch(`http://localhost:${port}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(coreApiKey ? { 'x-api-key': coreApiKey } : {}) },
        body: JSON.stringify({ id: projectId, name: projectName, path: projectPath, ...body }),
      });
      const result = await response.json().catch(() => ({}));
      // Ensure path is correct in response
      reply.code(response.status).send({ ...result, path: projectPath });
    } catch (error: any) {
      // Core might not have /api/projects endpoint yet, return container info
      reply.code(201).send({
        id: projectId,
        name: projectName,
        path: projectPath,
        port: container.port,
        status: container.status,
      });
    }
  });

  // ── Intercept: GET /api/projects ──
  // Board lists projects here. In sandbox mode, return all projects from proxy DB
  // instead of forwarding to a single core container.
  app.get('/api/projects', async (req, reply) => {
    const containers = await pool.listAll();
    const projects = containers
      .filter((c: any) => !c.projectId.startsWith('__pool__'))
      .map((c: any) => ({
        id: c.projectId,
        name: c.projectName || c.projectId,
        path: `${dataBase}/${c.projectId}/workspace`,
        status: c.status === 'running' ? 'in_progress' : 'todo',
        createdAt: c.createdAt,
        updatedAt: c.createdAt,
      }));
    return reply.send(projects);
  });

  // ── Hook relay: /api/hooks/* ──
  // Containers call this instead of API_HOOK_URL directly.
  // Proxy resolves the real hook destination and injects API_HOOK_API_KEY.
  app.all('/api/hooks/:projectId/*', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    // Verify container exists
    const container = await pool.getByProject(projectId);
    if (!container) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    // Resolve hook destination from proxy env + per-project overrides
    const customEnv = await pool.getCustomEnv(projectId) || {};
    const hookUrlTemplate = customEnv['API_HOOK_URL'] || process.env.API_HOOK_URL || '';
    const hookApiKey = customEnv['API_HOOK_API_KEY'] || process.env.API_HOOK_API_KEY || '';

    if (!hookUrlTemplate) {
      return reply.code(503).send({ error: 'API_HOOK_URL not configured on proxy' });
    }

    // Resolve {room_id} placeholder in hook URL template
    const hookUrl = hookUrlTemplate
      .replace(/\{room_id\}/gi, projectId)
      .replace(/room_id/gi, projectId);

    // Build upstream URL: strip /api/hooks/:projectId prefix, forward the rest.
    // API_HOOK_URL typically ends with /files/ and container sends /files/manifest —
    // deduplicate the overlapping /files/ segment.
    const fullPath = req.url;
    const prefixLen = `/api/hooks/${projectId}`.length;
    const remainingPath = fullPath.slice(prefixLen) || '/';
    const baseUrl = hookUrl.replace(/\/+$/, '');
    // Remove overlapping path: if hookUrl ends with /files and remainingPath starts with /files
    const baseSegments = baseUrl.split('/');
    const lastBaseSegment = baseSegments[baseSegments.length - 1];
    const cleanRemaining = remainingPath.startsWith(`/${lastBaseSegment}/`) || remainingPath === `/${lastBaseSegment}`
      ? remainingPath.slice(lastBaseSegment.length + 1)
      : remainingPath;
    const upstreamUrl = `${baseUrl}${cleanRemaining}`;

    try {
      const skipHeaders = new Set(['host', 'transfer-encoding', 'content-length', 'connection']);
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && !skipHeaders.has(key)) headers[key] = value;
      }
      // Inject the hook API key
      if (hookApiKey) {
        headers['x-api-key'] = hookApiKey;
      }

      const response = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
      });

      const responseBody = await response.text();
      // Filter out hop-by-hop and encoding headers — response.text() already decompresses
      const skipResponseHeaders = new Set([
        'transfer-encoding', 'content-length', 'connection', 'keep-alive', 'content-encoding',
      ]);
      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of response.headers.entries()) {
        if (!skipResponseHeaders.has(key.toLowerCase())) responseHeaders[key] = value;
      }
      reply
        .code(response.status)
        .headers(responseHeaders)
        .send(responseBody);
    } catch (error: any) {
      console.error(`[Proxy] Hook relay error: ${upstreamUrl}`, error.message);
      reply.code(502).send({ error: 'Hook relay failed', message: error.message });
    }
  });

  // ── Forward: all other /api/* ──
  app.all('/api/*', async (req, reply) => {
    const pathname = req.url;

    // Skip sandbox management routes (handled by sandbox.ts) and hook relay
    if (pathname.startsWith('/api/sandbox/')) return;
    if (pathname.startsWith('/api/hooks/')) return;

    // Resolve projectId from multiple sources:
    // 1. Sandbox API key (external clients)
    // 2. x-project-id header (board in sandbox mode)
    // 3. Request body projectId field
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const projectIdHeader = req.headers['x-project-id'] as string | undefined;

    let projectId: string | null = null;

    // Try sandbox API key first
    if (apiKey) {
      projectId = await keyStore.validate(apiKey, projectIdHeader || undefined);
    }

    // Fallback: x-project-id header (board sends this in sandbox mode)
    if (!projectId && projectIdHeader) {
      const container = await pool.getByProject(projectIdHeader);
      if (container) projectId = projectIdHeader;
    }

    // Fallback: extract projectId from request body
    if (!projectId && req.body) {
      const body = req.body as any;
      const bodyProjectId = body.projectId || body.project_id;
      if (bodyProjectId) {
        const container = await pool.getByProject(bodyProjectId);
        if (container) projectId = bodyProjectId;
      }
    }

    if (!projectId) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Valid API key or project ID required' });
    }

    // Ensure container is running (lazy start)
    let containerInfo: { port: number };
    try {
      containerInfo = await pool.ensureRunning(projectId);
    } catch (error: any) {
      return reply.code(503).send({ error: 'Container unavailable', message: error.message });
    }

    // Ensure project exists in core container's DB (lazy create — idempotent)
    const coreApiKey = process.env.API_ACCESS_KEY || '';
    const container = await pool.getByProject(projectId);
    const projectPath = `${dataBase}/${projectId}/workspace`;
    try {
      const coreHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (coreApiKey) coreHeaders['x-api-key'] = coreApiKey;
      // Lazy create — idempotent, 200 = existed, 201 = created, 409 = already exists (both OK)
      const containerPath = `/app/data/projects/${projectId}`;
      const createRes = await fetch(`http://localhost:${containerInfo.port}/api/projects`, {
        method: 'POST', headers: coreHeaders,
        body: JSON.stringify({ id: projectId, name: container?.projectName || projectId, path: containerPath }),
      });
      if (createRes.status !== 200 && createRes.status !== 201 && createRes.status !== 409) {
        console.warn(`[Proxy] Ensure project ${projectId}: unexpected ${createRes.status}`);
      }
    } catch (err: any) {
      console.error(`[Proxy] Ensure project failed:`, err.message, err.cause?.message);
    }

    // Forward request to core container
    const upstreamUrl = `http://localhost:${containerInfo.port}${req.url}`;
    try {
      const skipHeaders = new Set(['host', 'transfer-encoding', 'content-length', 'connection']);
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && !skipHeaders.has(key)) headers[key] = value;
      }

      // Replace sandbox API key with core's API_ACCESS_KEY for upstream auth
      if (coreApiKey) {
        headers['x-api-key'] = coreApiKey;
      }

      // Inject provider keys from proxy env + per-project overrides
      const providerHeaders = await buildProviderHeaders(pool, projectId);
      Object.assign(headers, providerHeaders);

      const response = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
      });

      const responseBody = await response.text();
      const skipResponseHeaders = new Set([
        'transfer-encoding', 'content-length', 'connection', 'keep-alive', 'content-encoding',
      ]);
      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of response.headers.entries()) {
        if (!skipResponseHeaders.has(key.toLowerCase())) responseHeaders[key] = value;
      }
      reply
        .code(response.status)
        .headers(responseHeaders)
        .send(responseBody);
    } catch (error: any) {
      console.error(`[Proxy] Forward error: ${upstreamUrl}`, error.message, error.cause?.message);
      reply.code(502).send({ error: 'Bad Gateway', message: error.message });
    }
  });
}
