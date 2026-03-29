/**
 * Butler Attempt Resumption Service.
 * After server restart, detects in_progress Butler tasks and resumes their conversations.
 * Handles two cases:
 *   1. Stale 'running' attempts (agent died mid-response) — cancel and resume
 *   2. In_progress tasks with no running attempt (restart between messages) — start resume
 */
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createLogger } from '../logger';
import type { PersonaFiles } from './butler-types';

const log = createLogger('Butler:Resume');

/** Build persona prompt prefix from persona files */
export function buildPersonaPrompt(persona: PersonaFiles): string {
  const sections: string[] = [];
  if (persona.soul) sections.push(`<persona:soul>\n${persona.soul}\n</persona:soul>`);
  if (persona.identity) sections.push(`<persona:identity>\n${persona.identity}\n</persona:identity>`);
  if (persona.agents) sections.push(`<persona:agents>\n${persona.agents}\n</persona:agents>`);
  if (persona.user) sections.push(`<persona:user>\n${persona.user}\n</persona:user>`);
  if (persona.memory) sections.push(`<persona:memory>\n${persona.memory}\n</persona:memory>`);
  return sections.join('\n\n');
}

interface ResumptionDeps {
  db: any;
  schema: any;
  agentManager: any;
  sessionManager: any;
  io: any;
  projectId: string;
  persona: PersonaFiles;
}

/**
 * Resume in_progress Butler tasks after server restart.
 * 1. Cancel any stale 'running' attempts (agent killed by restart)
 * 2. For each in_progress task, start a new resume attempt
 */
export async function resumeStaleAttempts(deps: ResumptionDeps): Promise<void> {
  const { db, schema: s, agentManager, sessionManager, io, projectId, persona } = deps;

  try {
    // Find in_progress tasks on Butler's project
    const inProgressTasks = await db.select()
      .from(s.tasks)
      .where(and(
        eq(s.tasks.projectId, projectId),
        eq(s.tasks.status, 'in_progress'),
      ))
      .all();

    if (inProgressTasks.length === 0) {
      log.info('[Butler] No in_progress tasks to resume');
      return;
    }

    // Also cancel any stale running attempts across ALL butler tasks
    const allButlerTasks = await db.select()
      .from(s.tasks)
      .where(eq(s.tasks.projectId, projectId))
      .all();

    for (const task of allButlerTasks) {
      const runningAttempts = await db.select()
        .from(s.attempts)
        .where(and(
          eq(s.attempts.taskId, task.id),
          eq(s.attempts.status, 'running'),
        ))
        .all();

      for (const attempt of runningAttempts) {
        await db.update(s.attempts)
          .set({ status: 'cancelled' })
          .where(eq(s.attempts.id, attempt.id));
        log.info({ attemptId: attempt.id, taskId: task.id }, '[Butler] Cancelled stale attempt');
      }
    }

    // Get project info (needed for projectPath)
    const project = await db.select()
      .from(s.projects)
      .where(eq(s.projects.id, projectId))
      .get();

    if (!project) {
      log.error('[Butler] Butler project not found in DB');
      return;
    }

    // Resume each in_progress task
    for (const task of inProgressTasks) {
      const sessionOptions = await sessionManager.getSessionOptionsWithAutoFix(task.id);
      if (!sessionOptions.resume) {
        log.info({ taskId: task.id }, '[Butler] No resumable session, skipping');
        continue;
      }

      // Create new attempt for resume
      const newAttemptId = nanoid();
      await db.insert(s.attempts).values({
        id: newAttemptId,
        taskId: task.id,
        prompt: 'Server restarted. Resuming conversation.',
        displayPrompt: '',
        status: 'running',
        outputFormat: null,
        outputSchema: null,
      });

      // Build prompt with persona context
      const personaPrefix = buildPersonaPrompt(persona);
      const resumePrompt = personaPrefix
        ? `${personaPrefix}\n\n---\n\nServer restarted. Resuming conversation. Acknowledge the resume briefly.`
        : 'Server restarted. Resuming conversation. Acknowledge the resume briefly.';

      // Start agent with session resume
      agentManager.start({
        attemptId: newAttemptId,
        projectPath: project.path,
        prompt: resumePrompt,
        sessionOptions,
      });

      // Notify all connected clients
      io.emit('attempt:started', { attemptId: newAttemptId, taskId: task.id });
      io.emit('task:started', { taskId: task.id });

      log.info({ taskId: task.id, attemptId: newAttemptId, session: sessionOptions.resume },
        '[Butler] Auto-resumed task conversation');
    }
  } catch (err) {
    log.error({ err }, '[Butler] Failed to resume stale attempts');
  }
}
