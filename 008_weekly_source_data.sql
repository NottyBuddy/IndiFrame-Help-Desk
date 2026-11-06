-- Isolated storage for source-preserving weekly Attendance and Disposition workbooks.
-- Does not alter attendance, KPI, Call Performance, or existing project tables.
CREATE TABLE IF NOT EXISTS weekly_source_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset TEXT NOT NULL CHECK(dataset IN ('attendance','disposition')),
  file_hash TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  rows_received INTEGER NOT NULL,
  rows_inserted INTEGER NOT NULL,
  headers_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS weekly_source_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  row_number INTEGER NOT NULL,
  record_date TEXT,
  agent_name TEXT NOT NULL DEFAULT '',
  total_calls REAL,
  source_json TEXT NOT NULL,
  FOREIGN KEY(import_id) REFERENCES weekly_source_imports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_weekly_source_import_dataset ON weekly_source_imports(dataset, imported_at DESC);
CREATE INDEX IF NOT EXISTS ix_weekly_source_rows_date ON weekly_source_rows(record_date);
CREATE INDEX IF NOT EXISTS ix_weekly_source_rows_import ON weekly_source_rows(import_id);