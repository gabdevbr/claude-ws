/**
 * Butler Agent shared types and interfaces.
 * Central type definitions for the workspace-wide butler agent system.
 */
import type { Server as SocketIOServer } from 'socket.io';

// --- Butler State & Config ---

export interface ButlerConfig {
  enabled: boolean;
  projectId: string | null;
  projectPath: string | null;
  heartbeatIntervalMs: number;
  lastHeartbeat: number | null;
}

export type ButlerPhase = 'idle' | 'initializing' | 'running' | 'reasoning' | 'shutting_down';

export interface ButlerState {
  enabled: boolean;
  phase: ButlerPhase;
  projectId: string | null;
  uptime: number;
  lastHeartbeat: number | null;
}

// --- Persona Files ---

export interface PersonaFiles {
  soul: string | null;
  user: string | null;
  identity: string | null;
  agents: string | null;
  memory: string | null;
}

// --- Dependencies injected at init ---

export interface ButlerDependencies {
  db: any;
  io: SocketIOServer;
  schema: any;
  agentManager: any;
  sessionManager: any;
}

// --- Actions & Notifications (Phase 2+) ---

export type ButlerActionType =
  | 'create_task'
  | 'update_task'
  | 'create_project'
  | 'send_notification'
  | 'write_file'
  | 'create_communication_task'
  | 'run_script';

export interface ButlerAction {
  type: ButlerActionType;
  payload: Record<string, unknown>;
}

export type ButlerNotificationType = 'info' | 'warning' | 'error' | 'task_update' | 'suggestion';

export interface ButlerNotification {
  id: string;
  type: ButlerNotificationType;
  title: string;
  body: string;
  projectId?: string;
  projectName?: string;
  taskId?: string;
  timestamp: number;
}

// --- Workspace Snapshot (Phase 2+) ---

export interface WorkspaceProjectSummary {
  id: string;
  name: string;
  path: string;
  taskCounts: Record<string, number>;
}

export interface WorkspaceSnapshot {
  projects: WorkspaceProjectSummary[];
  totalTasks: number;
  tasksByStatus: Record<string, number>;
}

// --- Events (Phase 3+) ---

export interface ButlerEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// --- Scheduled Tasks ---

export interface ScheduledTask {
  id: string;
  cronExpression: string;
  actionType: ButlerActionType;
  actionPayload: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
}
