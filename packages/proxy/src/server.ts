/**
 * Sandbox Proxy Server
 *
 * API gateway that routes requests to correct core containers per project.
 * Manages container lifecycle, API keys, and WebSocket proxying.
 */
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { db, schema } from './db';
import { ContainerPool } from './services/container-pool';
import { KeyStore } from './services/key-store';
import { registerSandboxRoutes } from './routes/sandbox';
import { registerForwardRoutes } from './routes/forward';

const port = parseInt(process.env.PROXY_PORT || '5000', 10);

async function main() {
  const app = Fastify({ logger: true });
  const pool = new ContainerPool(db, schema);
  const keyStore = new KeyStore(db, schema);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    mode: 'sandbox-proxy',
    timestamp: Date.now(),
  }));

  // Register management routes
  await registerSandboxRoutes(app, { pool, keyStore });

  // Register HTTP forwarding routes
  await registerForwardRoutes(app, { pool, keyStore });

  // Initialize pool
  await pool.init();

  // Start Fastify
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[Proxy] Listening on http://0.0.0.0:${port}`);

  // ========================================
  // Socket.io Proxy — bidirectional piping
  // ========================================
  const io = new SocketIOServer(app.server, {
    cors: { origin: true },
    transports: ['websocket'],
  });

  // Map of client socket ID → upstream connection
  const upstreamConnections = new Map<string, ClientSocket>();

  io.on('connection', async (clientSocket) => {
    console.log(`[Proxy] Socket connected: ${clientSocket.id}`);

    let currentUpstream: ClientSocket | null = null;
    let currentProjectId: string | null = null;

    /** Connect (or reconnect) upstream to a core container for the given project. */
    async function connectUpstream(targetProjectId: string): Promise<ClientSocket> {
      // If already connected to this project, reuse
      if (currentUpstream && currentProjectId === targetProjectId) return currentUpstream;

      // Disconnect old upstream if switching projects
      if (currentUpstream) {
        currentUpstream.disconnect();
        upstreamConnections.delete(clientSocket.id);
      }

      // Ensure container is running
      const { port } = await pool.ensureRunning(targetProjectId);

      // Create upstream connection and wait for it to connect
      const upstream = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
      });

      // Pipe ALL events from upstream → client
      upstream.onAny((event: string, ...args: any[]) => {
        clientSocket.emit(event, ...args);
      });

      upstream.on('connect_error', (err) => {
        console.error(`[Proxy] Upstream error for ${targetProjectId}:`, err.message);
      });

      // Wait for connection before returning
      if (!upstream.connected) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Upstream connection timeout')), 10000);
          upstream.once('connect', () => { clearTimeout(timeout); resolve(); });
          upstream.once('connect_error', (err) => { clearTimeout(timeout); reject(err); });
        });
      }
      console.log(`[Proxy] Upstream connected to container :${port} for ${targetProjectId}`);

      upstreamConnections.set(clientSocket.id, upstream);
      currentUpstream = upstream;
      currentProjectId = targetProjectId;
      return upstream;
    }

    /** Resolve projectId from socket auth, event data, or handshake. */
    async function resolveProjectId(data?: any): Promise<string | null> {
      // 1. From event data (attempt:start has projectId)
      if (data?.projectId) {
        const container = await pool.getByProject(data.projectId);
        if (container) return data.projectId;
      }
      // 2. From socket auth
      const { apiKey, projectId } = clientSocket.handshake.auth || {};
      if (apiKey) {
        const validated = await keyStore.validate(apiKey, projectId);
        if (validated) return validated;
      }
      if (projectId) {
        const container = await pool.getByProject(projectId);
        if (container) return projectId;
      }
      return null;
    }

    // Register handlers FIRST (before any async operations)
    // Handle attempt:start — resolve project, ensure container, forward
    clientSocket.on('attempt:start', async (data: any) => {
      console.log(`[Proxy] attempt:start received`, { projectId: data?.projectId, taskId: data?.taskId, prompt: data?.prompt?.substring(0, 100) });
      try {
        let targetProjectId = await resolveProjectId(data);
        console.log(`[Proxy] Resolved projectId: ${targetProjectId}`);

        // force_create: allocate container for new projects
        if (!targetProjectId && data.force_create && data.projectId) {
          console.log(`[Proxy] force_create: allocating container for ${data.projectId}`);
          await pool.createProject(data.projectId, data.projectName || data.projectId);
          await keyStore.create(data.projectId, 'default');
          targetProjectId = data.projectId;
        }

        if (!targetProjectId) {
          console.log(`[Proxy] No project context, rejecting`);
          clientSocket.emit('error', { message: 'No project context for attempt:start' });
          return;
        }

        // Inject provider keys from proxy env + per-project overrides
        const customEnv = await pool.getCustomEnv(targetProjectId) || {};
        const providerKeys: Record<string, string> = {};
        const keyMap: Record<string, string> = {
          ANTHROPIC_AUTH_TOKEN: 'anthropicAuthToken',
          ANTHROPIC_API_KEY: 'anthropicAuthToken',
          ANTHROPIC_BASE_URL: 'anthropicBaseUrl',
          ANTHROPIC_MODEL: 'anthropicModel',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'anthropicDefaultOpusModel',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'anthropicDefaultSonnetModel',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'anthropicDefaultHaikuModel',
        };
        for (const [envKey, configKey] of Object.entries(keyMap)) {
          const value = customEnv[envKey] || process.env[envKey];
          if (value && !providerKeys[configKey]) providerKeys[configKey] = value;
        }

        console.log(`[Proxy] Connecting upstream for ${targetProjectId}...`);
        const upstream = await connectUpstream(targetProjectId);
        // Inject providerKeys into event data so core can use them per-request
        const enrichedData = Object.keys(providerKeys).length > 0 ? { ...data, providerKeys } : data;
        console.log(`[Proxy] Forwarding attempt:start to container, upstream.connected=${upstream.connected}, upstream.id=${upstream.id}`);
        upstream.emit('attempt:start', enrichedData);
      } catch (err: any) {
        console.error(`[Proxy] attempt:start error:`, err.message);
        clientSocket.emit('error', { message: `Container error: ${err.message}` });
      }
    });

    // Pipe ALL other events from client → upstream (lazy) + log
    clientSocket.onAny((event: string, ...args: any[]) => {
      if (event === 'attempt:start') return; // Handled above
      console.log(`[Proxy] Client event: ${event}`);
      if (currentUpstream) {
        currentUpstream.emit(event, ...args);
      }
    });

    // Handle disconnect
    clientSocket.on('disconnect', () => {
      if (currentUpstream) {
        currentUpstream.disconnect();
        upstreamConnections.delete(clientSocket.id);
      }
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Proxy] ${signal} received, shutting down...`);

    // Disconnect all upstream connections
    for (const [, upstream] of upstreamConnections) {
      upstream.disconnect();
    }

    await pool.shutdown();
    io.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Proxy] Failed to start:', err);
  process.exit(1);
});
