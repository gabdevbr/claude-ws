/**
 * Butler Decision Loop.
 * Orchestrates the hybrid event-driven + timer evaluation cycle.
 * On each heartbeat: flush events → rule engine → optional AI reasoning → execute actions → log.
 */
import { createLogger } from '../logger';
import type { ButlerEventCollector } from './butler-event-collector';
import type { ButlerRuleEngine } from './butler-rule-engine';
import type { ButlerPromptBuilder } from './butler-prompt-builder';
import type { ButlerSessionSpawner } from './butler-session-spawner';
import type { ButlerActionExecutor } from './butler-action-executor';
import type { ButlerWorkspaceApi } from './butler-workspace-api';
import type { createButlerMemoryManager } from './butler-memory-manager';

const log = createLogger('Butler:DecisionLoop');

interface DecisionLoopDeps {
  eventCollector: ButlerEventCollector;
  ruleEngine: ButlerRuleEngine;
  promptBuilder: ButlerPromptBuilder;
  sessionSpawner: ButlerSessionSpawner;
  actionExecutor: ButlerActionExecutor;
  workspaceApi: ButlerWorkspaceApi;
  memoryManager: ReturnType<typeof createButlerMemoryManager>;
  projectPath: string;
}

export function createButlerDecisionLoop(deps: DecisionLoopDeps) {
  let evaluating = false; // prevent concurrent evaluations

  return {
    /** Main evaluation cycle — called on every heartbeat tick */
    async evaluate(): Promise<void> {
      // Skip if previous evaluation still running
      if (evaluating) {
        log.debug('[Butler] Skipping evaluation — previous cycle still running');
        return;
      }

      const events = deps.eventCollector.flush();
      // Allow evaluation even with no events (for idle workspace detection)

      evaluating = true;
      try {
        const snapshot = await deps.workspaceApi.getWorkspaceSnapshot();

        // Rule-based evaluation (fast, no AI)
        const { actions: ruleActions, needsReasoning } = deps.ruleEngine.evaluate(events, snapshot);

        // Execute immediate rule-based actions
        if (ruleActions.length > 0) {
          await deps.actionExecutor.executeBatch(ruleActions);
          log.info({ count: ruleActions.length }, '[Butler] Rule actions executed');
        }

        // Spawn Claude session for complex reasoning if needed and rate limit allows
        if (needsReasoning && deps.sessionSpawner.canSpawn()) {
          log.info('[Butler] Spawning reasoning session');
          const prompt = await deps.promptBuilder.buildReasoningPrompt(
            deps.projectPath, events, snapshot,
          );
          const { actions: aiActions, reasoning, dailyNote } = await deps.sessionSpawner.spawn(prompt);

          if (aiActions.length > 0) {
            await deps.actionExecutor.executeBatch(aiActions);
            log.info({ count: aiActions.length, reasoning }, '[Butler] AI actions executed');
          }

          // Write AI daily note if provided
          if (dailyNote) {
            deps.memoryManager.writeDailyNote(deps.projectPath, dailyNote);
          }
        }

        // Append evaluation summary to daily note
        deps.memoryManager.writeDailyNote(
          deps.projectPath,
          `Processed ${events.length} events. Rules: ${ruleActions.length} actions. AI: ${needsReasoning ? 'triggered' : 'skipped'}.`,
        );
      } catch (err) {
        log.error({ err }, '[Butler] Decision loop evaluation failed');
      } finally {
        evaluating = false;
      }
    },
  };
}

export type ButlerDecisionLoop = ReturnType<typeof createButlerDecisionLoop>;
