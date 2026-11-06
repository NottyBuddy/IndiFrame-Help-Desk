// Help Desk API routes under /api/hd/. Imported by worker.js after core authentication routes.

const ORIGIN = "https://nottybuddy.github.io";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN, "Vary": "Origin",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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
// Session contract used by worker.js: token_hash is lowercase hex SHA-256; expires_at is ISO-8601 UTC; active=1 means enabled.
// Authentication identity always comes from the joined D1 agent record, never from client-supplied employee IDs.
async function authenticate(req, env) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer (.+)$/);
  if (!m) return null;
  const hash = await sha256(m[1]);
  const row = await env.DB.prepare(
    "SELECT a.id, a.employee_id, a.full_name, a.role, a.is_super_admin FROM sessions s JOIN agents a ON a.id = s.agent_id WHERE s.token_hash = ? AND s.expires_at > ? AND a.active = 1"
  ).bind(hash, new Date().toISOString()).first();
  if (!row || !Number.isInteger(row.id) || !row.employee_id) return null;
  return { agentId: row.id, employeeId: String(row.employee_id), name: row.full_name, role: String(row.role || "").toLowerCase(), isSuperAdmin: Number(row.is_super_admin) === 1 };
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
  env.DB.prepare("INSERT INTO audit_log(actor_id,actor,action,details,detail,created_at) VALUES(?,?,?,?,?,?)")
    .bind(u.agentId, u.employeeId, action, detail, detail, now()).run();

