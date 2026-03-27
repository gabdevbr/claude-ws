import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DB_FILE = path.resolve(process.cwd(), 'data', 'admin.db');

function ensureParentDirectory(dbPath: string) {
  if (dbPath === ':memory:') {
    return dbPath;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return dbPath;
}

export function resolveDatabasePath(rawDbPath?: string) {
  const configuredPath = rawDbPath || './data/admin.db';
  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);

  try {
    return ensureParentDirectory(absolutePath);
  } catch (error) {
    const isPermissionError =
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'EACCES';

    if (process.env.NODE_ENV === 'production' || !isPermissionError) {
      throw error;
    }

    const fallbackPath = ensureParentDirectory(DEFAULT_DB_FILE);
    console.warn(
      `[db] Falling back to local database path "${fallbackPath}" because "${absolutePath}" is not writable in ${process.env.NODE_ENV || 'development'}.`
    );
    return fallbackPath;
  }
}
