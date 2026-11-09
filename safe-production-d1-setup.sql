-- IndiFrame Help Desk: additive production D1 setup
-- Target database: indiframe-helpdesk-db
-- Safe scope: creates missing feature tables/indexes and default settings only.
-- DOES NOT alter agents, sessions, weekly_kpis, quiz_attempts, or agent_signup_requests.
-- IMPORTANT: is_super_admin already exists in agents. Do NOT run migration 005 as-is.

-- 1) Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  check_in_at TEXT NOT NULL,
  check_out_at TEXT,
  duration_minutes INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_active
  ON attendance(employee_id) WHERE check_out_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_attendance_emp_date
  ON attendance(employee_id, work_date);

-- 2) Weekly quiz question bank (quiz_attempts is pre-existing and untouched)
CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_number INTEGER NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_quiz_week
  ON quiz_questions(week_number, is_active);

-- 3) Daily KPI imports and rows (weekly_kpis is pre-existing and untouched)
CREATE TABLE IF NOT EXISTS kpi_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT NOT NULL UNIQUE,
  filename TEXT,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  rows_accepted INTEGER NOT NULL,
  rows_skipped INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kpi_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT '',
  assigned_leads INTEGER NOT NULL DEFAULT 0,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  unique_leads INTEGER NOT NULL DEFAULT 0,
  connected_calls INTEGER NOT NULL DEFAULT 0,
  interested INTEGER NOT NULL DEFAULT 0,
  not_interested INTEGER NOT NULL DEFAULT 0,
  follow_ups INTEGER NOT NULL DEFAULT 0,
  callbacks INTEGER NOT NULL DEFAULT 0,
  qualified INTEGER NOT NULL DEFAULT 0,
  import_id INTEGER,
  UNIQUE(employee_id, report_date, disposition)
);
CREATE INDEX IF NOT EXISTS ix_kpi_date ON kpi_daily(report_date);

-- 4) Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

-- 5) Agent breaks and settings (is_super_admin column already exists)
CREATE UNIQUE INDEX IF NOT EXISTS ux_agents_single_super_admin
  ON agents(is_super_admin) WHERE is_super_admin = 1;
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
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_breaks_one_active
  ON agent_breaks(agent_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_agent_breaks_agent_started
  ON agent_breaks(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_agent_breaks_active
  ON agent_breaks(ended_at, started_at) WHERE ended_at IS NULL;
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

-- Projects feature retired; historical tables are handled by migrations/010-retire-projects.sql.

-- Post-run verification:
-- SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
-- SELECT setting_key, setting_value FROM helpdesk_settings ORDER BY setting_key;
