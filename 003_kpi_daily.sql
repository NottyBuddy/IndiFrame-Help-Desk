-- Additive tables. Existing weekly_kpis is NOT touched (its columns are unconfirmed).
CREATE TABLE IF NOT EXISTS kpi_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT NOT NULL UNIQUE,     -- blocks re-importing the identical file
  filename TEXT, imported_by TEXT NOT NULL, imported_at TEXT NOT NULL,
  rows_accepted INTEGER NOT NULL, rows_skipped INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kpi_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  report_date TEXT NOT NULL,          -- YYYY-MM-DD
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
