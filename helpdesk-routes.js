// DRAFT additive module. All routes live under /api/hd/ so they cannot collide with existing routes.
// Wire-up (see README): in your existing fetch handler, before the 404:
//   const r = await handleHelpdesk(request, env); if (r) return r;

const ORIGIN = "https://nottybuddy.github.io";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN, "Vary": "Origin",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
};
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const bad = (m, s = 400) => { throw new HttpError(s, m); };

// ===== SCHEMA (confirmed by owner) =====
// agents(id, employee_id, full_name, password_hash, role, active, created_at)
// sessions(id, agent_id, token_hash, expires_at, created_at)      -> sessions.agent_id = agents.id
// quiz_attempts(id, agent_id, week_number, score, total_questions, answers_json, completed_at) -> agent_id = agents.id
// weekly_kpis(id, agent_id, week_start, week_end, metrics_json, uploaded_by, created_at)  (NOT used by this module)
// Identity rule: the session's agent row is the ONLY source of identity. u.agentId = agents.id (used for quiz_attempts),
// u.employeeId = agents.employee_id (used in the new attendance / kpi_daily / audit_log tables).
//
// ===== STILL UNCONFIRMED (verify against your real login code; this module never touches login) =====
// U1: sessions.token_hash = lowercase hex SHA-256 of the raw bearer token.
// U2: sessions.expires_at is an ISO-8601 UTC string (string comparison with now()). If it is epoch seconds/ms, change the comparison.
// U3: agents.active = 1 means active; role 'admin' (case-insensitive) = admin.
async function authenticate(req, env) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer (.+)$/);
  if (!m) return null;
  const hash = await sha256(m[1]);
  const row = await env.DB.prepare(
    "SELECT a.id, a.employee_id, a.full_name, a.role FROM sessions s JOIN agents a ON a.id = s.agent_id WHERE s.token_hash = ? AND s.expires_at > ? AND a.active = 1"
  ).bind(hash, new Date().toISOString()).first();
  if (!row || !Number.isInteger(row.id) || !row.employee_id) return null;
  return { agentId: row.id, employeeId: String(row.employee_id), name: row.full_name, role: String(row.role || "").toLowerCase() };
}
// =========================================================================================

async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const now = () => new Date().toISOString();
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s));
const rate = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null); // % with 1 decimal, null if /0
const audit = (env, u, action, detail) =>
  env.DB.prepare("INSERT INTO audit_log(actor,action,detail,created_at) VALUES(?,?,?,?)").bind(u.employeeId, action, detail, now()).run();

