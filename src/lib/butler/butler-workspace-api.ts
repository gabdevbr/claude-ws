/**
 * Butler Workspace API — unified facade over SDK services.
 * Gives butler read/write access to all projects, tasks, files, and search.
 * All operations go through SDK services (no direct DB queries).
 */
import { createLogger } from '../logger';
import type { WorkspaceSnapshot, WorkspaceProjectSummary } from './butler-types';

const log = createLogger('Butler:WorkspaceAPI');

interface WorkspaceServices {
  taskService: any;
  projectService: any;
}

export function createButlerWorkspaceApi(services: WorkspaceServices) {
  const { taskService, projectService } = services;

  return {
    // --- Projects ---
    async listProjects(): Promise<any[]> {
      try {
        return await projectService.list();
      } catch (err) {
        log.error({ err }, '[Butler] Failed to list projects');
        return [];
      }
    },

    async getProject(id: string): Promise<any | null> {
      try {
        return await projectService.getById(id);
      } catch (err) {
        log.error({ err }, '[Butler] Failed to get project');
        return null;
      }
    },

    // --- Tasks (cross-project) ---
    async listAllTasks(filters?: { statuses?: string[] }): Promise<any[]> {
      try {
        return await taskService.list({ statuses: filters?.statuses });
      } catch (err) {
        log.error({ err }, '[Butler] Failed to list all tasks');
        return [];
      }
    },

    async listProjectTasks(projectId: string): Promise<any[]> {
      try {
        return await taskService.list({ projectId });
      } catch (err) {
        log.error({ err }, '[Butler] Failed to list project tasks');
        return [];
      }
    },

    async createTask(data: { projectId: string; title: string; description?: string }): Promise<any> {
      try {
        return await taskService.create(data);
      } catch (err) {
        log.error({ err }, '[Butler] Failed to create task');
        throw err;
      }
    },

    async updateTask(id: string, data: Record<string, unknown>): Promise<any> {
      try {
        return await taskService.update(id, data);
      } catch (err) {
        log.error({ err }, '[Butler] Failed to update task');
        throw err;
      }
    },

    // --- Workspace Snapshot ---
    async getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
      try {
        const projects = await projectService.list();
        const allTasks = await taskService.list({});
        const tasksByStatus: Record<string, number> = {};

        for (const task of allTasks) {
          tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
        }

        const projectSummaries: WorkspaceProjectSummary[] = projects.map((p: any) => {
          const projectTasks = allTasks.filter((t: any) => t.projectId === p.id);
          const counts: Record<string, number> = {};
          for (const t of projectTasks) {
            counts[t.status] = (counts[t.status] || 0) + 1;
          }
          return { id: p.id, name: p.name, path: p.path, taskCounts: counts };
        });

        return {
          projects: projectSummaries,
          totalTasks: allTasks.length,
          tasksByStatus,
        };
      } catch (err) {
        log.error({ err }, '[Butler] Failed to get workspace snapshot');
        return { projects: [], totalTasks: 0, tasksByStatus: {} };
      }
    },

    // --- Task Search (find similar tasks by title) ---
    async findSimilarTask(projectId: string, title: string): Promise<any | null> {
      try {
        const tasks = await taskService.list({ projectId });
        const lower = title.toLowerCase();
        return tasks.find((t: any) =>
          t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase())
        ) || null;
      } catch {
        return null;
      }
    },
  };
}

export type ButlerWorkspaceApi = ReturnType<typeof createButlerWorkspaceApi>;
