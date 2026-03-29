/**
 * Butler Zustand Store — global butler agent state.
 * Unlike autopilot (per-project), butler has ONE global state.
 * Tracks: enabled, phase, notifications, unread count.
 */
import { create } from 'zustand';

export interface ButlerNotificationItem {
  id: string;
  type: 'info' | 'warning' | 'error' | 'task_update' | 'suggestion';
  title: string;
  body: string;
  projectId?: string;
  projectName?: string;
  taskId?: string;
  timestamp: number;
  read: boolean;
}

interface ButlerStoreState {
  enabled: boolean;
  phase: 'idle' | 'initializing' | 'running' | 'reasoning' | 'shutting_down';
  projectId: string | null;
  uptime: number;
  lastHeartbeat: number | null;
  notifications: ButlerNotificationItem[];
  unreadCount: number;
}

interface ButlerStoreActions {
  updateStatus: (data: Partial<ButlerStoreState>) => void;
  addNotification: (notif: Omit<ButlerNotificationItem, 'read'>) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
}

const MAX_NOTIFICATIONS = 50;

export const useButlerStore = create<ButlerStoreState & ButlerStoreActions>((set) => ({
  enabled: false,
  phase: 'idle',
  projectId: null,
  uptime: 0,
  lastHeartbeat: null,
  notifications: [],
  unreadCount: 0,

  updateStatus: (data) =>
    set((prev) => ({ ...prev, ...data })),

  addNotification: (notif) =>
    set((prev) => {
      // Deduplicate by ID (buffered replay may resend existing notifications)
      if (prev.notifications.some((n) => n.id === notif.id)) return prev;
      const full: ButlerNotificationItem = { ...notif, read: false };
      const notifications = [full, ...prev.notifications].slice(0, MAX_NOTIFICATIONS);
      return { notifications, unreadCount: prev.unreadCount + 1 };
    }),

  markAllRead: () =>
    set((prev) => ({
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  clearNotifications: () =>
    set({ notifications: [], unreadCount: 0 }),
}));
