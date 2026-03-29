/**
 * Butler Manager Singleton Export.
 * Exports a getter function for the butlerManager instance created in server.ts.
 * Uses lazy initialization to avoid race conditions during Next.js dev mode module loading.
 */
import type { ButlerManager } from './butler';

const globalKey = '__claude_butler_manager__' as const;

declare global {
  var __claude_butler_manager__: ButlerManager | undefined;
}

/**
 * Get the ButlerManager instance from the global scope.
 * Returns null if not yet initialized (e.g., during early module loading in dev mode).
 * Consumers should handle the null case appropriately.
 */
export function getButlerManager(): ButlerManager | null {
  return (globalThis as any)[globalKey] ?? null;
}
