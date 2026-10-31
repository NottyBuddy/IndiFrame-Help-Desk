-- Additive project-management schema for IndiFrame Help Desk.
-- Creates empty project tables only. It does not fabricate, import, update, or delete customer/project records.
-- Existing agents, sessions, KPI records, quiz attempts, and signup requests remain untouched.
-- Run only after taking a D1 backup and confirming this is the intended production database.

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
CREATE INDEX IF NOT EXISTS ix_projects_customer_phone
  ON projects(customer_phone);
CREATE INDEX IF NOT EXISTS ix_projects_location
  ON projects(state, city, pincode);
CREATE INDEX IF NOT EXISTS ix_projects_follow_up
  ON projects(next_follow_up_at)
  WHERE archived_at IS NULL;

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

CREATE INDEX IF NOT EXISTS ix_project_products_project
  ON project_products(project_id);

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
