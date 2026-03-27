import { pgTable, uuid, text, varchar, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),

  // Container mapping
  container_id: varchar('container_id', { length: 255 }).unique(),
  container_port: integer('container_port'),
  status: varchar('status', { length: 20 }).notNull().default('allocated'),

  // Data storage
  data_path: varchar('data_path', { length: 500 }).notNull(),

  // Lifecycle
  created_at: timestamp('created_at').defaultNow(),
  last_activity_at: timestamp('last_activity_at').defaultNow(),
  stopped_at: timestamp('stopped_at'),

  // Configuration
  idle_timeout_seconds: integer('idle_timeout_seconds').default(86400),
  memory_limit: varchar('memory_limit', { length: 20 }),
  cpu_limit: varchar('cpu_limit', { length: 10 }),
}, (table) => ({
    statusIdx: index('idx_projects_status').on(table.status),
    lastActivityIdx: index('idx_projects_last_activity').on(table.last_activity_at),
    containerIdx: index('idx_projects_container').on(table.container_id),
}));

export const containerPool = pgTable('container_pool', {
  containerId: varchar('container_id', { length: 255 }).primaryKey(),
  status: varchar('status', { length: 20 }).notNull().default('idle'),

  // Allocation
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  allocatedAt: timestamp('allocated_at'),

  // Container details
  containerPort: integer('container_port').notNull(),
  dockerHash: varchar('docker_hash', { length: 64 }),

  // Health
  lastHealthCheck: timestamp('last_health_check').defaultNow(),
  healthStatus: varchar('health_status', { length: 20 }).default('healthy'),
  errorMessage: text('error_message'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('idx_pool_status').on(table.status),
  allocationIdx: index('idx_pool_allocation').on(table.projectId),
  healthIdx: index('idx_pool_health').on(table.lastHealthCheck),
}));

export const projectActivityLog = pgTable('project_activity_log', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  containerId: varchar('container_id', { length: 255 }),

  action: varchar('action', { length: 50 }).notNull(),
  details: jsonb('details'),

  performedBy: varchar('performed_by', { length: 100 }),
  performedAt: timestamp('performed_at').defaultNow(),
}, (table) => ({
  projectIdx: index('idx_activity_project').on(table.projectId),
  timeIdx: index('idx_activity_time').on(table.performedAt),
}));

export type Project = typeof projects.$inferSelect;
export type ContainerPool = typeof containerPool.$inferSelect;
export type ProjectActivityLog = typeof projectActivityLog.$inferSelect;
