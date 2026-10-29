CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_number INTEGER NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,         -- JSON array of 2-6 strings
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_quiz_week ON quiz_questions(week_number, is_active);
