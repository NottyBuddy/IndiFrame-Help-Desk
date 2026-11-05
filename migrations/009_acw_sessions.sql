-- Additive ACW session support. Existing break and attendance records are untouched.
CREATE TABLE IF NOT EXISTS agent_acw_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  agent_id INTEGER NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_acw_one_active
  ON agent_acw_sessions(agent_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_agent_acw_agent_started
  ON agent_acw_sessions(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_agent_acw_active
  ON agent_acw_sessions(ended_at, started_at) WHERE ended_at IS NULL;

-- Prevent simultaneous ACW and break sessions, including concurrent requests.
CREATE TRIGGER IF NOT EXISTS trg_acw_no_active_break
BEFORE INSERT ON agent_acw_sessions
WHEN NEW.ended_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'An active break must be ended before starting ACW.')
  WHERE EXISTS (SELECT 1 FROM agent_breaks WHERE agent_id = NEW.agent_id AND ended_at IS NULL);
END;

CREATE TRIGGER IF NOT EXISTS trg_break_no_active_acw
BEFORE INSERT ON agent_breaks
WHEN NEW.ended_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'An active ACW session must be ended before starting a break.')
  WHERE EXISTS (SELECT 1 FROM agent_acw_sessions WHERE agent_id = NEW.agent_id AND ended_at IS NULL);
END;
