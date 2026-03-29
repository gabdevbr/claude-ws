/**
 * Task Service with Socket.IO Auto-Emit Wrapper
 *
 * Wraps the base task service to automatically emit Socket.IO events
 * after every mutation (create, update, remove, reorder).
 *
 * This centralizes all task event emission in one place, preventing
 * frontend desync from missing manual emits at call sites.
 */
import { getSocketServer } from '@/lib/socket-io-server-singleton';

export function createTaskServiceWithSocketEmit(baseService: any) {
  return {
    // --- Pass through all non-mutation methods ---

    list: baseService.list,
    getById: baseService.getById,
    getAttempts: baseService.getAttempts,
    getAttemptsAsc: baseService.getAttemptsAsc,
    getConversation: baseService.getConversation,
    getConversationHistory: baseService.getConversationHistory,
    getConversationSummaryForCompact: baseService.getConversationSummaryForCompact,
    getRunningAttempt: baseService.getRunningAttempt,
    getStats: baseService.getStats,

    // --- Wrap mutation methods to auto-emit ---

    async create(...args: any[]) {
      const result = await baseService.create(...args);
      getSocketServer()?.emit('task:created', result);
      return result;
    },

    async update(...args: any[]) {
      const result = await baseService.update(...args);
      getSocketServer()?.emit('task:updated', result);
      return result;
    },

    async remove(id: string) {
      await baseService.remove(id);
      getSocketServer()?.emit('task:deleted', { id });
    },

    async reorder(...args: any[]) {
      const result = await baseService.reorder(...args);
      if (result) getSocketServer()?.emit('task:updated', result);
      return result;
    },
  };
}
