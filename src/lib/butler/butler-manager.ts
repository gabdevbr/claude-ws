/**
 * Butler Manager — singleton orchestrator for the workspace-wide butler agent.
 * Factory function pattern matching createAutopilotManager().
 * Coordinates lifecycle, persona, memory, workspace API, and decision engine.
 */
import { eq } from 'drizzle-orm';
import { createLogger } from '../logger';
import { createProjectService, createTaskService } from '../../../packages/agentic-sdk/src';
import { createTaskServiceWithSocketEmit } from '../services/task-service-with-socket-emit';
import { ensureButlerProject } from './butler-project-initializer';
import { createButlerPersonaLoader } from './butler-persona-loader';
import { createButlerMemoryManager } from './butler-memory-manager';
import { createButlerLifecycleService } from './butler-lifecycle-service';
import { createButlerWorkspaceApi } from './butler-workspace-api';
import { createButlerNotificationService } from './butler-notification-service';
import { createButlerActionExecutor } from './butler-action-executor';
import { createButlerEventCollector } from './butler-event-collector';
import { createButlerRuleEngine, seedCompletedProjects } from './butler-rule-engine';
import { createButlerPromptBuilder } from './butler-prompt-builder';
import { createButlerSessionSpawner } from './butler-session-spawner';
import { createButlerDecisionLoop } from './butler-decision-loop';
import { createButlerSchedulerService } from './butler-scheduler-service';
import { buildPersonaPrompt, resumeStaleAttempts } from './butler-attempt-resumption-service';
import type { ButlerConfig, ButlerState, ButlerPhase, ButlerDependencies, ButlerEvent, PersonaFiles } from './butler-types';

const log = createLogger('Butler:Manager');

const DEFAULT_HEARTBEAT_MS = 60_000; // 60 seconds

