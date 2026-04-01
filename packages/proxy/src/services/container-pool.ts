/**
 * Container Pool — Docker container lifecycle management for sandbox mode.
 *
 * Manages a pool of pre-created core containers, assigns them to projects,
 * and handles start/stop/health check.
 */
import Docker from 'dockerode';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { resolve, join, dirname } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'fs';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema';

const docker = new Docker();

export interface PoolConfig {
  poolSize: number;
  portRangeStart: number;
  portRangeEnd: number;
  image: string;
  dataBase: string;
  idleTimeoutMs: number;
}

export class ContainerPool {
  private config: PoolConfig;
  private healthInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: BetterSQLite3Database<typeof schemaTypes>,
    private schema: typeof schemaTypes,
    config?: Partial<PoolConfig>,
  ) {
    const portRange = (process.env.POOL_PORT_RANGE || '8001-8100').split('-');
    this.config = {
      poolSize: parseInt(process.env.POOL_SIZE || '10', 10),
      portRangeStart: parseInt(portRange[0], 10),
      portRangeEnd: parseInt(portRange[1] || '8100', 10),
      image: process.env.POOL_IMAGE || 'claude-ws-core:latest',
      dataBase: process.env.POOL_DATA_BASE || '/data/sandbox',
      idleTimeoutMs: parseInt(process.env.POOL_IDLE_TIMEOUT || '86400', 10) * 1000,
      ...config,
    };
  }

  /** Initialize port pool and pre-create containers if needed. */
  async init() {
    // Populate port pool
    for (let port = this.config.portRangeStart; port <= this.config.portRangeEnd; port++) {
      const existing = await this.db.query.portPool.findFirst({
        where: eq(this.schema.portPool.port, port),
      });
      if (!existing) {
        await this.db.insert(this.schema.portPool).values({ port, status: 'available' });
      }
    }

    // Pre-create Docker containers in the pool
    await this.replenishPool();

    // Start health check + pool replenish loop
    this.healthInterval = setInterval(() => {
      this.healthCheckLoop();
      this.replenishPool();
    }, 60000);

    console.log(`[ContainerPool] Initialized with ${this.config.poolSize} pool size, ports ${this.config.portRangeStart}-${this.config.portRangeEnd}`);
  }

  /** Pre-create stopped Docker containers up to poolSize. */
  private async replenishPool() {
    try {
      // Count containers that are ready (stopped, waiting for a project)
      const readyContainers = await this.db.query.containers.findMany({
        where: eq(this.schema.containers.status, 'pool'),
      });

      const needed = this.config.poolSize - readyContainers.length;
      if (needed <= 0) return;

      console.log(`[ContainerPool] Replenishing pool: creating ${needed} containers...`);

      // Check if image exists
      try {
        await docker.getImage(this.config.image).inspect();
      } catch {
        console.warn(`[ContainerPool] Image ${this.config.image} not found. Run: claude-ws sandbox init`);
        return;
      }

      for (let i = 0; i < needed; i++) {
        const port = await this.allocatePort();
        if (!port) {
          console.warn('[ContainerPool] No available ports for pool replenish');
          break;
        }

        try {
          const id = nanoid();
          const containerName = `claude-ws-pool-${port}`;

          // Remove stale container with same name if exists
          try {
            const old = docker.getContainer(containerName);
            await old.remove({ force: true });
          } catch { /* doesn't exist, fine */ }

          // Create stopped container
          const dockerContainer = await docker.createContainer({
            Image: this.config.image,
            name: containerName,
            Env: [
              `PORT=${port}`,
              `CLAUDE_PROVIDER=sdk`,
              `NODE_ENV=production`,
            ],
            ExposedPorts: { [`${port}/tcp`]: {} },
            HostConfig: {
              PortBindings: {
                [`${port}/tcp`]: [{ HostPort: `${port}` }],
              },
              RestartPolicy: { Name: 'no' },
            },
          });

          // Save to DB as pool-ready (no project assigned yet)
          await this.db.insert(this.schema.containers).values({
            id,
            projectId: `__pool__${port}`, // placeholder, replaced on assign
            projectName: null,
            status: 'pool',
            port,
            containerId: dockerContainer.id,
            dataPath: null,
            createdAt: Date.now(),
          });

          console.log(`[ContainerPool] Pre-created container on port ${port}`);
        } catch (err: any) {
          console.error(`[ContainerPool] Failed to pre-create container on port ${port}:`, err.message);
          // Release port back
          await this.releasePort(port);
        }
      }
    } catch (error) {
      console.error('[ContainerPool] Replenish error:', error);
    }
  }

  /** Allocate a port for a new project container. */
  private async allocatePort(): Promise<number | null> {
    const available = await this.db.query.portPool.findFirst({
      where: eq(this.schema.portPool.status, 'available'),
    });
    if (!available) return null;

    await this.db.update(this.schema.portPool)
      .set({ status: 'assigned' })
      .where(eq(this.schema.portPool.port, available.port));

    return available.port;
  }

  /** Release a port back to the pool. */
  private async releasePort(port: number) {
    await this.db.update(this.schema.portPool)
      .set({ status: 'available', containerId: null })
      .where(eq(this.schema.portPool.port, port));
  }

  /**
   * Scaffold .claude templates into the project workspace directory.
   * Copies CLAUDE.md, settings.json, and hook scripts with __PROJECT_ID__ replaced.
   */
  private scaffoldProjectTemplate(projectPath: string, projectId: string) {
    // Template source: src/hooks/template/ (relative to project root)
    const projectRoot = resolve(__dirname, '../../../../');
    const templateDir = join(projectRoot, 'src/hooks/template');

    if (!existsSync(templateDir)) {
      console.warn(`[ContainerPool] Template dir not found: ${templateDir}`);
      return;
    }

    // Helper: recursively copy dir, replacing __PROJECT_ID__ in file contents
    const copyDir = (src: string, dest: string) => {
      mkdirSync(dest, { recursive: true });
      for (const entry of readdirSync(src)) {
        const srcPath = join(src, entry);
        const destPath = join(dest, entry);
        const stat = statSync(srcPath);
        if (stat.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          let content = readFileSync(srcPath, 'utf-8');
          content = content.replace(/__PROJECT_ID__/g, projectId);
          writeFileSync(destPath, content);
        }
      }
    };

    // Copy .claude/hooks/
    const hooksTemplateSrc = join(templateDir, 'hooks');
    if (existsSync(hooksTemplateSrc)) {
      copyDir(hooksTemplateSrc, join(projectPath, '.claude', 'hooks'));
    }

    // Copy settings.json → .claude/settings.json
    const settingsSrc = join(templateDir, 'settings.json');
    if (existsSync(settingsSrc)) {
      const dest = join(projectPath, '.claude', 'settings.json');
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(settingsSrc, dest);
    }

    // Copy CLAUDE.template.md → .claude/CLAUDE.md
    const claudeTemplateSrc = join(templateDir, 'CLAUDE.template.md');
    if (existsSync(claudeTemplateSrc)) {
      let content = readFileSync(claudeTemplateSrc, 'utf-8');
      content = content.replace(/__PROJECT_ID__/g, projectId);
      const dest = join(projectPath, '.claude', 'CLAUDE.md');
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }

    console.log(`[ContainerPool] Scaffolded .claude templates for project ${projectId}`);
  }

  /** Create a project — grabs a pre-created container from the pool. */
  async createProject(projectId: string, projectName: string): Promise<{
    id: string; projectId: string; port: number; status: string;
  }> {
    // Try to grab a pre-created container from the pool
    const poolContainer = await this.db.query.containers.findFirst({
      where: eq(this.schema.containers.status, 'pool'),
    });

    if (poolContainer) {
      const dataPath = `${this.config.dataBase}/${projectId}`;

      // Assign pool container to this project
      await this.db.update(this.schema.containers)
        .set({
          projectId,
          projectName,
          status: 'stopped',
          dataPath,
        })
        .where(eq(this.schema.containers.id, poolContainer.id));

      // Reconfigure Docker container: mount data dir + set PROJECT_ID
      if (poolContainer.containerId) {
        try {
          const oldContainer = docker.getContainer(poolContainer.containerId);
          await oldContainer.remove({ force: true });
        } catch { /* already gone */ }
      }

      // Create new container with project-specific config
      const internalPath = `${dataPath}/_internal`;
      const projectPath = `${dataPath}/workspace`;
      mkdirSync(internalPath, { recursive: true });
      mkdirSync(projectPath, { recursive: true });

      // Scaffold .claude templates into workspace
      this.scaffoldProjectTemplate(projectPath, projectId);

      const dockerContainer = await docker.createContainer({
        Image: this.config.image,
        name: `claude-ws-core-${projectId}`,
        Env: this.buildContainerEnv(projectId, poolContainer.port!, null),
        ExposedPorts: { [`${poolContainer.port}/tcp`]: {} },
        HostConfig: {
          Binds: [
            `${internalPath}:/app/data`,
            `${projectPath}:/app/data/projects/${projectId}`,
          ],
          PortBindings: {
            [`${poolContainer.port}/tcp`]: [{ HostPort: `${poolContainer.port}` }],
          },
          RestartPolicy: { Name: 'unless-stopped' },
        },
      });

      await this.db.update(this.schema.containers)
        .set({ containerId: dockerContainer.id })
        .where(eq(this.schema.containers.id, poolContainer.id));

      console.log(`[ContainerPool] Assigned pool container :${poolContainer.port} → project ${projectId}`);

      // Trigger async replenish (don't await)
      this.replenishPool().catch(() => {});

      return { id: poolContainer.id, projectId, port: poolContainer.port!, status: 'stopped' };
    }

    // No pool containers available — create fresh
    const port = await this.allocatePort();
    if (!port) throw new Error('No available ports in pool');

    const id = nanoid();
    const dataPath = `${this.config.dataBase}/${projectId}`;

    await this.db.insert(this.schema.containers).values({
      id,
      projectId,
      projectName,
      status: 'stopped',
      port,
      dataPath,
      createdAt: Date.now(),
    });

    console.log(`[ContainerPool] Created fresh container :${port} → project ${projectId} (pool empty)`);

    return { id, projectId, port, status: 'stopped' };
  }

  /** Start a container for a project. Creates Docker container if needed. */
  async start(projectId: string): Promise<void> {
    const container = await this.db.query.containers.findFirst({
      where: eq(this.schema.containers.projectId, projectId),
    });
    if (!container) throw new Error(`No container for project ${projectId}`);
    if (container.status === 'running') return;

    await this.db.update(this.schema.containers)
      .set({ status: 'starting' })
      .where(eq(this.schema.containers.id, container.id));

    try {
      let dockerContainer: Docker.Container;

      if (container.containerId) {
        // Reuse existing container
        dockerContainer = docker.getContainer(container.containerId);
        try {
          const info = await dockerContainer.inspect();
          if (!info.State.Running) {
            await dockerContainer.start();
          }
        } catch {
          // Container doesn't exist anymore, create new
          dockerContainer = await this.createDockerContainer(container);
          await dockerContainer.start();
        }
      } else {
        // Create new Docker container
        dockerContainer = await this.createDockerContainer(container);
        await dockerContainer.start();
      }

      // Wait for health check
      await this.waitForHealth(container.port!, 30000);

      await this.db.update(this.schema.containers)
        .set({
          status: 'running',
          containerId: dockerContainer.id,
          startedAt: Date.now(),
          errorMessage: null,
        })
        .where(eq(this.schema.containers.id, container.id));
    } catch (error: any) {
      await this.db.update(this.schema.containers)
        .set({ status: 'error', errorMessage: error.message })
        .where(eq(this.schema.containers.id, container.id));
      throw error;
    }
  }

  /** Build the env vars for a project container, with per-project overrides. */
  private buildContainerEnv(projectId: string, port: number, customEnvJson?: string | null): string[] {
    // Only forward structural/non-sensitive keys.
    // Provider keys (ANTHROPIC_*) and hook keys (API_HOOK_*) are injected
    // per-request by the proxy — NOT baked into the container env.
    const forwardKeys = [
      'API_ACCESS_KEY',
    ];

    // Start with defaults from host env
    const proxyPort = process.env.PROXY_PORT || '5000';
    const envMap: Record<string, string> = {
      PROJECT_ID: projectId,
      PORT: String(port),
      CLAUDE_PROVIDER: 'sdk',
      NODE_ENV: 'production',
      // Containers use PROXY_URL to route hooks through the proxy.
      // Use Docker bridge gateway (172.17.0.1) so containers on bridge network can reach the host.
      // Override with PROXY_HOST env var if needed (e.g. host.docker.internal on Docker Desktop).
      PROXY_URL: `http://${process.env.PROXY_HOST || '172.17.0.1'}:${proxyPort}`,
    };

    for (const key of forwardKeys) {
      if (process.env[key]) {
        envMap[key] = process.env[key]!;
      }
    }

    // Apply per-project overrides (from DB customEnv column)
    // NOTE: provider keys in customEnv are no longer baked into container env —
    // they are resolved per-request by the proxy via buildProviderHeaders()
    if (customEnvJson) {
      try {
        const overrides = JSON.parse(customEnvJson) as Record<string, string>;
        // Only apply non-provider overrides to container env
        const providerKeys = new Set([
          'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN',
          'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
          'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
          'API_HOOK_URL', 'API_HOOK_API_KEY', 'API_HOOK_URL_DOMAIN', 'API_HOOK_URL_LOCAL',
        ]);
        for (const [key, value] of Object.entries(overrides)) {
          if (value && !providerKeys.has(key)) envMap[key] = value;
        }
      } catch { /* ignore invalid JSON */ }
    }

    return Object.entries(envMap).map(([k, v]) => `${k}=${v}`);
  }

  /** Create a Docker container for a project. */
  private async createDockerContainer(container: any): Promise<Docker.Container> {
    // Two directories: internal (db, config) and project workspace (user-visible)
    const internalPath = `${container.dataPath}/_internal`;
    const projectPath = `${container.dataPath}/workspace`;
    mkdirSync(internalPath, { recursive: true });
    mkdirSync(projectPath, { recursive: true });

    // Ensure .claude templates are present (idempotent)
    this.scaffoldProjectTemplate(projectPath, container.projectId);

    // Write .env.sandbox so core can hot-reload env changes
    const envLines = this.buildContainerEnv(container.projectId, container.port, container.customEnv);
    writeFileSync(`${internalPath}/.env.sandbox`, envLines.join('\n') + '\n');

    return docker.createContainer({
      Image: this.config.image,
      name: `claude-ws-core-${container.projectId}`,
      Env: this.buildContainerEnv(container.projectId, container.port, container.customEnv),
      ExposedPorts: { [`${container.port}/tcp`]: {} },
      HostConfig: {
        Binds: [
          `${internalPath}:/app/data`,
          `${projectPath}:/app/data/projects/${container.projectId}`,
        ],
        PortBindings: {
          [`${container.port}/tcp`]: [{ HostPort: `${container.port}` }],
        },
        RestartPolicy: { Name: 'unless-stopped' },
      },
    });
  }

  /** Wait for a container's health endpoint to respond. */
  private async waitForHealth(port: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://localhost:${port}/health`);
        if (res.ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Container on port ${port} failed health check after ${timeoutMs}ms`);
  }

  /** Stop a project's container. */
  async stop(projectId: string): Promise<void> {
    const container = await this.db.query.containers.findFirst({
      where: eq(this.schema.containers.projectId, projectId),
    });
    if (!container || container.status !== 'running') return;

    if (container.containerId) {
      try {
        const dockerContainer = docker.getContainer(container.containerId);
        await dockerContainer.stop({ t: 10 });
      } catch {
        // Already stopped
      }
    }

    await this.db.update(this.schema.containers)
      .set({ status: 'stopped', stoppedAt: Date.now() })
      .where(eq(this.schema.containers.id, container.id));
  }

  /** Remove a project and its container entirely. */
  async remove(projectId: string): Promise<void> {
    const container = await this.db.query.containers.findFirst({
      where: eq(this.schema.containers.projectId, projectId),
    });
    if (!container) return;

    // Stop and remove Docker container
    if (container.containerId) {
      try {
        const dockerContainer = docker.getContainer(container.containerId);
        try { await dockerContainer.stop({ t: 5 }); } catch { /* already stopped */ }
        await dockerContainer.remove({ force: true });
      } catch {
        // Container may not exist
      }
    }

    // Release port
    if (container.port) await this.releasePort(container.port);

    // Delete from DB
    await this.db.delete(this.schema.containers)
      .where(eq(this.schema.containers.id, container.id));

    // Delete API keys for this project
    await this.db.delete(this.schema.apiKeys)
      .where(eq(this.schema.apiKeys.projectId, projectId));
  }

  /** Ensure a container is running (lazy activation). */
  async ensureRunning(projectId: string): Promise<{ port: number }> {
    const container = await this.db.query.containers.findFirst({
      where: eq(this.schema.containers.projectId, projectId),
    });
    if (!container) throw new Error(`No container for project ${projectId}`);

    if (container.status !== 'running') {
      await this.start(projectId);
    }

    // Update last activity
    await this.db.update(this.schema.containers)
      .set({ lastActivityAt: Date.now() })
      .where(eq(this.schema.containers.id, container.id));

    return { port: container.port! };
  }

  /** Get container info for a project. */
  async getByProject(projectId: string) {
    return this.db.query.containers.findFirst({
      where: eq(this.schema.containers.projectId, projectId),
    });
  }

  /** Update per-project custom env overrides. Requires container restart to take effect. */
  async setCustomEnv(projectId: string, customEnv: Record<string, string>): Promise<void> {
    await this.db.update(this.schema.containers)
      .set({ customEnv: JSON.stringify(customEnv) })
      .where(eq(this.schema.containers.projectId, projectId));
  }

  /** Get per-project custom env overrides. */
  async getCustomEnv(projectId: string): Promise<Record<string, string>> {
    const container = await this.getByProject(projectId);
    if (!container?.customEnv) return {};
    try { return JSON.parse(container.customEnv); } catch { return {}; }
  }

  /** List all containers. */
  async listAll() {
    return this.db.query.containers.findMany();
  }

  /** Health check loop — stops idle containers, checks health. */
  private async healthCheckLoop() {
    try {
      const running = await this.db.query.containers.findMany({
        where: eq(this.schema.containers.status, 'running'),
      });

      for (const container of running) {
        // Stop idle containers
        if (container.lastActivityAt && (Date.now() - container.lastActivityAt > this.config.idleTimeoutMs)) {
          console.log(`[ContainerPool] Stopping idle container for project ${container.projectId}`);
          await this.stop(container.projectId);
          continue;
        }

        // Health check
        if (container.port) {
          try {
            const res = await fetch(`http://localhost:${container.port}/health`);
            if (!res.ok) throw new Error('Health check failed');
            await this.db.update(this.schema.containers)
              .set({ lastHealthCheck: Date.now() })
              .where(eq(this.schema.containers.id, container.id));
          } catch {
            console.warn(`[ContainerPool] Container for ${container.projectId} failed health check`);
            await this.db.update(this.schema.containers)
              .set({ status: 'error', errorMessage: 'Health check failed' })
              .where(eq(this.schema.containers.id, container.id));
          }
        }
      }
    } catch (error) {
      console.error('[ContainerPool] Health check loop error:', error);
    }
  }

  /** Pool status summary. */
  async getStatus() {
    const allContainers = await this.db.query.containers.findMany();
    const availablePorts = await this.db.query.portPool.findMany({
      where: eq(this.schema.portPool.status, 'available'),
    });

    return {
      total: allContainers.length,
      running: allContainers.filter(c => c.status === 'running').length,
      stopped: allContainers.filter(c => c.status === 'stopped').length,
      error: allContainers.filter(c => c.status === 'error').length,
      availablePorts: availablePorts.length,
      config: this.config,
    };
  }

  /** Cleanup on shutdown. */
  async shutdown() {
    if (this.healthInterval) clearInterval(this.healthInterval);
  }
}
