-- Isolated Call Performance storage. Existing KPI tables and APIs are intentionally untouched.
CREATE TABLE IF NOT EXISTS call_performance_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT NOT NULL UNIQUE,
  filename TEXT,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  rows_received INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS call_performance_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  report_date TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT '',
  row_hash TEXT NOT NULL UNIQUE,
  source_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (import_id) REFERENCES call_performance_imports(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_call_performance_date
  ON call_performance_rows(report_date);
CREATE INDEX IF NOT EXISTS ix_call_performance_agent_date
  ON call_performance_rows(employee_id, report_date);
CREATE INDEX IF NOT EXISTS ix_call_performance_disposition
  ON call_performance_rows(disposition);
CREATE INDEX IF NOT EXISTS ix_call_performance_import
  ON call_performance_rows(import_id);