export function createButlerManager() {
  // Internal state
  let config: ButlerConfig = {
    enabled: true, // auto-enable on startup (validated decision)
    projectId: null,
    projectPath: null,
    heartbeatIntervalMs: DEFAULT_HEARTBEAT_MS,
    lastHeartbeat: null,
  };
  let phase: ButlerPhase = 'idle';
  let deps: ButlerDependencies | null = null;
  let persona: PersonaFiles = { soul: null, user: null, identity: null, agents: null, memory: null };
  const personaLoader = createButlerPersonaLoader();
  const memoryManager = createButlerMemoryManager();
  let lifecycleService: ReturnType<typeof createButlerLifecycleService> | null = null;
  let workspaceApi: any = null;
  let actionExecutor: any = null;
  let notificationService: any = null;
  let decisionLoop: any = null;
  let eventCollector: any = null;
  let schedulerService: any = null;

  function getState(): ButlerState {
    return {
      enabled: config.enabled,
      phase,
      projectId: config.projectId,
      uptime: lifecycleService?.getUptime() ?? 0,
      lastHeartbeat: config.lastHeartbeat,
    };
  }

  function emitStatus(): void {
    if (deps?.io) {
      deps.io.emit('butler:status', getState());
    }
  }

  /** Wire all services (project, persona, API, decision engine, lifecycle) */
  async function wireServices(): Promise<void> {
    if (!deps) throw new Error('Butler deps not set');
    const { projectId, projectPath } = await ensureButlerProject(deps.db, deps.schema);
    config.projectId = projectId;
    config.projectPath = projectPath;

    persona = personaLoader.loadAll(projectPath);

    const taskService = createTaskServiceWithSocketEmit(createTaskService(deps.db));
    const projectService = createProjectService(deps.db);
    workspaceApi = createButlerWorkspaceApi({ taskService, projectService });
    notificationService = createButlerNotificationService(deps.io);
    actionExecutor = createButlerActionExecutor(workspaceApi, notificationService, projectId);

    eventCollector = createButlerEventCollector();
    const ruleEngine = createButlerRuleEngine();
    const promptBuilder = createButlerPromptBuilder(personaLoader, memoryManager);
    const sessionSpawner = createButlerSessionSpawner(deps, projectId, projectPath);
    decisionLoop = createButlerDecisionLoop({
      eventCollector, ruleEngine, promptBuilder, sessionSpawner,
      actionExecutor, workspaceApi, memoryManager, projectPath,
    });

    schedulerService = createButlerSchedulerService(deps.db, deps.schema, actionExecutor);
    await schedulerService.initialize();

    lifecycleService = createButlerLifecycleService(deps.io, config, {
      getState,
      onHeartbeat: async () => {
        config.lastHeartbeat = Date.now();
        if (decisionLoop) await decisionLoop.evaluate();
        if (schedulerService) await schedulerService.checkAndExecute();
      },
    });
    log.info({ projectId }, '[Butler] All services wired');
  }


  const manager = {
    /** Initialize butler: wire services + start if enabled */
    async initialize(dependencies: ButlerDependencies): Promise<void> {
      deps = dependencies;
      phase = 'initializing';
      emitStatus();

      try {
        const enabledSetting = await deps.db.select()
          .from(deps.schema.appSettings)
          .where(eq(deps.schema.appSettings.key, 'butler_enabled'))
          .get();

        if (enabledSetting && enabledSetting.value === 'false') {
          config.enabled = false;
          phase = 'idle';
          log.info('[Butler] Disabled via settings (will wire on enable)');
          emitStatus();
          return;
        }

        await wireServices();
        lifecycleService!.startHeartbeat();
        config.enabled = true;
        phase = 'running';

        // Seed already-complete projects so we don't re-notify after restart
        if (workspaceApi) {
          const snapshot = await workspaceApi.getWorkspaceSnapshot();
          seedCompletedProjects(snapshot);
        }

        // Immediate first evaluation to detect pending work after restart
        if (decisionLoop) {
          log.info('[Butler] Running initial evaluation for auto-resume');
          await decisionLoop.evaluate();
        }

        // Resume any stale task conversations killed by restart
        if (deps && config.projectId) {
          await resumeStaleAttempts({
            db: deps.db, schema: deps.schema, agentManager: deps.agentManager,
            sessionManager: deps.sessionManager, io: deps.io,
            projectId: config.projectId, persona,
          });
        }

        log.info({ projectId: config.projectId }, '[Butler] Initialized and running');
        emitStatus();
      } catch (err) {
        log.error({ err }, '[Butler] Initialization failed');
        phase = 'idle';
        emitStatus();
      }
    },

    /** Start butler (enable) — wires services if not yet done */
    async start(): Promise<void> {
      try {
        if (!lifecycleService) await wireServices();
        config.enabled = true;
        phase = 'running';
        lifecycleService?.startHeartbeat();

        if (deps) {
          await deps.db.insert(deps.schema.appSettings)
            .values({ key: 'butler_enabled', value: 'true', updatedAt: Date.now() })
            .onConflictDoUpdate({
              target: deps.schema.appSettings.key,
              set: { value: 'true', updatedAt: Date.now() },
            });
        }
        emitStatus();
        log.info('[Butler] Started');
      } catch (err) {
        log.error({ err }, '[Butler] Start failed');
        phase = 'idle';
        emitStatus();
      }
    },

    /** Stop butler — userDisable=true when user clicks disable, false for server shutdown */
    async stop(userDisable = false): Promise<void> {
      phase = 'shutting_down';
      emitStatus();

      lifecycleService?.stopHeartbeat();
      if (deps) {
        await lifecycleService?.gracefulShutdown(deps.db, deps.schema);
        // Only persist disabled state when user explicitly disables
        if (userDisable) {
          await deps.db.insert(deps.schema.appSettings)
            .values({ key: 'butler_enabled', value: 'false', updatedAt: Date.now() })
            .onConflictDoUpdate({
              target: deps.schema.appSettings.key,
              set: { value: 'false', updatedAt: Date.now() },
            });
        }
      }

      config.enabled = false;
      phase = 'idle';
      emitStatus();
      log.info({ userDisable }, '[Butler] Stopped');
    },

    getStatus: getState,
    isEnabled: () => config.enabled,
    getProjectId: () => config.projectId,
    getProjectPath: () => config.projectPath,
    getPersona: () => persona,
    getMemoryManager: () => memoryManager,
    getPersonaLoader: () => personaLoader,
    getWorkspaceApi: () => workspaceApi,
    getNotificationService: () => notificationService,
    getSchedulerService: () => schedulerService,
    /** Build persona prompt prefix for Butler task agents */
    buildPersonaPrompt: () => buildPersonaPrompt(persona),
    pushEvent(event: ButlerEvent): void { eventCollector?.push(event); },
  };

  return manager;
}

export type ButlerManager = ReturnType<typeof createButlerManager>;
