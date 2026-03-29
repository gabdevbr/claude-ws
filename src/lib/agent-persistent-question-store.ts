/**
 * Agent Persistent Question Store - Task-scoped AskUserQuestion data that survives agent cleanup AND server restarts
 *
 * Stores pending question payloads keyed by taskId in the `tasks.pending_question` DB column
 * with an in-memory cache for fast reads. Data survives both agent cleanup and server restarts.
 * Used when CLI auto-handles AskUserQuestion and the attempt ends before user answers.
 */

import { db, schema } from './db';
import { eq } from 'drizzle-orm';

export interface PersistentQuestionData {
  attemptId: string;
  toolUseId: string;
  questions: unknown[];
  timestamp: number;
}

/**
 * PersistentQuestionStore - DB-backed with in-memory cache
 */
export class PersistentQuestionStore {
  private cache = new Map<string, PersistentQuestionData>();

  /** Persist question data for a task (writes to DB + cache) */
  set(taskId: string, data: PersistentQuestionData): void {
    this.cache.set(taskId, data);
    try {
      db.update(schema.tasks)
        .set({ pendingQuestion: JSON.stringify(data) })
        .where(eq(schema.tasks.id, taskId))
        .run();
    } catch {
      // DB write failure is non-fatal — in-memory cache still works for current session
    }
  }

  /** Retrieve persisted question data: cache first, then DB fallback */
  get(taskId: string): PersistentQuestionData | null {
    const cached = this.cache.get(taskId);
    if (cached) return cached;

    try {
      const row = db.select({ pendingQuestion: schema.tasks.pendingQuestion })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId))
        .get();
      if (row?.pendingQuestion) {
        const data = JSON.parse(row.pendingQuestion) as PersistentQuestionData;
        this.cache.set(taskId, data);
        return data;
      }
    } catch {
      // DB read failure — no question available
    }
    return null;
  }

  /** Remove persisted question data (clears both cache and DB) */
  clear(taskId: string): void {
    this.cache.delete(taskId);
    try {
      db.update(schema.tasks)
        .set({ pendingQuestion: null })
        .where(eq(schema.tasks.id, taskId))
        .run();
    } catch {
      // DB write failure is non-fatal
    }
  }
}
