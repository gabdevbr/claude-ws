/**
 * Task Store API Actions - HTTP fetch actions for task fetch, create, duplicate, and bulk delete
 *
 * Contains: fetchTasks, createTask, duplicateTask, deleteTasksByStatus.
 * Status/reorder/rename/description mutations live in task-store-mutation-api-actions.ts
 */

import type { Task, TaskStatus } from '@/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('TaskStore');

export type TaskStoreSetFn = (
  fn: (state: { tasks: Task[]; selectedTask: Task | null }) => Partial<{ tasks: Task[]; selectedTask: Task | null }> | void
) => void;

export type TaskStoreGetFn = () => {
  tasks: Task[];
  selectedTask: Task | null;
  selectedTaskId: string | null;
  updateTask: (id: string, updates: Partial<Task>) => void;
  addTask: (task: Task) => void;
  setCreatingTask: (isCreating: boolean) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
};

// ── fetchTasks ─────────────────────────────────────────────────────────────

export async function fetchTasksAction(
  projectIds: string[],
  set: (fn: (s: { tasks: Task[] }) => Partial<{ tasks: Task[] }>) => void
): Promise<void> {
  try {
    if (projectIds.length === 0) { set(() => ({ tasks: [] })); return; }
    const query = `?projectIds=${projectIds.join(',')}`;
    const res = await fetch(`/api/tasks${query}`);
    if (!res.ok) {
      // 401 is expected in sandbox mode before project context is established
      if (res.status !== 401 && res.status !== 502) log.error({ status: res.status }, 'Error fetching tasks');
      return;
    }
    const tasks = await res.json();
    set(() => ({ tasks }));
  } catch (error) {
    log.error({ error }, 'Error fetching tasks');
  }
}

// ── createTask ─────────────────────────────────────────────────────────────

export async function createTaskAction(
  projectId: string,
  title: string,
  description: string | null,
  get: TaskStoreGetFn,
  pendingFileIds?: any[]
): Promise<Task> {
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, title, description, pendingFileIds }),
    });
    if (!res.ok) throw new Error('Failed to create task');
    const task = await res.json();
    get().addTask(task);
    get().setCreatingTask(false);
    return task;
  } catch (error) {
    log.error({ error }, 'Error creating task');
    throw error;
  }
}

// ── duplicateTask ──────────────────────────────────────────────────────────

export async function duplicateTaskAction(task: Task, get: TaskStoreGetFn): Promise<Task> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      status: 'todo',
    }),
  });
  if (!res.ok) throw new Error('Failed to duplicate task');
  const newTask = await res.json();
  get().addTask(newTask);
  return newTask;
}

// ── deleteTasksByStatus ────────────────────────────────────────────────────

export async function deleteTasksByStatusAction(
  status: TaskStatus,
  set: TaskStoreSetFn,
  get: TaskStoreGetFn
): Promise<void> {
  const tasksToDelete = get().tasks.filter((t) => t.status === status);
  set((state) => ({ tasks: state.tasks.filter((t) => t.status !== status) }));
  try {
    await Promise.all(
      tasksToDelete.map((t) => fetch(`/api/tasks/${t.id}`, { method: 'DELETE' }))
    );
  } catch (error) {
    log.error({ error }, 'Error deleting tasks by status');
    set((state) => ({ tasks: [...state.tasks, ...tasksToDelete] }));
    throw error;
  }
}
