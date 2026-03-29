/**
 * Butler Persona Loader.
 * Reads persona markdown files (SOUL.md, USER.md, IDENTITY.md, AGENTS.md, MEMORY.md)
 * from the butler project directory.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../logger';
import type { PersonaFiles } from './butler-types';

const log = createLogger('Butler:Persona');

/** Persona file names mapped to PersonaFiles keys */
const PERSONA_FILE_MAP: Array<[keyof PersonaFiles, string]> = [
  ['soul', 'SOUL.md'],
  ['identity', 'IDENTITY.md'],
  ['agents', 'AGENTS.md'],
  ['user', 'USER.md'],
  ['memory', 'MEMORY.md'],
];

/**
 * Create persona loader for a given project path.
 * Returns function to load all persona files.
 */
export function createButlerPersonaLoader() {
  return {
    /** Load all persona files. Returns null for missing files (non-fatal). */
    loadAll(projectPath: string): PersonaFiles {
      const files: PersonaFiles = { soul: null, user: null, identity: null, agents: null, memory: null };

      for (const [key, filename] of PERSONA_FILE_MAP) {
        const filePath = join(projectPath, filename);
        if (existsSync(filePath)) {
          try {
            files[key] = readFileSync(filePath, 'utf-8');
          } catch (err) {
            log.warn({ err, filePath }, '[Butler] Failed to read persona file');
          }
        } else {
          log.debug({ filePath }, '[Butler] Persona file missing (non-fatal)');
        }
      }
      return files;
    },
  };
}
