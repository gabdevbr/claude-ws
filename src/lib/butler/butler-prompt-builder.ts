/**
 * Butler Prompt Builder.
 * Assembles persona files + memory + workspace snapshot + events into
 * a structured system prompt for Claude reasoning sessions.
 * Session protocol: SOUL → IDENTITY → AGENTS → USER → MEMORY → recent notes → workspace → events.
 */
import { createLogger } from '../logger';
import type { PersonaFiles, ButlerEvent, WorkspaceSnapshot } from './butler-types';
import type { createButlerPersonaLoader } from './butler-persona-loader';
import type { createButlerMemoryManager } from './butler-memory-manager';

const log = createLogger('Butler:Prompt');

export function createButlerPromptBuilder(
  personaLoader: ReturnType<typeof createButlerPersonaLoader>,
  memoryManager: ReturnType<typeof createButlerMemoryManager>,
) {
  /** Assemble persona files in session protocol order */
  function assemblePersonaContext(persona: PersonaFiles, recentNotes: string[]): string {
    const sections: string[] = [];

    if (persona.soul) sections.push(`<persona:soul>\n${persona.soul}\n</persona:soul>`);
    if (persona.identity) sections.push(`<persona:identity>\n${persona.identity}\n</persona:identity>`);
    if (persona.agents) sections.push(`<persona:agents>\n${persona.agents}\n</persona:agents>`);
    if (persona.user) sections.push(`<persona:user>\n${persona.user}\n</persona:user>`);
    if (persona.memory) sections.push(`<persona:memory>\n${persona.memory}\n</persona:memory>`);

    if (recentNotes.length > 0) {
      sections.push(`<recent_activity>\n${recentNotes.join('\n---\n')}\n</recent_activity>`);
    }

    return sections.join('\n\n');
  }

  /** Format workspace snapshot as concise context */
  function formatWorkspaceContext(snapshot: WorkspaceSnapshot): string {
    const projectLines = snapshot.projects.map(p => {
      const counts = Object.entries(p.taskCounts).map(([s, c]) => `${s}:${c}`).join(', ');
      return `- ${p.name} (${counts || 'no tasks'})`;
    });

    return [
      `<workspace>`,
      `Total projects: ${snapshot.projects.length}`,
      `Total tasks: ${snapshot.totalTasks} (${Object.entries(snapshot.tasksByStatus).map(([s, c]) => `${s}:${c}`).join(', ')})`,
      ``,
      `Projects:`,
      ...projectLines,
      `</workspace>`,
    ].join('\n');
  }

  /** Format events as concise context */
  function formatEventsContext(events: ButlerEvent[]): string {
    if (events.length === 0) return '';
    const lines = events.slice(-20).map(e => {
      const time = new Date(e.timestamp).toISOString().substring(11, 19);
      return `- [${time}] ${e.type}: ${JSON.stringify(e.payload)}`;
    });
    return `<recent_events>\n${lines.join('\n')}\n</recent_events>`;
  }

  return {
    /** Build full reasoning prompt with persona + memory + workspace + events */
    async buildReasoningPrompt(
      projectPath: string,
      events: ButlerEvent[],
      workspaceSnapshot: WorkspaceSnapshot,
    ): Promise<string> {
      const persona = personaLoader.loadAll(projectPath);
      const recentNotes = memoryManager.listRecentDailyNotes(projectPath, 3);
      const personaContext = assemblePersonaContext(persona, recentNotes);
      const workspaceContext = formatWorkspaceContext(workspaceSnapshot);
      const eventsContext = formatEventsContext(events);

      const prompt = [
        personaContext,
        workspaceContext,
        eventsContext,
        '',
        this.buildActionResponseFormat(),
      ].filter(Boolean).join('\n\n');

      return prompt;
    },

    /** JSON response format instruction for Claude */
    buildActionResponseFormat(): string {
      return [
        '<instructions>',
        'Analyze the workspace state and recent events. Decide what actions to take.',
        'Respond with valid JSON only:',
        '```json',
        '{',
        '  "actions": [',
        '    { "type": "create_task|update_task|send_notification|create_communication_task", "payload": {} }',
        '  ],',
        '  "reasoning": "Brief explanation of your decisions",',
        '  "daily_note": "Summary of what you observed and decided"',
        '}',
        '```',
        'Action types:',
        '- create_task: { projectId, title, description }',
        '- update_task: { id, status?, title?, description? }',
        '- send_notification: { type: info|warning|suggestion, title, body }',
        '- create_communication_task: { title, message }',
        'If no action needed, return empty actions array.',
        '</instructions>',
      ].join('\n');
    },
  };
}

export type ButlerPromptBuilder = ReturnType<typeof createButlerPromptBuilder>;
