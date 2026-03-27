import type Database from 'better-sqlite3';

type ColumnDef = {
  name: string;
  sqlType: string;
};

function ensureColumns(sqlite: Database.Database, tableName: string, columns: ColumnDef[]) {
  const existing = sqlite
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;
  const existingNames = new Set(existing.map((column) => column.name));

  for (const column of columns) {
    if (!existingNames.has(column.name)) {
      sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.sqlType}`);
    }
  }
}

export function bootstrapSqliteSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pool_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      container_id TEXT UNIQUE,
      container_port INTEGER,
      status TEXT NOT NULL DEFAULT 'allocated',
      data_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      stopped_at INTEGER,
      idle_timeout_seconds INTEGER DEFAULT 86400,
      memory_limit TEXT,
      cpu_limit TEXT
    );

    CREATE TABLE IF NOT EXISTS container_pool (
      id TEXT PRIMARY KEY,
      container_id TEXT NOT NULL UNIQUE,
      container_port INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      project_id TEXT,
      allocated_at INTEGER,
      health_status TEXT DEFAULT 'healthy',
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      last_health_check INTEGER,
      last_activity_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS pool_project_activity_log (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      container_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      performed_by TEXT,
      performed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  ensureColumns(sqlite, 'container_pool', [
    { name: 'container_port', sqlType: 'INTEGER' },
    { name: 'project_id', sqlType: 'TEXT' },
    { name: 'allocated_at', sqlType: 'INTEGER' },
    { name: 'health_status', sqlType: "TEXT DEFAULT 'healthy'" },
    { name: 'error_message', sqlType: 'TEXT' },
    { name: 'updated_at', sqlType: 'INTEGER' },
    { name: 'last_health_check', sqlType: 'INTEGER' },
  ]);

  ensureColumns(sqlite, 'pool_project_activity_log', [
    { name: 'timestamp', sqlType: 'INTEGER' },
    { name: 'container_id', sqlType: 'TEXT' },
    { name: 'performed_by', sqlType: 'TEXT' },
    { name: 'performed_at', sqlType: 'INTEGER' },
  ]);

  // Backfill legacy rows to satisfy newer not-null expectations in code.
  sqlite.exec(`
    UPDATE pool_project_activity_log
    SET timestamp = COALESCE(timestamp, performed_at, CAST(unixepoch() * 1000 AS INTEGER))
    WHERE timestamp IS NULL;

    UPDATE pool_project_activity_log
    SET performed_at = COALESCE(performed_at, timestamp, CAST(unixepoch() * 1000 AS INTEGER))
    WHERE performed_at IS NULL;
  `);
}