export async function handleHelpdesk(req, env) {
  const url = new URL(req.url), p = url.pathname, m = req.method;
  if (!p.startsWith("/api/hd/")) return null;
  if (m === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const u = await authenticate(req, env);
    if (!u) return J({ error: "Session expired or invalid. Please log in again." }, 401);
    const admin = u.role === "admin";
    if (p.startsWith("/api/hd/admin/") && !admin) return J({ error: "Admin access required." }, 403);

    if (m === "GET" && p === "/api/hd/kpis/summary") return J(await kpiSummary(url, env, u, admin));
    if (m === "POST" && p === "/api/hd/admin/kpis/import") return J(await kpiImport(req, env, u));
    if (m === "GET" && p === "/api/hd/attendance/status") return J(await attStatus(env, u));
    if (m === "POST" && p === "/api/hd/attendance/check-in") return J(await checkIn(req, env, u));
    if (m === "POST" && p === "/api/hd/attendance/check-out") return J(await checkOut(env, u));
    if (m === "GET" && p === "/api/hd/attendance/history") return J(await attHistory(url, env, u, admin));
    if (m === "GET" && p === "/api/hd/quiz/questions") return J(await quizQuestions(url, env, u));
    if (m === "POST" && p === "/api/hd/quiz/submit") return J(await quizSubmit(req, env, u));
    if (m === "GET" && p === "/api/hd/admin/quiz/questions") return J(await adminQList(url, env));
    if (m === "POST" && p === "/api/hd/admin/quiz/questions") return J(await adminQSave(req, env, u, null), 201);
    const qm = p.match(/^\/api\/hd\/admin\/quiz\/questions\/(\d+)$/);
    if (m === "PUT" && qm) return J(await adminQSave(req, env, u, Number(qm[1])));
    if (m === "GET" && p === "/api/hd/admin/quiz/results") return J(await adminQResults(url, env));
    return J({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return J({ error: e.message }, e.status);
    console.error("helpdesk error", e && e.message);
    return J({ error: "Something went wrong. Please try again." }, 500);
  }
}

// ---------- KPIs ----------
const SUMS = "COALESCE(SUM(assigned_leads),0) assigned, COALESCE(SUM(total_attempts),0) attempts, COALESCE(SUM(unique_leads),0) uniqueLeads, COALESCE(SUM(connected_calls),0) connected, COALESCE(SUM(interested),0) interested, COALESCE(SUM(not_interested),0) notInterested, COALESCE(SUM(follow_ups),0) followUps, COALESCE(SUM(callbacks),0) callbacks, COALESCE(SUM(qualified),0) qualified, COUNT(*) rows";
const withRates = r => ({ ...r, connectRate: rate(r.connected, r.attempts), attemptRate: rate(r.uniqueLeads, r.assigned), conversionRate: rate(r.qualified, r.connected) });

async function kpiSummary(url, env, u, admin) {
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  if (from && !isDate(from)) bad("Invalid 'from' date (use YYYY-MM-DD).");
  if (to && !isDate(to)) bad("Invalid 'to' date (use YYYY-MM-DD).");
  const emp = admin ? (url.searchParams.get("employee_id") || null) : u.employeeId; // agents are forced to own data
  const w = ["1=1"], b = [];
  if (from) { w.push("report_date >= ?"); b.push(from); }
  if (to) { w.push("report_date <= ?"); b.push(to); }
  if (emp) { w.push("employee_id = ?"); b.push(emp); }
  const W = w.join(" AND ");
  const all = sql => env.DB.prepare(sql).bind(...b).all().then(r => r.results.map(withRates));
  const [tot] = await all(`SELECT ${SUMS} FROM kpi_daily WHERE ${W}`);
  return {
    meta: { from, to, employeeId: emp, scope: admin && !emp ? "team" : "single", rowsAggregated: tot.rows },
    totals: tot,
    daily: await all(`SELECT report_date date, ${SUMS} FROM kpi_daily WHERE ${W} GROUP BY report_date ORDER BY report_date LIMIT 400`),
    byAgent: await all(`SELECT employee_id employeeId, ${SUMS} FROM kpi_daily WHERE ${W} GROUP BY employee_id ORDER BY employee_id LIMIT 500`),
    byDisposition: await all(`SELECT disposition, ${SUMS} FROM kpi_daily WHERE ${W} AND disposition <> '' GROUP BY disposition ORDER BY rows DESC LIMIT 100`),
  };
}

const NUM = ["assigned_leads", "total_attempts", "unique_leads", "connected_calls", "interested", "not_interested", "follow_ups", "callbacks", "qualified"];
const MAX_IMPORT = 500; // keeps the whole save in ONE atomic D1 batch
// Every received row ends up in exactly one bucket: accepted, skippedExisting, or invalid. Nothing is dropped silently.
async function kpiImport(req, env, u) {
  const body = await req.json().catch(() => bad("Invalid JSON body."));
  const rows = body.rows;
  if (!Array.isArray(rows) || !rows.length) bad("No rows supplied.");
  if (rows.length > MAX_IMPORT) bad(`Too many rows (max ${MAX_IMPORT} per import). Split the file.`);
  // employee_id (as typed in the report) -> canonical agents.employee_id, case-insensitive
  const agents = new Map((await env.DB.prepare("SELECT employee_id FROM agents").all()).results.map(a => [String(a.employee_id).trim().toLowerCase(), String(a.employee_id)]));
  const valid = [], invalid = [], seenAt = new Map();
  rows.forEach((r, i) => {
    const n = i + 1;
    if (!r || typeof r !== "object") return invalid.push({ row: n, reason: "Row is not an object" });
    const typed = String(r.employee_id ?? "").trim(), d = String(r.report_date ?? "").trim(), disp = String(r.disposition ?? "").trim().slice(0, 60);
    if (!typed) return invalid.push({ row: n, reason: "Missing employee ID" });
    const emp = agents.get(typed.toLowerCase());
    if (!emp) return invalid.push({ row: n, reason: `Unknown employee ID "${typed.slice(0, 30)}"` });
    if (!isDate(d)) return invalid.push({ row: n, reason: "Invalid report date (need YYYY-MM-DD)" });
    const o = { n, employee_id: emp, report_date: d, disposition: disp };
    for (const k of NUM) {
      const v = r[k] === undefined || r[k] === null || r[k] === "" ? 0 : Number(r[k]);
      if (!Number.isInteger(v) || v < 0 || v > 10000000) return invalid.push({ row: n, reason: `${k} must be a whole number >= 0` });
      o[k] = v;
    }
    const key = `${emp}|${d}|${disp}`;
    if (seenAt.has(key)) return invalid.push({ row: n, reason: `Duplicate of row ${seenAt.get(key)} in this file (same employee, date, disposition)` });
    seenAt.set(key, n); o.key = key; valid.push(o);
  });
  const existing = new Map();
  if (valid.length) {
    const ds = valid.map(v => v.report_date).sort();
    const ex = await env.DB.prepare(`SELECT employee_id,report_date,disposition,${NUM.join(",")} FROM kpi_daily WHERE report_date BETWEEN ? AND ?`).bind(ds[0], ds[ds.length - 1]).all();
    ex.results.forEach(r => existing.set(`${r.employee_id}|${r.report_date}|${r.disposition}`, r));
  }
  const fresh = [], skipped = [];
  for (const v of valid) {
    const ex = existing.get(v.key);
    if (ex) skipped.push({ row: v.n, reason: "Already in database (not overwritten)", differs: NUM.some(k => ex[k] !== v[k]) });
    else fresh.push(v);
  }
  const summary = {
    receivedRows: rows.length, accepted: fresh.length, skippedDuplicates: skipped.length,
    skippedWithDifferentValues: skipped.filter(s => s.differs).length, invalidCount: invalid.length,
    reconciled: fresh.length + skipped.length + invalid.length === rows.length,
    invalid: invalid.slice(0, 50), skippedRows: skipped.slice(0, 50),
  };
  if (body.dry_run !== false) return { dryRun: true, ...summary };

  if (!fresh.length) bad("Nothing new to import: every valid row already exists or is invalid. Review the check results.", 409);
  if ((invalid.length || skipped.length) && body.accept_partial !== true)
    bad(`${invalid.length} invalid and ${skipped.length} already-existing row(s) will NOT be imported. Confirm to import only the ${fresh.length} new valid row(s).`, 409);
  const hash = await sha256(JSON.stringify(fresh.map(({ n, key, ...r }) => r)));
  if (await env.DB.prepare("SELECT 1 FROM kpi_imports WHERE file_hash = ?").bind(hash).first()) bad("This exact data was already imported.", 409);
  const ins = env.DB.prepare(`INSERT INTO kpi_daily(employee_id,report_date,disposition,${NUM.join(",")},import_id) VALUES(?,?,?,${NUM.map(() => "?").join(",")},(SELECT id FROM kpi_imports WHERE file_hash = ?))`);
  try {
    // ONE atomic batch: import record + every row. Plain INSERT (not OR IGNORE): any conflict aborts everything, so rows are never silently dropped.
    await env.DB.batch([
      env.DB.prepare("INSERT INTO kpi_imports(file_hash,filename,imported_by,imported_at,rows_accepted,rows_skipped) VALUES(?,?,?,?,?,?)")
        .bind(hash, String(body.filename || "").slice(0, 120), u.employeeId, now(), fresh.length, skipped.length + invalid.length),
      ...fresh.map(o => ins.bind(o.employee_id, o.report_date, o.disposition, ...NUM.map(k => o[k]), hash)),
    ]);
  } catch (e) {
    console.error("kpi import batch failed", e && e.message);
    bad("Import failed and NOTHING was saved (the data may have changed since the check). Run the check again.", 409);
  }
  const imp = await env.DB.prepare("SELECT id FROM kpi_imports WHERE file_hash = ?").bind(hash).first();
  const saved = (await env.DB.prepare("SELECT COUNT(*) c FROM kpi_daily WHERE import_id = ?").bind(imp.id).first()).c;
  if (saved !== fresh.length) throw new Error(`kpi import count mismatch: expected ${fresh.length}, saved ${saved}`);
  await audit(env, u, "kpi_import", `import ${imp.id}: ${saved} saved, ${skipped.length} existing skipped, ${invalid.length} invalid, file ${String(body.filename || "").slice(0, 60)}`);
  return { dryRun: false, importId: imp.id, saved, ...summary };
}

// ---------- Attendance ----------
async function attStatus(env, u) {
  const a = await env.DB.prepare("SELECT id,check_in_at FROM attendance WHERE employee_id=? AND check_out_at IS NULL").bind(u.employeeId).first();
  return { active: !!a, checkInAt: a ? a.check_in_at : null, serverTime: now() };
}
async function checkIn(req, env, u) {
  const b = await req.json().catch(() => ({}));
  const off = Number(b.tzOffsetMinutes ?? 0);
  if (!Number.isInteger(off) || off < -840 || off > 840) bad("Invalid timezone offset.");
  if ((await attStatus(env, u)).active) bad("You are already checked in.", 409);
  const t = new Date();
  const workDate = new Date(t.getTime() - off * 60000).toISOString().slice(0, 10); // JS getTimezoneOffset semantics
  try {
    await env.DB.prepare("INSERT INTO attendance(employee_id,work_date,check_in_at) VALUES(?,?,?)").bind(u.employeeId, workDate, t.toISOString()).run();
  } catch (e) { bad("You are already checked in.", 409); } // unique partial index guards races
  return { checkInAt: t.toISOString(), workDate };
}
async function checkOut(env, u) {
  const a = await env.DB.prepare("SELECT id,check_in_at FROM attendance WHERE employee_id=? AND check_out_at IS NULL").bind(u.employeeId).first();
  if (!a) bad("No active check-in to check out from.", 409);
  const t = new Date(), mins = Math.max(0, Math.round((t - new Date(a.check_in_at)) / 60000));
  await env.DB.prepare("UPDATE attendance SET check_out_at=?, duration_minutes=? WHERE id=? AND check_out_at IS NULL").bind(t.toISOString(), mins, a.id).run();
  return { checkInAt: a.check_in_at, checkOutAt: t.toISOString(), durationMinutes: mins };
}
async function attHistory(url, env, u, admin) {
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) bad("Invalid month (use YYYY-MM).");
  const emp = admin ? (url.searchParams.get("employee_id") || null) : u.employeeId; // agents: own only
  const w = emp ? "work_date LIKE ? AND employee_id = ?" : "work_date LIKE ?";
  const b = emp ? [month + "-%", emp] : [month + "-%"];
  const rows = (await env.DB.prepare(`SELECT employee_id employeeId, work_date workDate, check_in_at checkInAt, check_out_at checkOutAt, duration_minutes durationMinutes FROM attendance WHERE ${w} ORDER BY work_date DESC, check_in_at DESC LIMIT 1000`).bind(...b).all()).results;
  const sum = (await env.DB.prepare(`SELECT employee_id employeeId, COUNT(DISTINCT work_date) daysPresent, COALESCE(SUM(duration_minutes),0) totalMinutes FROM attendance WHERE ${w} GROUP BY employee_id ORDER BY employee_id LIMIT 500`).bind(...b).all()).results;
  return { month, records: rows, summary: sum };
}

// ---------- Quiz ----------
const wk = v => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 60) bad("Invalid week number (1-60)."); return n; };
async function quizQuestions(url, env, u) {
  const week = wk(url.searchParams.get("week"));
  const done = await env.DB.prepare("SELECT score,total_questions FROM quiz_attempts WHERE agent_id=? AND week_number=?").bind(u.agentId, week).first();
  const qs = (await env.DB.prepare("SELECT id,question,options_json FROM quiz_questions WHERE week_number=? AND is_active=1 ORDER BY id").bind(week).all()).results;
  // correct_index and explanation are deliberately NOT selected.
  return { week, alreadyAttempted: !!done, previous: done || null, questions: qs.map(q => ({ id: q.id, question: q.question, options: JSON.parse(q.options_json) })) };
}
async function quizSubmit(req, env, u) {
  const b = await req.json().catch(() => bad("Invalid JSON body."));
  const week = wk(b.week), ans = b.answers;
  if (!ans || typeof ans !== "object" || Array.isArray(ans)) bad("answers must be an object of questionId -> option index.");
  // ASSUMPTION A6: one attempt per agent per week (enforced atomically at insert below).
  const qs = (await env.DB.prepare("SELECT id,options_json,correct_index,explanation FROM quiz_questions WHERE week_number=? AND is_active=1").bind(week).all()).results;
  if (!qs.length) bad("No active questions for this week.", 404);
  const keys = Object.keys(ans);
  if (keys.length !== qs.length || !qs.every(q => keys.includes(String(q.id)))) bad("Answer every question for this week, and only those questions.");
  let score = 0;
  const review = qs.map(q => {
    const idx = ans[String(q.id)], n = JSON.parse(q.options_json).length;
    if (!Number.isInteger(idx) || idx < 0 || idx >= n) bad(`Invalid option for question ${q.id}.`);
    const ok = idx === q.correct_index; if (ok) score++;
    return { id: q.id, correct: ok, correctIndex: q.correct_index, explanation: q.explanation || "" };
  });
  const answersJson = JSON.stringify(Object.fromEntries(qs.map(q => [String(q.id), ans[String(q.id)]])));
  const ins = await env.DB.prepare(
    "INSERT INTO quiz_attempts(agent_id,week_number,score,total_questions,answers_json,completed_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM quiz_attempts WHERE agent_id=? AND week_number=?)"
  ).bind(u.agentId, week, score, qs.length, answersJson, now(), u.agentId, week).run();
  if (!ins.meta.changes) bad("You have already submitted this week's quiz.", 409);
  return { week, score, total: qs.length, percent: rate(score, qs.length), review };
}
async function adminQList(url, env) {
  const week = wk(url.searchParams.get("week"));
  const r = (await env.DB.prepare("SELECT id,week_number,question,options_json,correct_index,explanation,is_active FROM quiz_questions WHERE week_number=? ORDER BY id LIMIT 200").bind(week).all()).results;
  return { week, questions: r.map(q => ({ ...q, options: JSON.parse(q.options_json), options_json: undefined })) };
}
async function adminQSave(req, env, u, id) {
  const b = await req.json().catch(() => bad("Invalid JSON body."));
  if (id && Object.keys(b).length === 1 && "is_active" in b) { // simple activate/deactivate
    await env.DB.prepare("UPDATE quiz_questions SET is_active=?, updated_at=? WHERE id=?").bind(b.is_active ? 1 : 0, now(), id).run();
    await audit(env, u, "quiz_toggle", `question ${id} active=${b.is_active ? 1 : 0}`);
    return { id, is_active: b.is_active ? 1 : 0 };
  }
  const week = wk(b.week_number), q = String(b.question || "").trim();
  const opts = Array.isArray(b.options) ? b.options.map(o => String(o).trim()).filter(Boolean) : [];
  if (q.length < 3 || q.length > 500) bad("Question must be 3-500 characters.");
  if (opts.length < 2 || opts.length > 6 || opts.some(o => o.length > 200)) bad("Provide 2-6 options (max 200 chars each).");
  if (!Number.isInteger(b.correct_index) || b.correct_index < 0 || b.correct_index >= opts.length) bad("correct_index must point to one of the options.");
  const isNew = !id, ex = String(b.explanation || "").slice(0, 500), act = b.is_active === 0 || b.is_active === false ? 0 : 1, t = now();
  if (id) {
    const r = await env.DB.prepare("UPDATE quiz_questions SET week_number=?,question=?,options_json=?,correct_index=?,explanation=?,is_active=?,updated_at=? WHERE id=?").bind(week, q, JSON.stringify(opts), b.correct_index, ex, act, t, id).run();
    if (!r.meta.changes) bad("Question not found.", 404);
  } else {
    const r = await env.DB.prepare("INSERT INTO quiz_questions(week_number,question,options_json,correct_index,explanation,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(week, q, JSON.stringify(opts), b.correct_index, ex, act, t, t).run();
    id = r.meta.last_row_id;
  }
  await audit(env, u, isNew ? "quiz_create" : "quiz_save", `question ${id}, week ${week}`);
  return { id };
}
async function adminQResults(url, env) {
  const week = wk(url.searchParams.get("week"));
  const r = (await env.DB.prepare("SELECT a.employee_id employeeId, qa.score score, qa.total_questions total, qa.completed_at completedAt FROM quiz_attempts qa JOIN agents a ON a.id = qa.agent_id WHERE qa.week_number=? ORDER BY qa.score DESC LIMIT 500").bind(week).all()).results;
  const s = r.reduce((a, x) => a + x.score, 0), t = r.reduce((a, x) => a + x.total, 0);
  return { week, attempts: r, team: { attempts: r.length, averagePercent: rate(s, t) } };
}
