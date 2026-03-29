'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useRunningTasksStore } from '@/stores/running-tasks-store';
import { useAutopilotStore } from '@/stores/autopilot-store';
import { useButlerStore } from '@/stores/butler-store';
import { useTaskStore } from '@/stores/task-store';
import { useProjectStore } from '@/stores/project-store';
import { useFloatingWindowsStore } from '@/stores/floating-windows-store';
import type { Task } from '@/types';

// Shared socket instance for components to emit events
let sharedSocket: Socket | null = null;
export function useSocket(): Socket | null {
  return sharedSocket;
}

/**
 * Global socket provider that listens for task status updates
 * This ensures task cards show correct status even when task isn't opened
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketInstance = io({
      reconnection: true,
      reconnectionDelay: 1000,
    });

    let hasConnectedBefore = false;

    socketInstance.on('connect', () => {
      sharedSocket = socketInstance;
      // Request butler status on connect/reconnect
      socketInstance.emit('butler:status-request');

      // On reconnect: refetch tasks to catch up on missed events during disconnect
      if (hasConnectedBefore) {
        const { selectedProjectIds } = useProjectStore.getState();
        const { enabled: butlerEnabled, projectId: butlerProjectId } = useButlerStore.getState();
        let projectIds = selectedProjectIds;
        if (butlerEnabled && butlerProjectId && projectIds.length > 0 && !projectIds.includes(butlerProjectId)) {
          projectIds = [...projectIds, butlerProjectId];
        }
        useTaskStore.getState().fetchTasks(projectIds);
      }
      hasConnectedBefore = true;

      // Defer setSocket to avoid setState during render
      Promise.resolve().then(() => setSocket(socketInstance));
    });

    socketInstance.on('disconnect', () => {
      // Socket disconnected
    });

    socketInstance.on('connect_error', () => {
      // Socket connect error
    });

    // Global: Listen for any task starting
    socketInstance.on('task:started', (data: { taskId: string }) => {
      useRunningTasksStore.getState().addRunningTask(data.taskId);
    });

    // Global: Listen for any task finishing
    socketInstance.on('task:finished', (data: { taskId: string; status: string }) => {
      useRunningTasksStore.getState().removeRunningTask(data.taskId);
      if (data.status === 'completed') {
        useRunningTasksStore.getState().markTaskCompleted(data.taskId);
      }
    });

    // Realtime task updates (from autopilot or server-side changes)
    socketInstance.on('task:updated', (task: Task) => {
      const store = useTaskStore.getState();
      const exists = store.tasks.some((t) => t.id === task.id);
      if (exists) {
        store.updateTask(task.id, task);
      } else {
        store.addTask(task);
      }
    });

    // Realtime task creation
    socketInstance.on('task:created', (task: Task) => {
      const store = useTaskStore.getState();
      if (!store.tasks.some((t) => t.id === task.id)) {
        store.addTask(task);
      }
    });

    // Realtime task deletion
    socketInstance.on('task:deleted', (data: { id: string }) => {
      useTaskStore.getState().deleteTask(data.id);
    });

    // Autopilot status listeners
    socketInstance.on('autopilot:status', (data: { projectId: string } & Record<string, any>) => {
      useAutopilotStore.getState().updateStatus(data.projectId, data);
    });

    socketInstance.on('autopilot:task-started', (data: { projectId: string; taskId: string } & Record<string, any>) => {
      useAutopilotStore.getState().updateStatus(data.projectId, data);
      useRunningTasksStore.getState().addRunningTask(data.taskId);
    });

    socketInstance.on('autopilot:planned', (data: { projectId: string } & Record<string, any>) => {
      useAutopilotStore.getState().updateStatus(data.projectId, data);
    });

    // Butler status listeners
    socketInstance.on('butler:status', (data: Record<string, any>) => {
      useButlerStore.getState().updateStatus(data);
    });

    socketInstance.on('butler:heartbeat', (data: Record<string, any>) => {
      useButlerStore.getState().updateStatus(data);
    });

    socketInstance.on('butler:notification', async (data: any) => {
      useButlerStore.getState().addNotification(data);

      // Fire browser notification if permission available
      if (typeof window !== 'undefined' && 'Notification' in window) {
        let permission = Notification.permission;
        // Request permission if not yet asked
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        // Show notification if granted
        if (permission === 'granted') {
          const notifOptions: NotificationOptions = {
            body: data.body || '',
            icon: '/icon-192.png',
            tag: data.id || `butler-${Date.now()}`,
          };
          const title = data.title || 'Butler';

          const handleNotificationClick = () => {
            window.focus();
            if (data.taskId && data.projectId) {
              useFloatingWindowsStore.getState().openWindow(data.taskId, 'chat', data.projectId);
              useTaskStore.getState().setSelectedTaskId(data.taskId);
            } else if (data.projectId) {
              const url = new URL(window.location.href);
              url.searchParams.set('project', data.projectId);
              window.history.pushState({}, '', url.toString());
            }
          };

          try {
            const notif = new Notification(title, notifOptions);
            notif.onclick = handleNotificationClick;
          } catch {
            // Notification constructor unavailable (e.g. secure context),
            // fall back to ServiceWorker showNotification if available
            try {
              const reg = await navigator.serviceWorker?.getRegistration();
              if (reg) {
                await reg.showNotification(title, notifOptions);
              }
            } catch {
              // No notification mechanism available, skip silently
            }
          }
        }
      }
    });

    return () => {
      sharedSocket = null;
      socketInstance.disconnect();
    };
  }, []);

  return <>{children}</>;
}
