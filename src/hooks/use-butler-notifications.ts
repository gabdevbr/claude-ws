/**
 * Butler Notifications Hook — reads notification state from store.
 * Web Notifications triggered by the global socket provider listener.
 * Exposes requestPermission() for UI to call on user action.
 */
'use client';

import { useCallback } from 'react';
import { useButlerStore } from '@/stores/butler-store';
import { useSocket } from '@/components/providers/socket-provider';

export function useButlerNotifications() {
  const { notifications, unreadCount, markAllRead, clearNotifications: clearStore } = useButlerStore();
  const socket = useSocket();

  const clearNotifications = useCallback(() => {
    clearStore();
    // Tell the server to clear its replay buffer so notifications don't reappear on reload
    socket?.emit('butler:clear-notifications');
  }, [clearStore, socket]);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.requestPermission();
  }, []);

  const permission = typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported';

  return { notifications, unreadCount, markAllRead, clearNotifications, requestPermission, permission };
}
