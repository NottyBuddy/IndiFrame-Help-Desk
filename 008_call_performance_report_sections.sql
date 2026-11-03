-- Structured sections extracted from the Day Wise Call Logs workbook.
-- Kept separate from the existing KPI tables and call_performance_rows.
CREATE TABLE IF NOT EXISTS call_performance_report_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  report_type TEXT NOT NULL,
  employee_id TEXT,
  employee_name TEXT NOT NULL DEFAULT '',
  report_date TEXT,
  label TEXT NOT NULL DEFAULT '',
  row_hash TEXT NOT NULL UNIQUE,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (import_id) REFERENCES call_performance_imports(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_cp_report_type_date
  ON call_performance_report_rows(report_type, report_date);
CREATE INDEX IF NOT EXISTS ix_cp_report_agent
  ON call_performance_report_rows(employee_id, report_type);
