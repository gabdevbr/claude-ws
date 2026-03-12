/**
 * Canonical list of valid task status values — shared across all task route files.
 * Single source of truth to avoid drift between route validators.
 */
export const VALID_TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const;

export type TaskStatus = typeof VALID_TASK_STATUSES[number];
