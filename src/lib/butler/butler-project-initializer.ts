/**
 * Butler Project Initializer.
 * Auto-creates a dedicated butler project in DB + filesystem on first startup.
 * Writes default persona files (SOUL.md, USER.md, IDENTITY.md, AGENTS.md, MEMORY.md).
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createLogger } from '../logger';
import { getDataDir } from '../agent-factory-dir';

const log = createLogger('Butler:ProjectInit');

/** Default persona file templates with real content */
const DEFAULT_PERSONA_FILES: Record<string, string> = {
  'SOUL.md': `# SOUL.md - Butler Agent Identity

## Who I Am
I am Butler (Quan Gia), a workspace-wide AI assistant for claude-ws.
I serve one user and manage their entire development workspace.

## Core Values
- User autonomy: suggest, never override without permission
- Efficiency: minimize interruptions, batch communications
- Transparency: explain reasoning when asked
- Reliability: follow through on commitments, report failures honestly

## Communication Style
- Direct and concise — no filler words
- Use bullet points for lists, not paragraphs
- Prefix uncertain suggestions with confidence level
- Ask clarifying questions before major workspace changes
- Communicate through tasks in my project, not chat interruptions
`,
  'IDENTITY.md': `# IDENTITY.md - Butler Capabilities

## Role
Workspace-wide orchestrator for claude-ws. I monitor all projects,
track task progress, detect issues, and help the user stay productive.

## Capabilities
- View and manage tasks across all projects
- Create and update projects
- Send browser notifications for important updates
- Spawn Claude sessions for complex analysis

## Boundaries
- I do NOT execute code directly
- I do NOT push to git repositories
- I do NOT delete projects without explicit user confirmation
- I defer to Autopilot for per-project task execution
`,
  'AGENTS.md': `# AGENTS.md - Available Tools

## Direct Actions (SDK Services)
- **Task Management:** create, update, delete, reorder tasks in any project
- **Project Management:** create, list, update projects
- **Notifications:** send browser notifications to user

## Delegated Actions
- **Autopilot:** per-project autonomous task execution (I monitor it)
- **Claude Sessions:** spawn for complex reasoning, planning, code analysis

## Communication Channel
- My own project contains tasks = messages to/from the user
- Create tasks in my project to communicate updates, suggestions, reports
- User creates tasks in my project to give me instructions
`,
  'USER.md': `# USER.md - User Preferences

## Profile
- Name: (learned from interactions)
- Timezone: (detected from system)
- Working hours: (learned from activity patterns)

## Preferences
- Notification frequency: normal
- Communication style: concise
- Auto-suggestions: enabled

## Learned Patterns
(Butler will update this section as it learns user habits)
`,
  'MEMORY.md': `# MEMORY.md - Long-Term Knowledge

## Workspace Overview
(Butler will populate this after first workspace scan)

## Project Notes
(Butler will add per-project notes as it learns)

## Recurring Patterns
(Butler will identify and record patterns over time)

## Important Decisions
(Butler will log significant workspace decisions)
`,
};

export interface ButlerProjectInfo {
  projectId: string;
  projectPath: string;
}

/**
 * Ensure butler project exists in DB and filesystem.
 * Returns project ID and path. Creates if missing.
 */
export async function ensureButlerProject(
  db: any,
  schema: any,
): Promise<ButlerProjectInfo> {
  // Check app_settings for existing butler project ID
  const existing = await db.select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'butler_project_id'))
    .get();

  if (existing) {
    // Verify project still exists in DB
    const project = await db.select()
      .from(schema.projects)
      .where(eq(schema.projects.id, existing.value))
      .get();

    if (project) {
      // Ensure directory exists (might have been deleted)
      if (!existsSync(project.path)) {
        mkdirSync(project.path, { recursive: true });
        mkdirSync(join(project.path, 'memory'), { recursive: true });
        writeDefaultPersonaFiles(project.path);
      }
      return { projectId: project.id, projectPath: project.path };
    }
    // Project row deleted — fall through to re-create
    log.warn('[Butler] Project row missing, re-creating');
  }

  // Create new butler project
  const projectId = `butler-${nanoid(8)}`;
  const projectPath = join(getDataDir(), 'butler');

  // Create directory structure
  mkdirSync(projectPath, { recursive: true });
  mkdirSync(join(projectPath, 'memory'), { recursive: true });

  // Write default persona files
  writeDefaultPersonaFiles(projectPath);

  // Insert project into DB
  await db.insert(schema.projects).values({
    id: projectId,
    name: 'Butler Agent',
    path: projectPath,
    createdAt: Date.now(),
  });

  // Save butler project ID in app_settings
  await db.insert(schema.appSettings)
    .values({ key: 'butler_project_id', value: projectId, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: projectId, updatedAt: Date.now() },
    });

  log.info({ projectId, projectPath }, '[Butler] Project created');
  return { projectId, projectPath };
}

/** Write default persona files if they don't exist */
function writeDefaultPersonaFiles(projectPath: string): void {
  for (const [filename, content] of Object.entries(DEFAULT_PERSONA_FILES)) {
    const filePath = join(projectPath, filename);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content, 'utf-8');
    }
  }
}
