/**
 * Socket.IO server singleton.
 * Set once from server.ts, read from Next.js API routes to emit events.
 *
 * Uses globalThis to share the instance across module boundaries
 * (tsx runtime in server.ts vs webpack-compiled Next.js API routes).
 */
import type { Server as SocketIOServer } from 'socket.io';

const GLOBAL_KEY = '__claude_ws_socket_io__' as const;

export function setSocketServer(io: SocketIOServer): void {
  (globalThis as any)[GLOBAL_KEY] = io;
}

export function getSocketServer(): SocketIOServer | null {
  return (globalThis as any)[GLOBAL_KEY] || null;
}
