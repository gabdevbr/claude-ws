/**
 * Butler Rule Engine.
 * Evaluates workspace events + state using simple rules (no AI needed).
 * Returns immediate actions and a needsReasoning flag for complex decisions.
 * Each rule defines its required model tier for Phase 3 session spawner.
 */
import { createLogger } from '../logger';
import type { ButlerEvent, ButlerAction, WorkspaceSnapshot } from './butler-types';

const log = createLogger('Butler:Rules');

export interface RuleResult {
  actions: ButlerAction[];
  needsReasoning: boolean;
}

/** A single rule: pure function evaluating events + state */
interface ButlerRule {
  name: string;
  /** Model tier required if this rule triggers reasoning */
  modelTier: 'haiku' | 'sonnet';
  evaluate: (events: ButlerEvent[], snapshot: WorkspaceSnapshot) => ButlerAction[];
  /** Whether this rule can trigger needsReasoning */
  canTriggerReasoning?: boolean;
}

/** Rule: notify user when a task has failed 3+ times (error_threshold pattern) */
const taskFailureRule: ButlerRule = {
  name: 'task_repeated_failure',
  modelTier: 'haiku',
  evaluate(events) {
    const actions: ButlerAction[] = [];
    // Count failure events per task
    const failureCounts = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'task:finished' && e.payload.status === 'failed') {
        const taskId = e.payload.taskId as string;
        failureCounts.set(taskId, (failureCounts.get(taskId) || 0) + 1);
      }
    }
    for (const [taskId, count] of failureCounts) {
      if (count >= 3) {
        actions.push({
          type: 'send_notification',
          payload: { type: 'warning', title: 'Task Failing Repeatedly', body: `Task ${taskId} has failed ${count} times.`, taskId },
        });
      }
    }
    return actions;
  },
};

/** Track projects already notified as complete — prevents repeated notifications */
const notifiedCompleteProjects = new Set<string>();

/**
 * Seed completed projects set from current workspace state on startup.
 * Prevents re-notifying about already-complete projects after server restart.
 */
export function seedCompletedProjects(snapshot: WorkspaceSnapshot): void {
  for (const project of snapshot.projects) {
    const total = Object.values(project.taskCounts).reduce((a, b) => a + b, 0);
    const doneOrCancelled = (project.taskCounts['done'] || 0) + (project.taskCounts['cancelled'] || 0);
    if (total > 0 && total === doneOrCancelled) {
      notifiedCompleteProjects.add(project.id);
    }
  }
  log.info({ count: notifiedCompleteProjects.size }, '[Butler] Seeded already-complete projects');
}

/** Rule: notify user when all tasks in a project are done */
const projectCompleteRule: ButlerRule = {
  name: 'project_complete',
  modelTier: 'haiku',
  evaluate(events, snapshot) {
    const actions: ButlerAction[] = [];
    for (const project of snapshot.projects) {
      const total = Object.values(project.taskCounts).reduce((a, b) => a + b, 0);
      const doneOrCancelled = (project.taskCounts['done'] || 0) + (project.taskCounts['cancelled'] || 0);
      const isComplete = total > 0 && total === doneOrCancelled;

      if (isComplete) {
        // Skip if already notified for this project
        if (notifiedCompleteProjects.has(project.id)) continue;

        // Only fire if a task in THIS project recently completed (not any global task)
        const hasRecentCompletion = events.some(e =>
          e.type === 'task:finished' && e.payload.status === 'completed'
          && e.payload.projectId === project.id
        );
        if (hasRecentCompletion) {
          notifiedCompleteProjects.add(project.id);
          actions.push({
            type: 'send_notification',
            payload: { type: 'info', title: 'Project Complete', body: `All tasks in "${project.name}" are done.`, projectId: project.id },
          });
        }
      } else {
        // Project no longer complete — allow re-notification if it completes again
        notifiedCompleteProjects.delete(project.id);
      }
    }
    return actions;
  },
};

