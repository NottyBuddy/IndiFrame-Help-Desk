-- Additive migration: role hierarchy and agent break tracking.
-- Existing agents, sessions, weekly_kpis, quiz_attempts and signup requests are preserved.
-- Do not execute until the project-data location has been confirmed and a D1 backup exists.

ALTER TABLE agents
  ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0
  CHECK (is_super_admin IN (0, 1));

CREATE TABLE IF NOT EXISTS agent_breaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  break_type TEXT NOT NULL
    CHECK (break_type IN ('tea', 'lunch', 'bio', 'personal', 'other')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CHECK (
    (ended_at IS NULL AND duration_seconds IS NULL)
    OR
    (ended_at IS NOT NULL AND duration_seconds IS NOT NULL AND duration_seconds >= 0)
  )
);

-- A person can have only one active break at a time, including across concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_breaks_one_active
  ON agent_breaks(agent_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_agent_breaks_agent_started
  ON agent_breaks(agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_agent_breaks_active
  ON agent_breaks(ended_at, started_at)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS helpdesk_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES agents(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO helpdesk_settings(setting_key, setting_value, updated_at)
VALUES
  ('break_limit_minutes', '15', CURRENT_TIMESTAMP),
  ('lunch_limit_minutes', '60', CURRENT_TIMESTAMP);
