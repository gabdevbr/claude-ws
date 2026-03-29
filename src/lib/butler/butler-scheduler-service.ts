/**
 * Butler Scheduler Service.
 * Persistent cron/schedule system for butler agent.
 * Stores scheduled tasks in app_settings and executes them on heartbeat.
 */
import { eq } from 'drizzle-orm';
import { createLogger } from '../logger';
import type { ButlerAction, ScheduledTask } from './butler-types';
import type { ButlerActionExecutor } from './butler-action-executor';

const log = createLogger('Butler:Scheduler');
const STORAGE_KEY = 'butler_scheduled_tasks';

export function createButlerSchedulerService(
  db: any,
  schema: any,
  actionExecutor: ButlerActionExecutor,
) {
  const tasks = new Map<string, ScheduledTask>();

  /** Load all scheduled tasks from database */
  async function loadTasks(): Promise<void> {
    try {
      const setting = await db.select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, STORAGE_KEY))
        .get();

      if (setting?.value) {
        const parsed = JSON.parse(setting.value) as ScheduledTask[];
        parsed.forEach(task => tasks.set(task.id, task));
        log.info({ count: tasks.size }, '[Scheduler] Tasks loaded');
      }
    } catch (err) {
      log.error({ err }, '[Scheduler] Failed to load tasks');
    }
  }

  /** Persist all scheduled tasks to database */
  async function persistTasks(): Promise<void> {
    try {
      const value = JSON.stringify(Array.from(tasks.values()));
      await db.insert(schema.appSettings)
        .values({ key: STORAGE_KEY, value, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: { value, updatedAt: Date.now() },
        });
    } catch (err) {
      log.error({ err }, '[Scheduler] Failed to persist tasks');
    }
  }

  /**
   * Parse cron expression and check if it matches current time.
   * Supports full 5-field cron: minute hour day-of-month month day-of-week
   * Special values: star (any), star-slash-N (step), N (exact), N-M (range), N,M (list)
   * Also supports legacy formats: star-slash-N (every N minutes), HH:MM (specific time)
   */
  function shouldRun(task: ScheduledTask, now: Date): boolean {
    if (!task.enabled) return false;

    // Check if we already ran this task in the current minute (deduplication)
    const lastRunMinute = task.lastRunAt ? new Date(task.lastRunAt) : null;
    if (lastRunMinute) {
      const sameMinute =
        lastRunMinute.getMinutes() === now.getMinutes() &&
        lastRunMinute.getHours() === now.getHours() &&
        lastRunMinute.getDate() === now.getDate();
      if (sameMinute) return false;
    }

    const expr = task.cronExpression.trim();

    // Legacy pattern: */N — every N minutes
    const intervalMatch = expr.match(/^\*\/(\d+)$/);
    if (intervalMatch) {
      const interval = parseInt(intervalMatch[1], 10);
      const minutes = now.getHours() * 60 + now.getMinutes();
      return minutes % interval === 0;
    }

    // Legacy pattern: HH:MM — specific time
    const timeMatch = expr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      return now.getHours() === hour && now.getMinutes() === minute;
    }

    // Full 5-field cron: minute hour day-of-month month day-of-week
    const fields = expr.split(/\s+/);
    if (fields.length !== 5) {
      log.warn({ expr: task.cronExpression }, '[Scheduler] Invalid cron format (expected 5 fields or legacy format)');
      return false;
    }

    const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = fields;
    const minute = now.getMinutes();
    const hour = now.getHours();
    const dayOfMonth = now.getDate();
    const month = now.getMonth() + 1; // JS months are 0-indexed
    const dayOfWeek = now.getDay(); // 0 = Sunday in JS

    return (
      matchesField(minuteField, minute, 0, 59) &&
      matchesField(hourField, hour, 0, 23) &&
      matchesField(dayOfMonthField, dayOfMonth, 1, 31) &&
      matchesField(monthField, month, 1, 12) &&
      matchesField(dayOfWeekField, dayOfWeek, 0, 6)
    );
  }

  /**
   * Check if a value matches a cron field specification.
   * Supports: star (any), star-slash-N (step), N (exact), N-M (range), N,M (list)
   */
  function matchesField(field: string, value: number, min: number, max: number): boolean {
    // Wildcard: matches any value
    if (field === '*') return true;

    // Step: */N or M-N/N
    const stepMatch = field.match(/^(\*|\d+-\d+)\/(\d+)$/);
    if (stepMatch) {
      const [, range, stepStr] = stepMatch;
      const step = parseInt(stepStr, 10);
      if (range === '*') {
        return value % step === 0;
      }
      const [start, end] = range.split('-').map(Number);
      if (value >= start && value <= end) {
        return (value - start) % step === 0;
      }
      return false;
    }

    // List: N,M,O
    if (field.includes(',')) {
      const values = field.split(',').map(Number);
      return values.includes(value);
    }

    // Range: N-M
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return value >= start && value <= end;
    }

    // Exact value: N
    const fieldValue = parseInt(field, 10);
    return fieldValue === value;
  }

  /** Calculate next run time for a task */
  function calculateNextRun(task: ScheduledTask): number | null {
    if (!task.enabled) return null;

    const expr = task.cronExpression.trim();
    const now = new Date();

    // Legacy pattern: */N — every N minutes
    const intervalMatch = expr.match(/^\*\/(\d+)$/);
    if (intervalMatch) {
      const interval = parseInt(intervalMatch[1], 10);
      return Date.now() + interval * 60_000;
    }

    // Legacy pattern: HH:MM — specific time
    const timeMatch = expr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }
      return target.getTime();
    }

    // Full 5-field cron: minute hour day-of-month month day-of-week
    const fields = expr.split(/\s+/);
    if (fields.length !== 5) {
      return null;
    }

    return calculateNextCronTime(fields, now);
  }

  /**
   * Calculate the next execution time for a 5-field cron expression.
   * This is a simplified implementation that iterates forward minute by minute
   * to find the next match (acceptable for scheduler use case).
   */
  function calculateNextCronTime(fields: string[], fromTime: Date): number | null {
    const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = fields;
    const maxIterations = 366 * 24 * 60; // Limit to 1 year ahead
    let iterations = 0;
    let current = new Date(fromTime);
    current.setSeconds(0, 0);
    current.setMinutes(current.getMinutes() + 1); // Start from next minute

    while (iterations < maxIterations) {
      iterations++;
      const minute = current.getMinutes();
      const hour = current.getHours();
      const dayOfMonth = current.getDate();
      const month = current.getMonth() + 1;
      const dayOfWeek = current.getDay();

      const matches =
        matchesField(minuteField, minute, 0, 59) &&
        matchesField(hourField, hour, 0, 23) &&
        matchesField(dayOfMonthField, dayOfMonth, 1, 31) &&
        matchesField(monthField, month, 1, 12) &&
        matchesField(dayOfWeekField, dayOfWeek, 0, 6);

      if (matches) {
        return current.getTime();
      }

      // Advance by 1 minute
      current.setMinutes(current.getMinutes() + 1);
    }

    log.warn({ cron: fields.join(' ') }, '[Scheduler] Could not calculate next run time within 1 year');
    return null;
  }

  /** Check and execute all scheduled tasks */
  async function checkAndExecute(): Promise<void> {
    const now = new Date();
    const tasksToRun: ScheduledTask[] = [];

    for (const task of tasks.values()) {
      if (shouldRun(task, now)) {
        tasksToRun.push(task);
      }
    }

    if (tasksToRun.length === 0) return;

    log.info({ count: tasksToRun.length }, '[Scheduler] Executing scheduled tasks');

    for (const task of tasksToRun) {
      try {
        const action: ButlerAction = {
          type: task.actionType,
          payload: task.actionPayload,
        };

        const result = await actionExecutor.execute(action);
        task.lastRunAt = Date.now();

        if (result.success) {
          log.info({ taskId: task.id, actionType: task.actionType }, '[Scheduler] Task executed');
        } else {
          log.error({ taskId: task.id, error: result.error }, '[Scheduler] Task failed');
        }
      } catch (err) {
        log.error({ err, taskId: task.id }, '[Scheduler] Task execution error');
      }
    }

    await persistTasks();
  }

  /** Create a new scheduled task */
  async function createTask(
    cronExpression: string,
    actionType: ScheduledTask['actionType'],
    actionPayload: Record<string, unknown>,
  ): Promise<ScheduledTask> {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const task: ScheduledTask = {
      id,
      cronExpression,
      actionType,
      actionPayload,
      enabled: true,
      createdAt: Date.now(),
      lastRunAt: null,
      nextRunAt: calculateNextRun({ id, cronExpression, actionType, actionPayload, enabled: true, createdAt: Date.now(), lastRunAt: null, nextRunAt: null }),
    };

    tasks.set(id, task);
    await persistTasks();

    log.info({ id, cronExpression, actionType }, '[Scheduler] Task created');
    return task;
  }

  /** List all scheduled tasks */
  function listTasks(): ScheduledTask[] {
    return Array.from(tasks.values());
  }

  /** Delete a scheduled task */
  async function deleteTask(id: string): Promise<boolean> {
    const deleted = tasks.delete(id);
    if (deleted) {
      await persistTasks();
      log.info({ id }, '[Scheduler] Task deleted');
    }
    return deleted;
  }

  /** Update a scheduled task */
  async function updateTask(
    id: string,
    updates: Partial<Pick<ScheduledTask, 'cronExpression' | 'actionType' | 'actionPayload' | 'enabled'>>,
  ): Promise<ScheduledTask | null> {
    const task = tasks.get(id);
    if (!task) return null;

    Object.assign(task, updates);
    if (updates.cronExpression) {
      task.nextRunAt = calculateNextRun(task);
    }

    await persistTasks();
    log.info({ id, updates }, '[Scheduler] Task updated');
    return task;
  }

  return {
    initialize: loadTasks,
    checkAndExecute,
    createTask,
    listTasks,
    deleteTask,
    updateTask,
  };
}

export type ButlerSchedulerService = ReturnType<typeof createButlerSchedulerService>;
