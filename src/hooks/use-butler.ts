/**
 * Butler React Hook — reads butler state from store and provides enable/disable actions.
 * Relies on the global socket provider for event listening (no dedicated socket).
 * Uses the shared socket from SocketProvider to emit butler commands.
 */
'use client';

import { useCallback } from 'react';
import { useButlerStore } from '@/stores/butler-store';
import { useSocket } from '@/components/providers/socket-provider';

export function useButler() {
  const { enabled, phase, projectId, uptime, lastHeartbeat } = useButlerStore();
  const socket = useSocket();

  const enable = useCallback(() => {
    socket?.emit('butler:enable');
  }, [socket]);

  const disable = useCallback(() => {
    socket?.emit('butler:disable');
  }, [socket]);

  return { enabled, phase, projectId, uptime, lastHeartbeat, enable, disable };
}
