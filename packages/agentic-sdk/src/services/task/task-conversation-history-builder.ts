/**
 * Task conversation history builder - assembles per-attempt turn pairs from attempt logs.
 * Deduplicates tool_use blocks by id, text blocks by content prefix.
 * Extracted from task-attempt-and-conversation-queries.ts to keep files under 200 lines.
 */
import { eq, asc } from 'drizzle-orm';
import * as schema from '../../db/database-schema';

export type ConversationTurn = {
  type: 'user' | 'assistant';
  prompt?: string;
  messages: any[];
  attemptId: string;
  timestamp: number;
  files?: any[];
  attemptStatus?: string;
};

/**
 * Build conversation turns from all attempts for a task.
 * Returns user/assistant turn pairs ordered by attempt creation time.
 */
export async function buildConversationHistory(db: any, taskId: string): Promise<ConversationTurn[]> {
  const attempts = await db.select().from(schema.attempts)
    .where(eq(schema.attempts.taskId, taskId))
    .orderBy(schema.attempts.createdAt)
    .all();

  const turns: ConversationTurn[] = [];

  for (const attempt of attempts) {
    const files = await db.select().from(schema.attemptFiles)
      .where(eq(schema.attemptFiles.attemptId, attempt.id))
      .orderBy(asc(schema.attemptFiles.createdAt))
      .all();

    turns.push({
      type: 'user',
      prompt: attempt.displayPrompt || attempt.prompt,
      messages: [],
      attemptId: attempt.id,
      timestamp: attempt.createdAt,
      files: files.length > 0 ? files : undefined,
      attemptStatus: attempt.status,
    });

    const logs = await db.select().from(schema.attemptLogs)
      .where(eq(schema.attemptLogs.attemptId, attempt.id))
      .orderBy(asc(schema.attemptLogs.createdAt))
      .all();

    const allContentBlocks: any[] = [];
    const seenToolIds = new Set<string>();
    const seenTextHashes = new Set<string>();
    const toolResultMap = new Map<string, any>();
    const userAnswerMessages: any[] = [];

    for (const log of logs) {
      if (log.type !== 'json') continue;
      try {
        const parsed = JSON.parse(log.content);
        if (parsed.type === 'system') continue;

        if (parsed.type === 'user_answer') {
          allContentBlocks.push({ type: 'text', text: parsed.displayText || JSON.stringify(parsed) });
          userAnswerMessages.push(parsed);
          continue;
        }

        if (parsed.type === 'assistant' && parsed.message?.content) {
          for (const block of parsed.message.content) {
            if (block.type === 'tool_use' && block.id) {
              if (!seenToolIds.has(block.id)) { allContentBlocks.push(block); seenToolIds.add(block.id); }
            } else if (block.type === 'text' && block.text) {
              const h = block.text.substring(0, 100);
              if (!seenTextHashes.has(h)) { allContentBlocks.push(block); seenTextHashes.add(h); }
            } else if (block.type === 'thinking' && block.thinking) {
              const h = 'think:' + block.thinking.substring(0, 100);
              if (!seenTextHashes.has(h)) { allContentBlocks.push(block); seenTextHashes.add(h); }
            }
          }
        } else if (parsed.type === 'user' && parsed.message?.content) {
          for (const block of parsed.message.content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              toolResultMap.set(block.tool_use_id, {
                type: 'tool_result',
                tool_data: { tool_use_id: block.tool_use_id },
                result: block.content || '',
                is_error: block.is_error || false,
              });
            }
          }
        }
      } catch { /* skip invalid JSON */ }
    }

    const messages: any[] = [
      ...Array.from(toolResultMap.values()),
      ...(allContentBlocks.length > 0 ? [{ type: 'assistant', message: { content: allContentBlocks } }] : []),
      ...userAnswerMessages,
    ];

    if (messages.length > 0) {
      turns.push({ type: 'assistant', messages, attemptId: attempt.id, timestamp: attempt.createdAt, attemptStatus: attempt.status });
    }
  }

  return turns;
}
