/**
 * Butler Memory Manager.
 * Handles daily notes (memory/YYYY-MM-DD.md) and long-term MEMORY.md.
 * All writes append — no destructive overwrites.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../logger';

const log = createLogger('Butler:Memory');

/** Format date as YYYY-MM-DD */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Format time as HH:MM */
function formatTime(date: Date): string {
  return date.toISOString().split('T')[1].substring(0, 5);
}

export function createButlerMemoryManager() {
  return {
    /** Read long-term MEMORY.md */
    readLongTermMemory(projectPath: string): string | null {
      const filePath = join(projectPath, 'MEMORY.md');
      if (!existsSync(filePath)) return null;
      try {
        return readFileSync(filePath, 'utf-8');
      } catch (err) {
        log.warn({ err }, '[Butler] Failed to read MEMORY.md');
        return null;
      }
    },

    /** Append an entry to long-term MEMORY.md */
    appendLongTermMemory(projectPath: string, entry: string): void {
      const filePath = join(projectPath, 'MEMORY.md');
      try {
        appendFileSync(filePath, `\n${entry}\n`, 'utf-8');
      } catch (err) {
        log.error({ err }, '[Butler] Failed to append to MEMORY.md');
      }
    },

    /** Write/append to today's daily note */
    writeDailyNote(projectPath: string, content: string): void {
      const now = new Date();
      const dateStr = formatDate(now);
      const timeStr = formatTime(now);
      const filePath = join(projectPath, 'memory', `${dateStr}.md`);

      try {
        if (!existsSync(filePath)) {
          writeFileSync(filePath, `# Daily Note - ${dateStr}\n\n`, 'utf-8');
        }
        appendFileSync(filePath, `## ${timeStr}\n${content}\n\n`, 'utf-8');
      } catch (err) {
        log.error({ err }, '[Butler] Failed to write daily note');
      }
    },

    /** Read a specific daily note */
    readDailyNote(projectPath: string, date?: Date): string | null {
      const dateStr = formatDate(date || new Date());
      const filePath = join(projectPath, 'memory', `${dateStr}.md`);
      if (!existsSync(filePath)) return null;
      try {
        return readFileSync(filePath, 'utf-8');
      } catch {
        return null;
      }
    },

    /** List recent daily note contents (last N days) */
    listRecentDailyNotes(projectPath: string, days: number): string[] {
      const memoryDir = join(projectPath, 'memory');
      if (!existsSync(memoryDir)) return [];

      try {
        const files = readdirSync(memoryDir)
          .filter(f => f.endsWith('.md'))
          .sort()
          .slice(-days);

        return files.map(f => {
          try {
            return readFileSync(join(memoryDir, f), 'utf-8');
          } catch {
            return '';
          }
        }).filter(Boolean);
      } catch {
        return [];
      }
    },

    /** Update USER.md preferences (read-modify-write) */
    updateUserPreferences(projectPath: string, key: string, value: string): void {
      const filePath = join(projectPath, 'USER.md');
      try {
        let content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '# User Preferences\n';
        const entry = `- ${key}: ${value}`;
        // Append under Learned Patterns section or at end
        if (content.includes('## Learned Patterns')) {
          content = content.replace('## Learned Patterns', `## Learned Patterns\n${entry}`);
        } else {
          content += `\n${entry}\n`;
        }
        writeFileSync(filePath, content, 'utf-8');
      } catch (err) {
        log.error({ err }, '[Butler] Failed to update USER.md');
      }
    },
  };
}
