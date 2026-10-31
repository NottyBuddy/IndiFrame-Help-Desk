-- Additive compatibility migration for the live D1 schema.
-- Run each SQL statement separately in the Cloudflare D1 Console.
-- No DROP TABLE, table rebuild, or record deletion is performed.

ALTER TABLE audit_log ADD COLUMN actor TEXT;
ALTER TABLE audit_log ADD COLUMN detail TEXT;

ALTER TABLE projects ADD COLUMN project_code TEXT;
ALTER TABLE projects ADD COLUMN external_reference TEXT;
ALTER TABLE projects ADD COLUMN source_system TEXT;
ALTER TABLE projects ADD COLUMN customer_phone TEXT;
ALTER TABLE projects ADD COLUMN alternate_phone TEXT;
ALTER TABLE projects ADD COLUMN address TEXT;
ALTER TABLE projects ADD COLUMN city TEXT;
ALTER TABLE projects ADD COLUMN state TEXT;
ALTER TABLE projects ADD COLUMN pincode TEXT;
ALTER TABLE projects ADD COLUMN product_material TEXT;
ALTER TABLE projects ADD COLUMN construction_stage TEXT;
ALTER TABLE projects ADD COLUMN expected_timeline TEXT;
ALTER TABLE projects ADD COLUMN assigned_agent_id INTEGER;
ALTER TABLE projects ADD COLUMN created_by_agent_id INTEGER;
ALTER TABLE projects ADD COLUMN requirements_notes TEXT;
ALTER TABLE projects ADD COLUMN requirements_json TEXT;
ALTER TABLE projects ADD COLUMN next_follow_up_at TEXT;
ALTER TABLE projects ADD COLUMN last_contacted_at TEXT;
ALTER TABLE projects ADD COLUMN archived_at TEXT;

ALTER TABLE project_products ADD COLUMN product_category TEXT;
ALTER TABLE project_products ADD COLUMN width_mm INTEGER;
ALTER TABLE project_products ADD COLUMN height_mm INTEGER;
ALTER TABLE project_products ADD COLUMN configuration_json TEXT;
ALTER TABLE project_products ADD COLUMN notes TEXT;

ALTER TABLE project_activity ADD COLUMN actor_agent_id INTEGER;
ALTER TABLE project_activity ADD COLUMN old_status TEXT;
ALTER TABLE project_activity ADD COLUMN new_status TEXT;
ALTER TABLE project_activity ADD COLUMN metadata_json TEXT;

ALTER TABLE kpi_imports ADD COLUMN file_hash TEXT;
ALTER TABLE kpi_imports ADD COLUMN filename TEXT;
ALTER TABLE kpi_imports ADD COLUMN rows_accepted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kpi_imports ADD COLUMN rows_skipped INTEGER NOT NULL DEFAULT 0;

ALTER TABLE kpi_daily ADD COLUMN report_date TEXT;
ALTER TABLE kpi_daily ADD COLUMN disposition TEXT NOT NULL DEFAULT '';
ALTER TABLE kpi_daily ADD COLUMN assigned_leads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kpi_daily ADD COLUMN total_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kpi_daily ADD COLUMN unique_leads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kpi_daily ADD COLUMN interested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kpi_daily ADD COLUMN not_interested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kpi_daily ADD COLUMN follow_ups INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kpi_daily ADD COLUMN callbacks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kpi_daily ADD COLUMN qualified INTEGER NOT NULL DEFAULT 0;

ALTER TABLE agent_breaks ADD COLUMN agent_id INTEGER;
ALTER TABLE agent_breaks ADD COLUMN duration_seconds INTEGER;

UPDATE projects SET project_code='LEGACY-' || id WHERE project_code IS NULL;
UPDATE projects SET customer_phone=phone WHERE customer_phone IS NULL;
UPDATE projects SET city=location WHERE city IS NULL;
UPDATE projects SET assigned_agent_id=CAST(assigned_to AS INTEGER)
 WHERE assigned_agent_id IS NULL AND assigned_to GLOB '[0-9]*';
UPDATE projects SET assigned_agent_id=(SELECT id FROM agents WHERE employee_id=projects.assigned_to COLLATE NOCASE LIMIT 1)
 WHERE assigned_agent_id IS NULL AND assigned_to IS NOT NULL;
UPDATE projects SET created_by_agent_id=created_by WHERE created_by_agent_id IS NULL AND created_by IS NOT NULL;
UPDATE project_products SET product_category=CASE
 WHEN lower(product_type) LIKE '%door%' THEN 'door'
 WHEN lower(product_type) LIKE '%vent%' THEN 'ventilator'
 WHEN lower(product_type) LIKE '%mesh%' THEN 'mesh'
 WHEN lower(product_type) LIKE '%window%' THEN 'window'
 ELSE 'other' END WHERE product_category IS NULL;
UPDATE project_activity SET actor_agent_id=actor_id WHERE actor_agent_id IS NULL;
UPDATE kpi_daily SET report_date=kpi_date WHERE report_date IS NULL;
UPDATE kpi_imports SET filename=file_name WHERE filename IS NULL;
UPDATE agent_breaks SET agent_id=(SELECT id FROM agents WHERE employee_id=agent_breaks.employee_id COLLATE NOCASE LIMIT 1)
 WHERE agent_id IS NULL;
UPDATE agent_breaks SET duration_seconds=duration_minutes*60
 WHERE duration_seconds IS NULL AND duration_minutes IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_project_code ON projects(project_code);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kpi_imports_file_hash ON kpi_imports(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_kpi_daily_report_date ON kpi_daily(report_date);
CREATE INDEX IF NOT EXISTS ix_projects_assigned_status ON projects(assigned_agent_id,status,updated_at);
CREATE INDEX IF NOT EXISTS ix_project_activity_actor_time ON project_activity(actor_agent_id,created_at);
