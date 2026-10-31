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

-- 6) Project management
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_code TEXT NOT NULL UNIQUE,
  external_reference TEXT UNIQUE,
  source_system TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  alternate_phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  project_type TEXT NOT NULL DEFAULT 'residential'
    CHECK (project_type IN ('residential', 'commercial', 'institutional', 'other')),
  product_material TEXT
    CHECK (product_material IS NULL OR product_material IN ('uPVC', 'aluminium', 'WPC', 'other')),
  construction_stage TEXT,
  expected_timeline TEXT,
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN (
      'NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT_PENDING',
      'MEASUREMENT_PENDING', 'MEASURED', 'QUOTATION_PENDING',
      'QUOTATION_SENT', 'NEGOTIATION', 'APPROVED',
      'IN_PRODUCTION', 'INSTALLATION', 'COMPLETED',
      'ON_HOLD', 'LOST', 'CANCELLED'
    )),
  assigned_agent_id INTEGER,
  created_by_agent_id INTEGER,
  requirements_notes TEXT,
  requirements_json TEXT,
  next_follow_up_at TEXT,
  last_contacted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_projects_assigned_status
  ON projects(assigned_agent_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_projects_customer_phone ON projects(customer_phone);
CREATE INDEX IF NOT EXISTS ix_projects_location ON projects(state, city, pincode);
CREATE INDEX IF NOT EXISTS ix_projects_follow_up
  ON projects(next_follow_up_at) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS project_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  product_category TEXT NOT NULL
    CHECK (product_category IN ('window', 'door', 'ventilator', 'mesh', 'other')),
  product_type TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  width_mm INTEGER CHECK (width_mm IS NULL OR width_mm > 0),
  height_mm INTEGER CHECK (height_mm IS NULL OR height_mm > 0),
  configuration_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_project_products_project ON project_products(project_id);

CREATE TABLE IF NOT EXISTS project_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  actor_agent_id INTEGER,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_project_activity_project_time
  ON project_activity(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_project_activity_actor_time
  ON project_activity(actor_agent_id, created_at DESC);

-- Post-run verification:
-- SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
-- SELECT setting_key, setting_value FROM helpdesk_settings ORDER BY setting_key;
