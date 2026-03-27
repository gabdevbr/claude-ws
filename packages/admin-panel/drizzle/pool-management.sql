-- Database schema for Multi-Project Docker Pool Management
-- Run: drizzle-kit generate

-- Projects table: Stores project configurations with container mappings
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Container mapping
  container_id VARCHAR(255) UNIQUE,
  container_port INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'allocated', -- allocated, running, stopped, error

  -- Data storage path
  data_path VARCHAR(500) NOT NULL,

  -- Lifecycle timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP DEFAULT NOW(),
  stopped_at TIMESTAMP,

  -- Configuration
  idle_timeout_seconds INTEGER DEFAULT 86400, -- 24 hours default
  memory_limit VARCHAR(20), -- e.g., "2G"
  cpu_limit VARCHAR(10) -- e.g., "1.0"
);

-- Create indexes
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_last_activity ON projects(last_activity_at);
CREATE INDEX idx_projects_container ON projects(container_id);

-- Container pool table: Tracks warm containers ready for allocation
CREATE TABLE container_pool (
  container_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'idle', -- idle, allocated, stopping, error

  -- Project allocation
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  allocated_at TIMESTAMP,

  -- Container details
  container_port INTEGER NOT NULL,
  docker_hash VARCHAR(64),

  -- Health monitoring
  last_health_check TIMESTAMP DEFAULT NOW(),
  health_status VARCHAR(20) DEFAULT 'healthy', -- healthy, unhealthy, unknown
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_pool_status ON container_pool(status);
CREATE INDEX idx_pool_allocation ON container_pool(project_id);
CREATE INDEX idx_pool_health ON container_pool(last_health_check);

-- Activity log table: Audit trail for project lifecycle events
CREATE TABLE project_activity_log (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  container_id VARCHAR(255),

  action VARCHAR(50) NOT NULL, -- created, started, stopped, allocated, deallocated, error
  details JSONB,

  -- Who performed the action
  performed_by VARCHAR(100), -- system, admin, or user_id
  performed_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_activity_project ON project_activity_log(project_id);
CREATE INDEX idx_activity_time ON project_activity_log(performed_at DESC);

-- Comments for documentation
COMMENT ON TABLE projects IS 'Project configurations with container mappings';
COMMENT ON TABLE container_pool IS 'Container pool tracking for project allocation';
COMMENT ON TABLE project_activity_log IS 'Audit log for project lifecycle events';
