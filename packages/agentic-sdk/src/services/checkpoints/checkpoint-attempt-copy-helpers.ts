/**
 * Checkpoint attempt and checkpoint copy helpers used during fork operations.
 * Extracted from fork-and-rewind-operations.ts to keep files under 200 lines.
 */
import { eq, and, lt, asc } from 'drizzle-orm';
import * as schema from '../../db/database-schema';
import { generateId } from '../../lib/nanoid-id-generator';

/**
 * Copy attempts (and their logs) created before the cutoff time from one task to another.
 * Returns a map of old attempt ID -> new attempt ID.
 */
export async function copyAttemptsBeforeCheckpoint(
  db: any,
  originalTaskId: string,
  newTaskId: string,
  cutoffTime: number
): Promise<Map<string, string>> {
  const originalAttempts = await db.select().from(schema.attempts)
    .where(and(eq(schema.attempts.taskId, originalTaskId), lt(schema.attempts.createdAt, cutoffTime)))
    .orderBy(asc(schema.attempts.createdAt))
    .all();

  const attemptIdMap = new Map<string, string>();

  for (const orig of originalAttempts) {
    const newAttemptId = generateId('atmp');
    attemptIdMap.set(orig.id, newAttemptId);

    await db.insert(schema.attempts).values({
      id: newAttemptId,
      taskId: newTaskId,
      prompt: orig.prompt,
      displayPrompt: orig.displayPrompt,
      status: orig.status,
      sessionId: orig.sessionId,
      branch: orig.branch,
      diffAdditions: orig.diffAdditions,
      diffDeletions: orig.diffDeletions,
      totalTokens: orig.totalTokens,
      inputTokens: orig.inputTokens,
      outputTokens: orig.outputTokens,
      cacheCreationTokens: orig.cacheCreationTokens,
      cacheReadTokens: orig.cacheReadTokens,
      totalCostUSD: orig.totalCostUSD,
      numTurns: orig.numTurns,
      durationMs: orig.durationMs,
      contextUsed: orig.contextUsed,
      contextLimit: orig.contextLimit,
      contextPercentage: orig.contextPercentage,
      baselineContext: orig.baselineContext,
      createdAt: orig.createdAt,
      completedAt: orig.completedAt,
      outputFormat: orig.outputFormat,
      outputSchema: orig.outputSchema,
    });

    // Copy attempt logs
    const logs = await db.select().from(schema.attemptLogs)
      .where(eq(schema.attemptLogs.attemptId, orig.id))
      .orderBy(asc(schema.attemptLogs.createdAt))
      .all();

    for (const logEntry of logs) {
      await db.insert(schema.attemptLogs).values({
        attemptId: newAttemptId,
        type: logEntry.type,
        content: logEntry.content,
        createdAt: logEntry.createdAt,
      });
    }
  }

  return attemptIdMap;
}

/**
 * Copy checkpoints created before the fork point from one task to another.
 * Returns count of checkpoints copied.
 */
export async function copyCheckpointsBeforeForkPoint(
  db: any,
  originalTaskId: string,
  newTaskId: string,
  forkCheckpointCreatedAt: number,
  attemptIdMap: Map<string, string>
): Promise<number> {
  const originalCheckpoints = await db.select().from(schema.checkpoints)
    .where(and(
      eq(schema.checkpoints.taskId, originalTaskId),
      lt(schema.checkpoints.createdAt, forkCheckpointCreatedAt)
    ))
    .orderBy(asc(schema.checkpoints.createdAt))
    .all();

  for (const origCp of originalCheckpoints) {
    const newAttemptId = attemptIdMap.get(origCp.attemptId);
    if (!newAttemptId) continue;
    await db.insert(schema.checkpoints).values({
      id: generateId('chkpt'),
      taskId: newTaskId,
      attemptId: newAttemptId,
      sessionId: origCp.sessionId,
      gitCommitHash: origCp.gitCommitHash,
      messageCount: origCp.messageCount,
      summary: origCp.summary,
      createdAt: origCp.createdAt,
    });
  }

  return originalCheckpoints.length;
}
