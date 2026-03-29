/**
 * Task Service with Socket.IO Auto-Emit Wrapper
 *
 * Wraps the base task service to automatically emit Socket.IO events
 * after every mutation (create, update, remove, reorder).
 *
 * This centralizes all task event emission in one place, preventing
 * frontend desync from missing manual emits at call sites.
 */
import { getSocketServer } from '../socket-io-server-singleton';
import { createLogger } from '../logger';

const log = createLogger('TaskService:SocketEmit');

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
      const io = getSocketServer();
      if (io) {
        io.emit('task:created', result);
      } else {
        log.warn({ taskId: result?.id }, 'Socket server not available for task:created emit');
      }
      return result;
    },

    async update(...args: any[]) {
      const result = await baseService.update(...args);
      const io = getSocketServer();
      if (io) {
        io.emit('task:updated', result);
      } else {
        log.warn({ taskId: result?.id }, 'Socket server not available for task:updated emit');
      }
      return result;
    },

    async remove(id: string) {
      await baseService.remove(id);
      const io = getSocketServer();
      if (io) {
        io.emit('task:deleted', { id });
      } else {
        log.warn({ taskId: id }, 'Socket server not available for task:deleted emit');
      }
    },

    async reorder(...args: any[]) {
      const result = await baseService.reorder(...args);
      if (result) {
        const io = getSocketServer();
        if (io) {
          io.emit('task:updated', result);
        } else {
          log.warn({ taskId: result?.id }, 'Socket server not available for task:updated emit');
        }
      }
      return result;
    },
  };
}
