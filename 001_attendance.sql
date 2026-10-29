-- NEW table. Run on LOCAL/TEST D1 first. Not run against production by this package.
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,            -- YYYY-MM-DD in the user's local date at check-in
  check_in_at TEXT NOT NULL,          -- ISO-8601 UTC
  check_out_at TEXT,                  -- ISO-8601 UTC, NULL while active
  duration_minutes INTEGER            -- computed by the Worker at check-out
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_active ON attendance(employee_id) WHERE check_out_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_attendance_emp_date ON attendance(employee_id, work_date);
