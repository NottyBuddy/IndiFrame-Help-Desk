# IndiFrame Help Desk - Attendance design (PROPOSAL ONLY, nothing executed)

**Status:** not verified against the real Worker source or the production D1 schema. I could not see either in this chat.
Names marked `CONFIRM` below are assumptions. Nothing has been migrated or deployed.

## 0. Read-only checks to run first (safe, change nothing)
```bash
npx wrangler d1 execute indiframe-helpdesk-db --remote --command "SELECT name, sql FROM sqlite_master WHERE type IN ('table','index')"
```
Then read the Worker's login handler, the auth/session helper, and how `role` is stored.
Confirm: employees table name + primary key column/type, sessions table (token stored hashed or plain?), role values (`admin` / `agent`?).

## 1. Proposed schema (new table only; no existing table is altered)
```sql
-- migrations/0002_attendance.sql   (CONFIRM employee key name/type)
CREATE TABLE IF NOT EXISTS attendance (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  TEXT NOT NULL,                       -- CONFIRM: same type as employees key
  work_date    TEXT NOT NULL
               CHECK (work_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  check_in_at  TEXT NOT NULL,                       -- UTC ISO-8601, set by the Worker
  check_out_at TEXT,                                -- UTC ISO-8601, set by the Worker
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (check_out_at IS NULL OR check_out_at >= check_in_at),
  UNIQUE (employee_id, work_date)                   -- one row per employee per day: blocks duplicate check-ins
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (work_date, employee_id);
-- Optional once the employees key is confirmed:
--   FOREIGN KEY (employee_id) REFERENCES employees(<key>)
```
Rollback (only if ever needed): `DROP TABLE attendance;` - touches nothing else.

## 2. Timezone policy
- The server clock is the only time source. The client never sends a timestamp.
- Store `check_in_at` / `check_out_at` in UTC. Compute `work_date` in the Worker as the calendar date in **Asia/Kolkata** (IST has no DST, fixed +05:30). CONFIRM this is the office timezone.
- A day = one `work_date`. Check-out is allowed only on the row opened by check-in (default max 20 h after check-in, CONFIRM for night shifts).

## 3. Endpoints (all new, under /api/attendance; existing routes untouched)
| Method + path | Who | Behaviour |
|---|---|---|
| POST /api/attendance/check-in | any logged-in employee | Creates today's row for the **session's** employee. 409 `ALREADY_CHECKED_IN` if it exists. |
| POST /api/attendance/check-out | any logged-in employee | Sets `check_out_at` on today's open row. 409 `NOT_CHECKED_IN` / `ALREADY_CHECKED_OUT`. |
| GET /api/attendance/today | employee | Own status: `not_checked_in`, `checked_in`, `checked_out` + times. |
| GET /api/attendance/history?from=YYYY-MM-DD&to=YYYY-MM-DD | employee | Own rows only, max 92 days per call. |
| GET /api/attendance/summary?month=YYYY-MM | employee | Own present-day count for the month. |
| GET /api/admin/attendance?from&to&employeeId? | admin only | Team rows. |
| GET /api/admin/attendance/summary?month=YYYY-MM | admin only | Present days per employee. |

Request bodies are empty for check-in/out: there is no `employeeId` field to trust. Responses never include password hashes, tokens, or secrets (select explicit columns only).

## 4. Authorization rules
1. Reuse the existing Bearer-token session lookup; no token or expired session -> 401.
2. `employee_id` always comes from the session row, never from the body/query for employee routes.
3. Admin routes re-read the user's role from the DB on every request (not from a client-supplied claim); non-admin -> 403.
4. Employee history/summary queries hard-code `WHERE employee_id = ?` bound to the session employee.
5. Validate `from`, `to`, `month`, `employeeId` format and range; reject otherwise with 400.

## 5. Safe write patterns (parameterized, race-safe)
```sql
-- check-in: the UNIQUE constraint makes concurrent/double taps safe
INSERT INTO attendance (employee_id, work_date, check_in_at) VALUES (?1, ?2, ?3)
ON CONFLICT (employee_id, work_date) DO NOTHING;
-- meta.changes = 0  -> already checked in -> 409 and return the existing row

-- check-out: only succeeds once, only if checked in
UPDATE attendance SET check_out_at = ?3, updated_at = ?3
WHERE employee_id = ?1 AND work_date = ?2 AND check_out_at IS NULL;
-- meta.changes = 0 -> SELECT the row to choose NOT_CHECKED_IN vs ALREADY_CHECKED_OUT

-- monthly summary
SELECT COUNT(*) AS present_days FROM attendance
WHERE employee_id = ?1 AND work_date >= ?2 AND work_date < ?3;
```
"Present" = has a check-in that day (CONFIRM whether a minimum worked time should be required).
Errors use `{ "error": "ALREADY_CHECKED_IN", "message": "...", "attendance": {...} }` so repeated taps get a clear, non-destructive answer.

## 6. Frontend integration plan (app.html, Attendance tab)
- Replace the placeholder cards with: status line, Check-in / Check-out buttons (disabled according to `/today`), own history table, monthly present-days card.
- Use the existing `api()` helper (adds the Bearer token). All values go through `esc()`.
- Do not use localStorage for attendance; the server is the source of truth.
- Admin sees an extra team table and an employee/month picker, shown only when `role === "admin"` (UI only; the Worker enforces it).
- Disable buttons while a request is in flight; show server error messages as returned.

## 7. Open questions for approval
1. Employees key name/type and sessions table shape (from the read-only checks above).
2. Office timezone (assumed Asia/Kolkata) and any night-shift rule.
3. Definition of "present" (any check-in vs minimum hours).
4. Should admins be allowed to correct a record? (Not included; would need an audit table.)
5. Approval to run the migration first on a **local/preview** D1 database, then production.