export async function handleHelpdesk(req, env) {
  const url = new URL(req.url), p = url.pathname, m = req.method;
  if (!p.startsWith("/api/hd/")) return null;
  if (m === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const u = await authenticate(req, env);
    if (!u) return J({ error: "Session expired or invalid. Please log in again." }, 401);
    const admin = u.role === "admin" || u.isSuperAdmin;
    if (p.startsWith("/api/hd/admin/") && !admin) return J({ error: "Admin access required." }, 403);
    // Admin accounts are monitoring-only. Separate KPI and Call Performance imports are Super Admin-only.
    const superAdminKpiImport = p === "/api/hd/admin/kpis/import" && m === "POST" && u.isSuperAdmin;
    const superAdminCallImport = p === "/api/hd/admin/call-performance/import" && m === "POST" && u.isSuperAdmin;
    const superAdminDataWrite = u.isSuperAdmin && (p === "/api/hd/superadmin/records" && m === "DELETE" || p === "/api/hd/superadmin/call-performance" && m === "DELETE" || (p === "/api/hd/admin/quiz/questions" && m === "POST" || p.startsWith("/api/hd/admin/quiz/questions/") && p.slice("/api/hd/admin/quiz/questions/".length).length > 0 && [...p.slice("/api/hd/admin/quiz/questions/".length)].every(ch => ch >= "0" && ch <= "9") && m === "PUT"));
    if (admin && ["POST", "PUT", "PATCH", "DELETE"].includes(m) && !superAdminKpiImport && !superAdminCallImport && !superAdminDataWrite) {
      return J({ error: "Admin access is read-only. Operational actions are available to agents only." }, 403);
    }
    if (p === "/api/hd/admin/kpis/import" && !u.isSuperAdmin) {
      return J({ error: "Only Super Admin can publish KPI data." }, 403);
    }
    if (p === "/api/hd/admin/call-performance/import" && !u.isSuperAdmin) {
      return J({ error: "Only Super Admin can import Call Performance data." }, 403);
    }

    if (p === "/api/hd/superadmin/call-performance" && ["GET","DELETE"].includes(m)) {
      if (!u.isSuperAdmin) bad("Super Admin access required.",403);
      const from=url.searchParams.get("from"),to=url.searchParams.get("to");
      if(!isDate(from)||!isDate(to))bad("Valid From and To dates are required (YYYY-MM-DD).");
      if(from>to)bad("From date cannot be after To date.");
      await ensureCallPerformanceSections(env);
      if(m==="GET"){
        const a=await env.DB.prepare("SELECT COUNT(*) n FROM call_performance_rows WHERE report_date>=? AND report_date<=?").bind(from,to).first();
        const b=await env.DB.prepare("SELECT COUNT(*) n FROM call_performance_report_rows WHERE report_date IS NOT NULL AND report_date>=? AND report_date<=?").bind(from,to).first();
        return J({from,to,dailyRows:Number(a?.n||0),reportRows:Number(b?.n||0)});
      }
      const a=await env.DB.prepare("DELETE FROM call_performance_rows WHERE report_date>=? AND report_date<=?").bind(from,to).run();
      const b=await env.DB.prepare("DELETE FROM call_performance_report_rows WHERE report_date IS NOT NULL AND report_date>=? AND report_date<=?").bind(from,to).run();
      await audit(env,u,"call_performance_cleanup","Removed "+a.meta.changes+" daily rows and "+b.meta.changes+" report rows from "+from+" through "+to);
      return J({success:true,from,to,dailyRowsDeleted:a.meta.changes,reportRowsDeleted:b.meta.changes});
    }
    if (p === "/api/hd/superadmin/records" && m === "DELETE") {
      if (!u.isSuperAdmin) bad("Super Admin access required.",403);
      const type=url.searchParams.get("type"),id=Number(url.searchParams.get("id"));
      if(!Number.isSafeInteger(id)||id<1)bad("Valid record ID required.");
      let result;
      if(type==="attendance") result=await env.DB.prepare("DELETE FROM attendance WHERE id=?").bind(id).run();
      else if(type==="break") result=await env.DB.prepare("DELETE FROM agent_breaks WHERE id=?").bind(id).run();
      else if(type==="quiz") result=await env.DB.prepare("DELETE FROM quiz_attempts WHERE id=?").bind(id).run();
      else if(type==="kpi") result=await env.DB.prepare("DELETE FROM kpi_daily WHERE id=?").bind(id).run();
      else bad("Unsupported record type.");
      if(!result.meta.changes)bad("Record not found.",404);
      await audit(env,u,"superadmin_record_delete",type+" record "+id);
      return J({success:true,type,id,deleted:result.meta.changes});
    }
    if (m === "GET" && p === "/api/hd/admin/kpi/rows") {
      const from=url.searchParams.get("from"),to=url.searchParams.get("to");
      if(from&&!isDate(from))bad("Invalid 'from' date.");
      if(to&&!isDate(to))bad("Invalid 'to' date.");
      const where=["1=1"],args=[];
      if(from){where.push("report_date>=?");args.push(from);}
      if(to){where.push("report_date<=?");args.push(to);}
      const rows=(await env.DB.prepare("SELECT id,employee_id employeeId,report_date reportDate,disposition,assigned_leads assigned, total_attempts attempts,unique_leads uniqueLeads,connected_calls connected,interested,not_interested notInterested,follow_ups followUps,callbacks,qualified FROM kpi_daily WHERE "+where.join(" AND ")+" ORDER BY report_date DESC,employee_id LIMIT 3000").bind(...args).all()).results;
      return J({rows,count:rows.length});
    }
    if (m === "GET" && p === "/api/hd/kpis/summary") return J(await kpiSummary(url, env, u, admin));
    if (m === "GET" && p === "/api/hd/call-performance/summary") return J(await callPerformanceSummary(url, env, u, false));
    if (m === "GET" && p === "/api/hd/call-performance/rows") return J(await callPerformanceRows(url, env, u, false));
    if (m === "POST" && p === "/api/hd/admin/kpis/import") return J(await kpiImport(req, env, u));
    if (m === "GET" && p === "/api/hd/admin/call-performance/summary") return J(await callPerformanceSummary(url, env, u, true));
    if (m === "GET" && p === "/api/hd/admin/call-performance/sections") return J(await callPerformanceSections(url, env, u));
    if (m === "GET" && p === "/api/hd/admin/call-performance/rows") return J(await callPerformanceRows(url, env, u, true));
    if (m === "POST" && p === "/api/hd/admin/call-performance/import") return J(await callPerformanceImport(req, env, u));
    if (m === "GET" && p === "/api/hd/breaks/status") return J(await breakStatus(env, u));
    if (m === "POST" && p === "/api/hd/breaks/start") return J(await breakStart(req, env, u), 201);
    if (m === "POST" && p === "/api/hd/breaks/end") return J(await breakEnd(env, u));
    if (m === "GET" && p === "/api/hd/acw/status") return J(await acwStatus(env, u));
    if (m === "POST" && p === "/api/hd/acw/start") return J(await acwStart(env, u), 201);
    if (m === "POST" && p === "/api/hd/acw/end") return J(await acwEnd(env, u));
    if (m === "GET" && p === "/api/hd/admin/acw/sessions") return J(await adminAcwSessions(url, env)); 
    if (m === "GET" && p === "/api/hd/admin/breaks/status") return J(await adminBreakStatus(url, env));
    if (m === "GET" && p === "/api/hd/agent-overview/live") return J(await agentOverviewLive(url, env, u));
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
    console.error("[HELPDESK_API_FAILURE]", JSON.stringify({
      method: m,
      path: p,
      message: String(e?.message || e || "Unknown error"),
      stack: e?.stack || null
    }));
    return J({ error: "Something went wrong. Please try again." }, 500);
  }
}


