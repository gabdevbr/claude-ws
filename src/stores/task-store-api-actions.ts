/**
 * Task Store API Actions - HTTP fetch actions for task fetch, create, duplicate, and bulk delete
 *
 * Contains: fetchTasks, createTask, duplicateTask, deleteTasksByStatus.
 * Status/reorder/rename/description mutations live in task-store-mutation-api-actions.ts
 */

import type { Task, TaskStatus } from '@/types';
import { createLogger } from '@/lib/logger';
import * as taskApiService from '@/lib/services/task-api-service';

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
    const tasks = await taskApiService.listTasks({ projectIds });
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
    const task = await taskApiService.createTask({ projectId, title, description, pendingFileIds });
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
  const newTask = await taskApiService.createTask({
    projectId: task.projectId,
    title: task.title,
    description: task.description || undefined,
    status: 'todo',
  });
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
      tasksToDelete.map((t) => taskApiService.deleteTask(t.id))
    );
  } catch (error) {
    log.error({ error }, 'Error deleting tasks by status');
    set((state) => ({ tasks: [...state.tasks, ...tasksToDelete] }));
    throw error;
  }
}
