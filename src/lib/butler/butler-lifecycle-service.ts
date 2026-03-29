/**
 * Butler Lifecycle Service.
 * Manages heartbeat timer, startup sequence, and graceful shutdown.
 * Heartbeat emits butler:heartbeat every 60s with current state.
 */
import type { Server as SocketIOServer } from 'socket.io';
import { eq } from 'drizzle-orm';
import { createLogger } from '../logger';
import type { ButlerConfig, ButlerState, ButlerPhase } from './butler-types';

const log = createLogger('Butler:Lifecycle');

export interface ButlerLifecycleCallbacks {
  getState: () => ButlerState;
  onHeartbeat?: () => Promise<void>;
}

export function createButlerLifecycleService(
  io: SocketIOServer,
  config: ButlerConfig,
  callbacks: ButlerLifecycleCallbacks,
) {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const startedAt = Date.now();

  return {
    /** Start heartbeat timer — emits butler:heartbeat and triggers evaluation */
    startHeartbeat(): void {
      if (heartbeatTimer) return; // already running

      heartbeatTimer = setInterval(async () => {
        const state = callbacks.getState();
        state.uptime = Date.now() - startedAt;
        io.emit('butler:heartbeat', state);

        // Trigger decision loop evaluation if callback provided
        if (callbacks.onHeartbeat) {
          try {
            await callbacks.onHeartbeat();
          } catch (err) {
            log.error({ err }, '[Butler] Heartbeat evaluation failed');
          }
        }
      }, config.heartbeatIntervalMs);

      // Don't prevent process exit
      heartbeatTimer.unref();
      log.info({ intervalMs: config.heartbeatIntervalMs }, '[Butler] Heartbeat started');
    },

    /** Stop heartbeat timer */
    stopHeartbeat(): void {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        log.info('[Butler] Heartbeat stopped');
      }
    },

    /** Graceful shutdown — stop timers, persist state */
    async gracefulShutdown(db: any, schema: any): Promise<void> {
      this.stopHeartbeat();

      // Persist last heartbeat timestamp
      try {
        await db.insert(schema.appSettings)
          .values({ key: 'butler_last_heartbeat', value: String(Date.now()), updatedAt: Date.now() })
          .onConflictDoUpdate({
            target: schema.appSettings.key,
            set: { value: String(Date.now()), updatedAt: Date.now() },
          });
      } catch (err) {
        log.error({ err }, '[Butler] Failed to persist shutdown state');
      }

      log.info('[Butler] Graceful shutdown complete');
    },

    /** Get uptime in ms */
    getUptime(): number {
      return Date.now() - startedAt;
    },
  };
}
