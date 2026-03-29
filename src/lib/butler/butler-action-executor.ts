/**
 * Butler Action Executor.
 * Maps butler decision objects (ButlerAction) to SDK service calls.
 * Handles create_task, update_task, send_notification, create_communication_task, run_script.
 */
import { createLogger } from '../logger';
import type { ButlerAction } from './butler-types';
import type { ButlerWorkspaceApi } from './butler-workspace-api';
import type { ButlerNotificationService } from './butler-notification-service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const log = createLogger('Butler:Executor');

interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

export function createButlerActionExecutor(
  workspaceApi: ButlerWorkspaceApi,
  notificationService: ButlerNotificationService,
  butlerProjectId: string,
) {
  return {
    /** Execute a single butler action */
    async execute(action: ButlerAction): Promise<ExecutionResult> {
      try {
        switch (action.type) {
          case 'create_task': {
            const result = await workspaceApi.createTask(action.payload as any);
            return { success: true, result };
          }
          case 'update_task': {
            const { id, ...data } = action.payload as any;
            const result = await workspaceApi.updateTask(id, data);
            return { success: true, result };
          }
          case 'send_notification': {
            notificationService.notify(action.payload as any);
            return { success: true };
          }
          case 'create_communication_task': {
            // Find existing task on same topic, or create new in butler's project
            const { title, message } = action.payload as { title: string; message: string };
            const existing = await workspaceApi.findSimilarTask(butlerProjectId, title);
            if (existing && existing.status !== 'done' && existing.status !== 'cancelled') {
              // Resume existing task — update description
              const result = await workspaceApi.updateTask(existing.id, {
                description: `${existing.description || ''}\n\n---\n${message}`,
              });
              return { success: true, result };
            }
            const result = await workspaceApi.createTask({
              projectId: butlerProjectId,
              title,
              description: message,
            });
            return { success: true, result };
          }
          case 'run_script': {
            const { command, cwd, timeout = 30000 } = action.payload as { command: string; cwd?: string; timeout?: number };

            // SECURITY: Only allow scripts within claude-ws root directory
            const projectRoot = process.cwd();
            const workingDir = cwd ? cwd : projectRoot;

            // Resolve absolute path and check if it's within project root
            const resolvedPath = require('path').resolve(workingDir);
            if (!resolvedPath.startsWith(projectRoot) && resolvedPath !== projectRoot) {
              return {
                success: false,
                error: `Security: Script execution outside claude-ws root is not allowed. Requested: ${resolvedPath}, Root: ${projectRoot}`
              };
            }

            try {
              const { stdout, stderr } = await execAsync(command, {
                cwd: workingDir,
                timeout,
              });

              if (stderr && !stdout) {
                return { success: false, error: stderr };
              }

              return { success: true, result: stdout || stderr };
            } catch (execErr: any) {
              const errorMessage = execErr.stderr || execErr.message || String(execErr);
              return { success: false, error: errorMessage };
            }
          }
          default:
            return { success: false, error: `Unknown action type: ${action.type}` };
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        log.error({ error, actionType: action.type }, '[Butler] Action failed');
        return { success: false, error };
      }
    },

    /** Execute a batch of actions */
    async executeBatch(actions: ButlerAction[]): Promise<ExecutionResult[]> {
      return Promise.all(actions.map(a => this.execute(a)));
    },
  };
}

export type ButlerActionExecutor = ReturnType<typeof createButlerActionExecutor>;
