/**
 * Butler Session Spawner.
 * Spawns Claude sessions for complex reasoning via agentManager.
 * Rate limited: max 1 session per 5 minutes (configurable).
 * Parses JSON action responses from Claude output.
 */
import { createLogger } from '../logger';
import type { ButlerAction, ButlerDependencies } from './butler-types';

const log = createLogger('Butler:Session');

const DEFAULT_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT_MS = 120_000; // 2 minutes max per session

export function createButlerSessionSpawner(
  deps: ButlerDependencies,
  butlerProjectId: string,
  butlerProjectPath: string,
  options?: { minIntervalMs?: number },
) {
  let lastSessionTime = 0;
  let isRunning = false;
  const minInterval = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;

  /** Parse JSON actions from Claude's text output */
  function parseActionsFromOutput(output: string): { actions: ButlerAction[]; reasoning: string; dailyNote: string } {
    try {
      // Extract JSON block from markdown code fence or raw JSON
      const jsonMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || output.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        log.warn('[Butler] No JSON found in session output');
        return { actions: [], reasoning: '', dailyNote: '' };
      }

      const parsed = JSON.parse(jsonMatch[1]);
      return {
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        reasoning: parsed.reasoning || '',
        dailyNote: parsed.daily_note || parsed.dailyNote || '',
      };
    } catch (err) {
      log.error({ err }, '[Butler] Failed to parse session output JSON');
      return { actions: [], reasoning: '', dailyNote: '' };
    }
  }

  return {
    /** Check if a new session can be spawned (rate limit) */
    canSpawn(): boolean {
      if (isRunning) return false;
      return Date.now() - lastSessionTime >= minInterval;
    },

    /** Spawn a Claude session with the given prompt, return parsed actions */
    async spawn(prompt: string): Promise<{ actions: ButlerAction[]; reasoning: string; dailyNote: string }> {
      if (!this.canSpawn()) {
        log.debug('[Butler] Session rate limited or already running');
        return { actions: [], reasoning: '', dailyNote: '' };
      }

      isRunning = true;
      lastSessionTime = Date.now();

      try {
        // Create attempt in butler's project for tracking
        const { nanoid } = await import('nanoid');
        const attemptId = nanoid(12);

        log.info({ attemptId }, '[Butler] Spawning reasoning session');

        // Use agentManager to start a session (event-based API)
        const result = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Butler session timeout'));
          }, SESSION_TIMEOUT_MS);

          let output = '';

          const onJson = (data: { attemptId: string; data: string }) => {
            if (data.attemptId === attemptId) output += (typeof data.data === 'string' ? data.data : JSON.stringify(data.data));
          };
          const onExit = (data: { attemptId: string; code: number }) => {
            if (data.attemptId !== attemptId) return;
            cleanup();
            resolve(output);
          };
          const onStderr = (data: { attemptId: string; content: string }) => {
            if (data.attemptId !== attemptId) return;
            log.debug({ content: data.content }, '[Butler] Session stderr');
          };

          function cleanup() {
            clearTimeout(timeout);
            deps.agentManager.removeListener('json', onJson);
            deps.agentManager.removeListener('exit', onExit);
            deps.agentManager.removeListener('stderr', onStderr);
          }

          deps.agentManager.on('json', onJson);
          deps.agentManager.on('exit', onExit);
          deps.agentManager.on('stderr', onStderr);

          try {
            deps.agentManager.start({
              attemptId,
              prompt,
              projectPath: butlerProjectPath,
              model: 'claude-haiku-4-5-20251001', // Haiku default for cost efficiency
            });
          } catch (err) {
            cleanup();
            reject(err);
          }
        });

        return parseActionsFromOutput(result);
      } catch (err) {
        log.error({ err }, '[Butler] Session spawn failed');
        return { actions: [], reasoning: '', dailyNote: '' };
      } finally {
        isRunning = false;
      }
    },

    /** Get time until next session can be spawned */
    timeUntilNextSpawn(): number {
      const elapsed = Date.now() - lastSessionTime;
      return Math.max(0, minInterval - elapsed);
    },
  };
}

export type ButlerSessionSpawner = ReturnType<typeof createButlerSessionSpawner>;
