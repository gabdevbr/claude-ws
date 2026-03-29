/**
 * Task API Service - Centralized service for all /api/tasks HTTP calls
 *
 * This service wraps all task-related API endpoints in a single location.
 * All fetch('/api/tasks/...') calls across the frontend should use this service.
 *
 * This is a stateless fetch wrapper - no caching, just typed API calls.
 */

import type { Task, TaskStatus } from '@/types';

// ── Custom error with HTTP status ───────────────────────────────────────────────

export class TaskApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'TaskApiError';
  }
}

function throwIfNotOk(res: Response, message: string): void {
  if (!res.ok) throw new TaskApiError(message, res.status);
}

// ── Types for API responses ─────────────────────────────────────────────────────

export interface TaskStats {
  totalTokens: number;
  totalCostUSD: number;
  totalTurns: number;
  totalDurationMs: number;
  totalAdditions: number;
  totalDeletions: number;
  filesChanged: number;
  contextUsed: number;
  contextLimit: number;
  contextPercentage: number;
}

export interface TaskConversation {
  turns: Array<{
    role: string;
    content: any[];
    timestamp?: number;
  }>;
}

export interface RunningAttemptResponse {
  attempt: {
    id: string;
    status: string;
    prompt?: string;
    messages?: any[];
  } | null;
  messages?: any[];
}

export interface PendingQuestionResponse {
  question: {
    attemptId: string;
    toolUseId: string;
    questions: Array<{
      question: string;
      header: string;
      options: Array<{
        label: string;
        description: string;
      }>;
      multiSelect: boolean;
    }>;
  } | null;
}

export interface CompactTaskResponse {
  compacted: any;
}

// ── Task CRUD ────────────────────────────────────────────────────────────────

/**
 * List tasks, optionally filtered by project IDs
 */
export async function listTasks(options?: { projectIds?: string[] }): Promise<Task[]> {
  const query = options?.projectIds && options.projectIds.length > 0
    ? `?projectIds=${options.projectIds.join(',')}`
    : '';
  const res = await fetch(`/api/tasks${query}`);
  throwIfNotOk(res, 'Failed to fetch tasks');
  return res.json();
}

/**
 * Get a single task by ID
 */
export async function getTask(id: string): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`);
  throwIfNotOk(res, 'Failed to fetch task');
  return res.json();
}

/**
 * Create a new task
 */
export async function createTask(data: {
  projectId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  pendingFileIds?: string[];
}): Promise<Task> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  throwIfNotOk(res, 'Failed to create task');
  return res.json();
}

/**
 * Update a task (partial update)
 */
export async function updateTask(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    status: TaskStatus;
    chatInit: boolean;
    lastModel: string;
    lastProvider: string;
  }>
): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  throwIfNotOk(res, 'Failed to update task');
  return res.json();
}

/**
 * Delete a task
 */
export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  throwIfNotOk(res, 'Failed to delete task');
}

// ── Reorder ───────────────────────────────────────────────────────────────────

/**
 * Reorder a single task
 */
export async function reorderTask(taskId: string, status: string, position: number): Promise<void> {
  const res = await fetch('/api/tasks/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, status, position }),
  });
  throwIfNotOk(res, 'Failed to reorder task');
}

/**
 * Batch reorder multiple tasks
 */
export async function batchReorderTasks(tasks: Array<{
  id: string;
  status: string;
  position: number
}>): Promise<void> {
  const res = await fetch('/api/tasks/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });
  throwIfNotOk(res, 'Failed to batch reorder tasks');
}

// ── Read-only sub-resources ─────────────────────────────────────────────────────

/**
 * Get attempts for a task
 */
export async function getTaskAttempts(taskId: string): Promise<{ attempts: any[] }> {
  const res = await fetch(`/api/tasks/${taskId}/attempts`);
  throwIfNotOk(res, 'Failed to fetch task attempts');
  return res.json();
}

/**
 * Get conversation history for a task
 */
export async function getTaskConversation(taskId: string): Promise<{ turns: any[] }> {
  const res = await fetch(`/api/tasks/${taskId}/conversation`);
  throwIfNotOk(res, 'Failed to fetch task conversation');
  return res.json();
}

/**
 * Get stats for a task
 */
export async function getTaskStats(
  taskId: string,
  options?: { signal?: AbortSignal }
): Promise<TaskStats> {
  const res = await fetch(`/api/tasks/${taskId}/stats`, {
    signal: options?.signal,
  });
  throwIfNotOk(res, 'Failed to fetch task stats');
  return res.json();
}

/**
 * Get the currently running attempt for a task
 */
export async function getRunningAttempt(
  taskId: string,
  options?: { cache?: RequestCache; signal?: AbortSignal }
): Promise<RunningAttemptResponse> {
  const res = await fetch(`/api/tasks/${taskId}/running-attempt`, {
    cache: options?.cache || 'default',
    signal: options?.signal,
  });
  throwIfNotOk(res, 'Failed to fetch running attempt');
  return res.json();
}

/**
 * Get a pending question for a task
 */
export async function getPendingQuestion(
  taskId: string,
  options?: { cache?: RequestCache; signal?: AbortSignal }
): Promise<PendingQuestionResponse> {
  const res = await fetch(`/api/tasks/${taskId}/pending-question`, {
    cache: options?.cache || 'default',
    signal: options?.signal,
  });
  throwIfNotOk(res, 'Failed to fetch pending question');
  return res.json();
}

/**
 * Compact a task's conversation
 */
export async function compactTask(taskId: string): Promise<CompactTaskResponse> {
  const res = await fetch(`/api/tasks/${taskId}/compact`, { method: 'POST' });
  throwIfNotOk(res, 'Failed to compact task');
  return res.json();
}