/** Rule: detect idle workspace (no events) — suggest next priorities */
const idleWorkspaceRule: ButlerRule = {
  name: 'idle_workspace',
  modelTier: 'sonnet',
  canTriggerReasoning: true,
  evaluate(events, snapshot) {
    // If no events and there are pending tasks — might need reasoning about priorities
    if (events.length === 0 && (snapshot.tasksByStatus['todo'] || 0) > 5) {
      // Don't return actions — just signal needsReasoning via canTriggerReasoning
      return [];
    }
    return [];
  },
};

/** Rule: new project created — log it */
const newProjectRule: ButlerRule = {
  name: 'project_welcome',
  modelTier: 'haiku',
  evaluate(events) {
    const actions: ButlerAction[] = [];
    for (const e of events) {
      if (e.type === 'project:created') {
        actions.push({
          type: 'send_notification',
          payload: { type: 'info', title: 'New Project', body: `Project "${e.payload.name}" created.` },
        });
      }
    }
    return actions;
  },
};

/** Rule: agent error spike — notify if multiple agent errors in one cycle */
const agentErrorRule: ButlerRule = {
  name: 'agent_error_spike',
  modelTier: 'haiku',
  evaluate(events) {
    const actions: ButlerAction[] = [];
    const errorCount = events.filter(e => e.type === 'agent:error').length;
    if (errorCount >= 3) {
      actions.push({
        type: 'send_notification',
        payload: { type: 'error', title: 'Agent Errors', body: `${errorCount} agent errors detected in this cycle.` },
      });
    }
    return actions;
  },
};

/** Rule: when a task attempt completes, move Butler-project tasks to in_review and notify */
const taskCompletionRule: ButlerRule = {
  name: 'task_completion',
  modelTier: 'haiku',
  evaluate(events) {
    const actions: ButlerAction[] = [];
    for (const e of events) {
      if (e.type === 'task:finished' && e.payload.status === 'completed') {
        const taskId = e.payload.taskId as string;
        const projectId = e.payload.projectId as string | undefined;
        const taskTitle = e.payload.taskTitle as string | undefined;
        const projectName = e.payload.projectName as string | undefined;

        // Move task to in_review
        actions.push({
          type: 'update_task',
          payload: { id: taskId, status: 'in_review' },
        });

        // Notify user with task-specific description
        const displayTitle = taskTitle ? `"${taskTitle}" Completed` : 'Task Completed';
        const displayBody = taskTitle
          ? `"${taskTitle}" finished and moved to review.`
          : 'Task finished and moved to review.';
        actions.push({
          type: 'send_notification',
          payload: {
            type: 'task_update',
            title: displayTitle,
            body: displayBody,
            taskId,
            projectId,
            projectName,
          },
        });
      }
    }
    return actions;
  },
};

/** All registered rules */
const RULES: ButlerRule[] = [
  taskFailureRule,
  taskCompletionRule,
  projectCompleteRule,
  idleWorkspaceRule,
  newProjectRule,
  agentErrorRule,
];

export function createButlerRuleEngine() {
  return {
    /** Evaluate all rules against events and workspace state */
    evaluate(events: ButlerEvent[], snapshot: WorkspaceSnapshot): RuleResult {
      const allActions: ButlerAction[] = [];
      let needsReasoning = false;

      for (const rule of RULES) {
        try {
          const actions = rule.evaluate(events, snapshot);
          allActions.push(...actions);

          // Check if this rule wants to trigger AI reasoning
          if (rule.canTriggerReasoning && events.length === 0) {
            // Only trigger reasoning for idle rules when workspace has pending work
            if ((snapshot.tasksByStatus['todo'] || 0) > 5) {
              needsReasoning = true;
            }
          }
        } catch (err) {
          log.error({ err, rule: rule.name }, '[Butler] Rule evaluation failed');
        }
      }

      // Complex event patterns also trigger reasoning
      if (events.length > 10) {
        needsReasoning = true;
      }

      return { actions: allActions, needsReasoning };
    },
  };
}

export type ButlerRuleEngine = ReturnType<typeof createButlerRuleEngine>;
