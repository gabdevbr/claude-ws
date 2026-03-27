import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { bootstrapSqliteSchema } from './bootstrap';
import { resolveDatabasePath } from './resolve-path';

const dbPath = resolveDatabasePath(process.env.DATABASE_PATH);

// Initialize SQLite connection
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent access
sqlite.pragma('journal_mode = WAL');
bootstrapSqliteSchema(sqlite);

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for use in queries
export { schema };

// Database connection helper
export function getDb() {
  return db;
}

// Close database connection
export function closeDb() {
  sqlite.close();
}
