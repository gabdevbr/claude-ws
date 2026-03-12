/**
 * Checkpoint fork and rewind DB operations service.
 * Handles DB transactions for forking a task from a checkpoint and rewinding
 * (deleting) attempts/checkpoints after a given checkpoint.
 * Bulk copy helpers are in checkpoint-attempt-copy-helpers.ts.
 */
import { eq, desc, and, gte, asc } from 'drizzle-orm';
import * as schema from '../../db/database-schema';
import { generateId } from '../../lib/nanoid-id-generator';
import {
  copyAttemptsBeforeCheckpoint,
  copyCheckpointsBeforeForkPoint,
} from './checkpoint-attempt-copy-helpers';

export class CheckpointNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointNotFoundError';
  }
}

/** Dependencies for SDK file rewind — injected by caller (runtime singletons) */
export interface SdkRewindDeps {
  attemptSdkFileRewind: (
    checkpoint: { sessionId: string; gitCommitHash: string | null },
    project: { path: string }
  ) => Promise<{ success: boolean; error?: string }>;
  setRewindState: (taskId: string, sessionId: string, messageUuid: string) => Promise<void>;
}

export function createCheckpointOperationsService(db: any) {
  return {
    /**
     * Fork a new task from a checkpoint. Copies attempts/checkpoints before the fork point.
     * Returns new task data, original task, checkpoint, and attempt info.
     */
    async fork(checkpointId: string) {
      const checkpoint = await db.select().from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, checkpointId)).get();
      if (!checkpoint) throw new Error('Checkpoint not found');

      const originalTask = await db.select().from(schema.tasks)
        .where(eq(schema.tasks.id, checkpoint.taskId)).get();
      if (!originalTask) throw new Error('Original task not found');

      const attempt = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.id, checkpoint.attemptId)).get();

      const tasksInTodo = await db.select().from(schema.tasks)
        .where(and(eq(schema.tasks.projectId, originalTask.projectId), eq(schema.tasks.status, 'todo')))
        .orderBy(desc(schema.tasks.position))
        .limit(1);

      const position = tasksInTodo.length > 0 ? tasksInTodo[0].position + 1 : 0;
      const newTaskId = generateId('task');
      const truncatedTitle = originalTask.title.length > 74
        ? originalTask.title.slice(0, 74) + '...'
        : originalTask.title;

      const newTask = {
        id: newTaskId,
        projectId: originalTask.projectId,
        title: `Fork: ${truncatedTitle}`,
        description: originalTask.description,
        status: 'todo' as const,
        position,
        chatInit: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.insert(schema.tasks).values(newTask);

      const checkpointAttempt = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.id, checkpoint.attemptId)).get();
      const cutoffTime = checkpointAttempt?.createdAt ?? checkpoint.createdAt;

      const attemptIdMap = await copyAttemptsBeforeCheckpoint(db, originalTask.id, newTaskId, cutoffTime);
      await copyCheckpointsBeforeForkPoint(db, originalTask.id, newTaskId, checkpoint.createdAt, attemptIdMap);

      return { newTask, newTaskId, originalTask, checkpoint, attempt };
    },

    /**
     * Fetch a checkpoint and its related task, attempt, and project data.
     */
    async getCheckpointWithRelated(checkpointId: string) {
      const checkpoint = await db.select().from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, checkpointId)).get();
      if (!checkpoint) return null;

      const task = await db.select().from(schema.tasks)
        .where(eq(schema.tasks.id, checkpoint.taskId)).get();
      const attempt = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.id, checkpoint.attemptId)).get();
      const project = task
        ? await db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId)).get()
        : null;

      return { checkpoint, task, attempt, project };
    },

    /**
     * Delete the checkpoint's own attempt and all later attempts (with their logs/files),
     * then delete the checkpoint and all later checkpoints for the same task.
     */
    async rewindWithCleanup(checkpointId: string) {
      const checkpoint = await db.select().from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, checkpointId)).get();
      if (!checkpoint) throw new Error('Checkpoint not found');

      const task = await db.select().from(schema.tasks)
        .where(eq(schema.tasks.id, checkpoint.taskId)).get();
      const attempt = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.id, checkpoint.attemptId)).get();

      const laterAttempts = await db.select().from(schema.attempts)
        .where(and(eq(schema.attempts.taskId, checkpoint.taskId), gte(schema.attempts.createdAt, checkpoint.createdAt)))
        .all();

      const attemptIdsToDelete = new Set<string>(laterAttempts.map((a: any) => a.id as string));
      attemptIdsToDelete.add(checkpoint.attemptId as string);

      for (const attemptId of attemptIdsToDelete) {
        await db.delete(schema.attemptLogs).where(eq(schema.attemptLogs.attemptId, attemptId));
        await db.delete(schema.attemptFiles).where(eq(schema.attemptFiles.attemptId, attemptId));
        await db.delete(schema.attempts).where(eq(schema.attempts.id, attemptId));
      }

      const deletedCheckpoints = await db.delete(schema.checkpoints).where(
        and(eq(schema.checkpoints.taskId, checkpoint.taskId), gte(schema.checkpoints.createdAt, checkpoint.createdAt))
      ).returning();

      return { checkpoint, task, attempt, deletedAttemptCount: attemptIdsToDelete.size, deletedCheckpointCount: deletedCheckpoints.length };
    },

    /**
     * Full fork orchestration: getRelated → SDK file rewind → DB fork → setRewindState.
     */
    async forkWithSideEffects(checkpointId: string, deps: SdkRewindDeps) {
      const related = await this.getCheckpointWithRelated(checkpointId);
      if (!related) throw new CheckpointNotFoundError('Checkpoint not found');

      const { checkpoint, task: originalTask, attempt, project } = related;
      if (!originalTask) throw new CheckpointNotFoundError('Original task not found');

      let sdkRewindResult: { success: boolean; error?: string } | null = null;
      if (checkpoint.gitCommitHash && checkpoint.sessionId && project) {
        sdkRewindResult = await deps.attemptSdkFileRewind(checkpoint, project);
      }

      const { newTask, newTaskId } = await this.fork(checkpointId);

      if (checkpoint.gitCommitHash) {
        await deps.setRewindState(newTaskId, checkpoint.sessionId, checkpoint.gitCommitHash);
      }

      return {
        success: true, task: newTask, taskId: newTaskId,
        originalTaskId: originalTask.id, sessionId: checkpoint.sessionId,
        messageUuid: checkpoint.gitCommitHash, attemptId: checkpoint.attemptId,
        attemptPrompt: attempt?.prompt || null, sdkRewind: sdkRewindResult,
        conversationForked: !!checkpoint.gitCommitHash,
      };
    },

    /**
     * Full rewind orchestration: getRelated → SDK file rewind → DB cleanup → setRewindState.
     */
    async rewindWithSideEffects(checkpointId: string, rewindFiles: boolean, deps: SdkRewindDeps) {
      const related = await this.getCheckpointWithRelated(checkpointId);
      if (!related) throw new CheckpointNotFoundError('Checkpoint not found');

      const { checkpoint, attempt, project } = related;

      let sdkRewindResult: { success: boolean; error?: string } | null = null;
      if (rewindFiles && checkpoint.gitCommitHash && checkpoint.sessionId && project) {
        sdkRewindResult = await deps.attemptSdkFileRewind(checkpoint, project);
      }

      await this.rewindWithCleanup(checkpointId);

      if (checkpoint.gitCommitHash) {
        await deps.setRewindState(checkpoint.taskId, checkpoint.sessionId, checkpoint.gitCommitHash);
      }

      return {
        success: true, sessionId: checkpoint.sessionId,
        messageUuid: checkpoint.gitCommitHash, taskId: checkpoint.taskId,
        attemptId: checkpoint.attemptId, attemptPrompt: attempt?.prompt || null,
        sdkRewind: sdkRewindResult, conversationRewound: !!checkpoint.gitCommitHash,
      };
    },
  };
}
