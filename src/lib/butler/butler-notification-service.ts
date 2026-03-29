/**
 * Butler Notification Service.
 * Emits butler:notification socket events for in-app toasts + Web Notifications.
 * Notification types: info, warning, error, task_update, suggestion.
 */
import type { Server as SocketIOServer } from 'socket.io';
import { nanoid } from 'nanoid';
import { createLogger } from '../logger';
import type { ButlerNotification, ButlerNotificationType } from './butler-types';

const log = createLogger('Butler:Notify');

export function createButlerNotificationService(io: SocketIOServer) {
  /** Buffer recent notifications so they can be replayed to late-connecting clients */
  const recentBuffer: ButlerNotification[] = [];
  const MAX_BUFFER = 10;

  return {
    /** Send a typed notification to all connected clients */
    notify(data: { type: ButlerNotificationType; title: string; body: string; projectId?: string; projectName?: string; taskId?: string }): void {
      const notification: ButlerNotification = {
        id: nanoid(12),
        type: data.type,
        title: data.title,
        body: data.body,
        projectId: data.projectId,
        projectName: data.projectName,
        taskId: data.taskId,
        timestamp: Date.now(),
      };
      recentBuffer.push(notification);
      if (recentBuffer.length > MAX_BUFFER) recentBuffer.shift();
      io.emit('butler:notification', notification);
      log.info({ type: notification.type, title: notification.title }, '[Butler] Notification sent');
    },

    /** Return buffered notifications (for replay to late-connecting clients) */
    getRecentNotifications(): ButlerNotification[] {
      return [...recentBuffer];
    },

    /** Shorthand: notify about a task status change */
    notifyTaskUpdate(taskId: string, message: string): void {
      this.notify({ type: 'task_update', title: 'Task Update', body: message, taskId });
    },

    /** Shorthand: notify error */
    notifyError(title: string, body: string): void {
      this.notify({ type: 'error', title, body });
    },

    /** Shorthand: send a suggestion */
    notifySuggestion(title: string, body: string): void {
      this.notify({ type: 'suggestion', title, body });
    },

    /** Clear the replay buffer (called when client dismisses all notifications) */
    clearBuffer(): void {
      recentBuffer.length = 0;
      log.info('[Butler] Notification buffer cleared');
    },

    /** Shorthand: info notification */
    notifyInfo(title: string, body: string): void {
      this.notify({ type: 'info', title, body });
    },
  };
}

export type ButlerNotificationService = ReturnType<typeof createButlerNotificationService>;
