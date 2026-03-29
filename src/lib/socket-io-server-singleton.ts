/**
 * Socket.IO server singleton.
 * Set once from server.ts, read from Next.js API routes to emit events.
 */
import type { Server as SocketIOServer } from 'socket.io';

let _io: SocketIOServer | null = null;

export function setSocketServer(io: SocketIOServer): void {
  _io = io;
}

export function getSocketServer(): SocketIOServer | null {
  return _io;
}
