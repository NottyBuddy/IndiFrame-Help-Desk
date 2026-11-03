// Help Desk API routes under /api/hd/. Imported by worker.js after core authentication routes.

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
    if (admin && ["POST", "PUT", "PATCH", "DELETE"].includes(m) && !superAdminKpiImport && !superAdminCallImport) {
      return J({ error: "Admin access is read-only. Operational actions are available to agents only." }, 403);
    }
    if (p === "/api/hd/admin/kpis/import" && !u.isSuperAdmin) {
      return J({ error: "Only Super Admin can publish KPI data." }, 403);
    }
    if (p === "/api/hd/admin/call-performance/import" && !u.isSuperAdmin) {
      return J({ error: "Only Super Admin can import Call Performance data." }, 403);
    }

    if (m === "GET" && p === "/api/hd/projects") return J(await projectList(url, env, u, admin));
    if (m === "POST" && p === "/api/hd/projects") return J(await projectCreate(req, env, u, admin), 201);
    const projectMatch = p.match(/^\/api\/hd\/projects\/(\d+)$/);
    if (m === "GET" && projectMatch) return J(await projectGet(Number(projectMatch[1]), env, u, admin));
    if (m === "PUT" && projectMatch) return J(await projectUpdate(req, Number(projectMatch[1]), env, u, admin));
    const activityMatch = p.match(/^\/api\/hd\/projects\/(\d+)\/activity$/);
    if (m === "GET" && activityMatch) return J(await projectActivity(Number(activityMatch[1]), env, u, admin));
    if (m === "POST" && activityMatch) return J(await projectAddActivity(req, Number(activityMatch[1]), env, u, admin));
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
    if (m === "GET" && p === "/api/hd/admin/breaks/status") return J(await adminBreakStatus(url, env));
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


// ---------- Projects ----------
const PROJECT_STATUSES = new Set([
  "NEW","CONTACTED","QUALIFIED","SITE_VISIT_PENDING","MEASUREMENT_PENDING",
  "MEASURED","QUOTATION_PENDING","QUOTATION_SENT","NEGOTIATION","APPROVED",
  "IN_PRODUCTION","INSTALLATION","COMPLETED","ON_HOLD","LOST","CANCELLED"
]);
const PRODUCT_CATEGORIES = new Set(["window","door","ventilator","mesh","other"]);
const clean = (v, max = 500) => v == null ? null : String(v).trim().slice(0, max);
function projectProducts(input) {
  if (input === undefined) return null;
  if (!Array.isArray(input) || input.length > 100) bad("products must be an array (maximum 100).");
  return input.map((p, i) => {
    const category = String(p.product_category || p.category || "").toLowerCase();
    const quantity = Number(p.quantity ?? 1);
    const width = p.width_mm == null || p.width_mm === "" ? null : Number(p.width_mm);
    const height = p.height_mm == null || p.height_mm === "" ? null : Number(p.height_mm);
    if (!PRODUCT_CATEGORIES.has(category)) bad(`Invalid product category on item ${i + 1}.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) bad(`Invalid quantity on item ${i + 1}.`);
    if (width !== null && (!Number.isInteger(width) || width < 1)) bad(`Invalid width on item ${i + 1}.`);
    if (height !== null && (!Number.isInteger(height) || height < 1)) bad(`Invalid height on item ${i + 1}.`);
    return {
      category, type: clean(p.product_type || p.type, 120), quantity, width, height,
      config: p.configuration_json == null ? (p.configuration == null ? null : JSON.stringify(p.configuration)) : clean(p.configuration_json, 5000),
      notes: clean(p.notes, 1000)
    };
  });
}
async function projectAccess(id, env, u, admin) {
  const row = await env.DB.prepare("SELECT * FROM projects WHERE id=? AND archived_at IS NULL").bind(id).first();
  if (!row) bad("Project not found.", 404);
  if (!admin && row.assigned_agent_id !== u.agentId && row.created_by_agent_id !== u.agentId) bad("Project access denied.", 403);
  return row;
}
async function projectList(url, env, u, admin) {
  const where = ["p.archived_at IS NULL"], args = [];
  if (!admin) { where.push("(p.assigned_agent_id=? OR p.created_by_agent_id=?)"); args.push(u.agentId, u.agentId); }
  const from=url.searchParams.get("from"),to=url.searchParams.get("to");
  if(from&&!isDate(from))bad("Invalid 'from' date.");
  if(to&&!isDate(to))bad("Invalid 'to' date.");
  if(from){where.push("date(p.created_at)>=?");args.push(from);}
  if(to){where.push("date(p.created_at)<=?");args.push(to);}
  const status = url.searchParams.get("status");
  if (status) { if (!PROJECT_STATUSES.has(status)) bad("Invalid project status."); where.push("p.status=?"); args.push(status); }
  const q = clean(url.searchParams.get("q"), 100);
  if (q) { where.push("(p.customer_name LIKE ? OR p.customer_phone LIKE ? OR p.project_code LIKE ? OR p.city LIKE ? OR p.pincode LIKE ?)"); const like = "%" + q + "%"; args.push(like,like,like,like,like); }
  const assigned = admin ? url.searchParams.get("assigned_agent_id") : null;
  if (assigned && /^\d+$/.test(assigned)) { where.push("p.assigned_agent_id=?"); args.push(Number(assigned)); }
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const rows = (await env.DB.prepare(`SELECT p.id,p.project_code,p.customer_name,p.customer_phone,p.city,p.state,p.pincode,p.product_material,p.construction_stage,p.expected_timeline,p.status,p.assigned_agent_id,a.employee_id assigned_employee_id,a.full_name assigned_employee_name,p.next_follow_up_at,p.updated_at FROM projects p LEFT JOIN agents a ON a.id=p.assigned_agent_id WHERE ${where.join(" AND ")} ORDER BY p.updated_at DESC,p.id DESC LIMIT ?`).bind(...args,limit).all()).results;
  return { projects: rows, count: rows.length, scope: admin ? "team" : "assigned" };
}
async function projectGet(id, env, u, admin) {
  const project = await projectAccess(id, env, u, admin);
  const products = (await env.DB.prepare("SELECT id,product_category,product_type,quantity,width_mm,height_mm,configuration_json,notes FROM project_products WHERE project_id=? ORDER BY id").bind(id).all()).results;
  return { project, products };
}
async function projectCreate(req, env, u, admin) {
  const b = await req.json().catch(() => bad("Invalid JSON body."));
  const customer = clean(b.customer_name, 160), phone = clean(b.customer_phone, 30);
  if (!customer) bad("Customer name is required.");
  if (!phone) bad("Customer phone is required.");
  const status = String(b.status || "NEW").toUpperCase();
  if (!PROJECT_STATUSES.has(status)) bad("Invalid project status.");
  const material = clean(b.product_material, 30);
  if (material && !["uPVC","aluminium","WPC","other"].includes(material)) bad("Invalid product material.");
  const projectType = clean(b.project_type, 30) || "residential";
  if (!["residential","commercial","institutional","other"].includes(projectType)) bad("Invalid project type.");
  const products = projectProducts(b.products) || [];
  let assignedId = u.agentId;
  if (b.assigned_agent_id !== undefined && b.assigned_agent_id !== null && b.assigned_agent_id !== "") {
    if (!admin) bad("Only admins can assign a project to another employee.", 403);
    const n = Number(b.assigned_agent_id);
    if (!Number.isInteger(n) || n < 1) bad("Invalid assigned agent.");
    const exists = await env.DB.prepare("SELECT id FROM agents WHERE id=? AND active=1").bind(n).first();
    if (!exists) bad("Assigned employee is not active.", 404);
    assignedId = n;
  }
  const code = "PRJ-" + crypto.randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();
  const t = now();
  const ins = await env.DB.prepare(`INSERT INTO projects(project_name,project_code,customer_name,phone,customer_phone,alternate_phone,email,location,address,city,state,pincode,project_type,product_material,construction_stage,expected_timeline,status,assigned_to,assigned_agent_id,created_by,created_by_agent_id,requirements_notes,requirements_json,next_follow_up_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(code,code,customer,phone,phone,clean(b.alternate_phone,30),clean(b.email,160),clean(b.city,100),clean(b.address,500),clean(b.city,100),clean(b.state,100),clean(b.pincode,12),projectType,material,clean(b.construction_stage,120),clean(b.expected_timeline,120),status,String(assignedId),assignedId,u.agentId,u.agentId,clean(b.requirements_notes,4000),b.requirements_json == null ? null : clean(typeof b.requirements_json==="string"?b.requirements_json:JSON.stringify(b.requirements_json),10000),clean(b.next_follow_up_at,40),t,t).run();
  const id = ins.meta.last_row_id;
  const statements = products.map(p => env.DB.prepare("INSERT INTO project_products(project_id,product_type,product_category,quantity,width_mm,height_mm,configuration_json,notes) VALUES(?,?,?,?,?,?,?,?)").bind(id,p.type || p.category,p.category,p.quantity,p.width,p.height,p.config,p.notes));
  statements.push(env.DB.prepare("INSERT INTO project_activity(project_id,actor_id,actor_agent_id,activity_type,description,new_status,created_at) VALUES(?,?,?,?,?,?,?)").bind(id,u.agentId,u.agentId,"created","Project created",status,t));
  await env.DB.batch(statements);
  return { id, projectCode: code, status };
}
async function projectUpdate(req, id, env, u, admin) {
  const old = await projectAccess(id, env, u, admin);
  const b = await req.json().catch(() => bad("Invalid JSON body."));
  const allowed = {
    customer_name:["customer_name",160],customer_phone:["customer_phone",30],alternate_phone:["alternate_phone",30],
    email:["email",160],address:["address",500],city:["city",100],state:["state",100],pincode:["pincode",12],
    construction_stage:["construction_stage",120],expected_timeline:["expected_timeline",120],
    requirements_notes:["requirements_notes",4000],next_follow_up_at:["next_follow_up_at",40]
  };
  const sets=[],args=[];
  for (const [key,[column,max]] of Object.entries(allowed)) if (key in b) { const value=clean(b[key],max); if (key==="customer_name" && !value) bad("Customer name cannot be empty."); if (key==="customer_phone" && !value) bad("Customer phone cannot be empty."); sets.push(column+"=?"); args.push(value); }
  let nextStatus=old.status;
  if ("status" in b) { nextStatus=String(b.status).toUpperCase(); if (!PROJECT_STATUSES.has(nextStatus)) bad("Invalid project status."); sets.push("status=?"); args.push(nextStatus); }
  if ("product_material" in b) { const v=clean(b.product_material,30); if(v && !["uPVC","aluminium","WPC","other"].includes(v)) bad("Invalid product material."); sets.push("product_material=?"); args.push(v); }
  if (admin && "assigned_agent_id" in b) {
    const v=b.assigned_agent_id==null||b.assigned_agent_id===""?null:Number(b.assigned_agent_id);
    if(v!==null && (!Number.isInteger(v)||v<1||!(await env.DB.prepare("SELECT id FROM agents WHERE id=? AND active=1").bind(v).first()))) bad("Assigned employee is not active.");
    sets.push("assigned_agent_id=?"); args.push(v);
  } else if ("assigned_agent_id" in b) bad("Only admins can reassign projects.",403);
  const products=projectProducts(b.products);
  const t=now();
  if(sets.length){ sets.push("updated_at=?"); args.push(t,id); await env.DB.prepare("UPDATE projects SET "+sets.join(",")+" WHERE id=?").bind(...args).run(); }
  const stmts=[];
  if(products!==null){
    stmts.push(env.DB.prepare("DELETE FROM project_products WHERE project_id=?").bind(id));
    for(const p of products) stmts.push(env.DB.prepare("INSERT INTO project_products(project_id,product_category,product_type,quantity,width_mm,height_mm,configuration_json,notes) VALUES(?,?,?,?,?,?,?,?)").bind(id,p.category,p.type,p.quantity,p.width,p.height,p.config,p.notes));
  }
  if(nextStatus!==old.status) stmts.push(env.DB.prepare("INSERT INTO project_activity(project_id,actor_id,actor_agent_id,activity_type,description,old_status,new_status,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,u.agentId,u.agentId,"status_change","Project status changed",old.status,nextStatus,t));
  if(stmts.length) await env.DB.batch(stmts);
  return { id, updated: true, status: nextStatus };
}
async function projectActivity(id, env, u, admin) {
  await projectAccess(id,env,u,admin);
  const rows=(await env.DB.prepare("SELECT pa.id,pa.activity_type,pa.description,pa.old_status,pa.new_status,pa.metadata_json,pa.created_at,a.employee_id actor_employee_id,a.full_name actor_name FROM project_activity pa LEFT JOIN agents a ON a.id=pa.actor_agent_id WHERE pa.project_id=? ORDER BY pa.created_at DESC,pa.id DESC LIMIT 200").bind(id).all()).results;
  return { activity: rows };
}
async function projectAddActivity(req,id,env,u,admin) {
  await projectAccess(id,env,u,admin);
  const b=await req.json().catch(()=>bad("Invalid JSON body."));
  const description=clean(b.description,2000);
  const type=clean(b.activity_type,60)||"note";
  if(!description) bad("Activity description is required.");
  const t=now();
  const r=await env.DB.prepare("INSERT INTO project_activity(project_id,actor_id,actor_agent_id,activity_type,description,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)").bind(id,u.agentId,u.agentId,type,description,b.metadata==null?null:JSON.stringify(b.metadata).slice(0,5000),t).run();
  await env.DB.prepare("UPDATE projects SET updated_at=?,last_contacted_at=? WHERE id=?").bind(t,t,id).run();
  return { id:r.meta.last_row_id, createdAt:t };
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
// No application-level row cap. D1 writes are chunked to keep batches within practical statement limits.
// Every received row ends up in exactly one bucket: accepted, skippedExisting, or invalid. Nothing is dropped silently.
async function kpiImport(req, env, u) {
  const body = await req.json().catch(() => bad("Invalid JSON body."));
  const rows = body.rows;
  if (!Array.isArray(rows) || !rows.length) bad("No rows supplied.");
  // employee_id (as typed in the report) -> canonical agents.employee_id, case-insensitive
  const agents = new Map();
  const agentRows = (await env.DB.prepare("SELECT employee_id, full_name FROM agents WHERE active = 1").all()).results;
  for (const a of agentRows) {
    agents.set(String(a.employee_id).trim().toLowerCase(), String(a.employee_id));
    if (a.full_name) agents.set(String(a.full_name).trim().toLowerCase(), String(a.employee_id));
  }
  const valid = [], invalid = [], seenAt = new Map();
  rows.forEach((r, i) => {
    const n = i + 1;
    if (!r || typeof r !== "object") return invalid.push({ row: n, reason: "Row is not an object" });
    const typed = String(r.employee_id ?? "").trim(), d = String(r.report_date ?? "").trim(), disp = String(r.disposition ?? "").trim().slice(0, 60);
    if (!typed) return invalid.push({ row: n, reason: "Missing employee ID" });
    const emp = agents.get(typed.toLowerCase());
    if (!emp) return invalid.push({ row: n, reason: `Unknown Agent/Caller Name or Employee ID "${typed.slice(0, 30)}"` });
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
  const ins = env.DB.prepare(`INSERT INTO kpi_daily(employee_id,kpi_date,report_date,disposition,calls,leads,site_visits,bookings,revenue,${NUM.join(",")},import_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,${NUM.map(() => "?").join(",")},(SELECT id FROM kpi_imports WHERE file_hash = ?),?)`);
  let imp;
  try {
    // Create the import record, then write rows in bounded D1 batches. On any failure,
    // remove this import's rows and record so a partial import is not presented as complete.
    await env.DB.prepare("INSERT INTO kpi_imports(file_hash,file_name,filename,imported_by,imported_at,total_rows,successful_rows,failed_rows,rows_accepted,rows_skipped) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(hash, String(body.filename || "").slice(0, 120) || "kpi-import", String(body.filename || "").slice(0, 120), u.employeeId, now(), fresh.length + skipped.length + invalid.length, fresh.length, skipped.length + invalid.length, fresh.length, skipped.length + invalid.length).run();
    imp = await env.DB.prepare("SELECT id FROM kpi_imports WHERE file_hash = ?").bind(hash).first();
    const CHUNK_SIZE = 80;
    for (let start = 0; start < fresh.length; start += CHUNK_SIZE) {
      const chunk = fresh.slice(start, start + CHUNK_SIZE);
      await env.DB.batch(chunk.map(o => ins.bind(o.employee_id, o.report_date, o.report_date, o.disposition, o.total_attempts, o.assigned_leads, 0, 0, 0, ...NUM.map(k => o[k]), hash, now())));
    }
  } catch (e) {
    console.error("kpi import chunk failed", e && e.message);
    try {
      if (imp?.id) {
        await env.DB.prepare("DELETE FROM kpi_daily WHERE import_id = ?").bind(imp.id).run();
        await env.DB.prepare("DELETE FROM kpi_imports WHERE id = ?").bind(imp.id).run();
      } else {
        await env.DB.prepare("DELETE FROM kpi_imports WHERE file_hash = ?").bind(hash).run();
      }
    } catch (rollbackError) {
      console.error("kpi import rollback failed", rollbackError && rollbackError.message);
      bad("Import failed and rollback needs administrator review. Do not retry until the import log is checked.", 500);
    }
    bad("Import failed; saved chunks were rolled back. Check the data and retry.", 409);
  }
  const saved = (await env.DB.prepare("SELECT COUNT(*) c FROM kpi_daily WHERE import_id = ?").bind(imp.id).first()).c;
  if (saved !== fresh.length) throw new Error(`kpi import count mismatch: expected ${fresh.length}, saved ${saved}`);
  await audit(env, u, "kpi_import", `import ${imp.id}: ${saved} saved, ${skipped.length} existing skipped, ${invalid.length} invalid, file ${String(body.filename || "").slice(0, 60)}`);
  return { dryRun: false, importId: imp.id, saved, ...summary };
}

// ---------- Break management ----------
const BREAK_TYPES = new Set(["tea","lunch","bio","personal","other"]);
async function breakStatus(env,u) {
  const active = await env.DB.prepare("SELECT id,break_type,started_at FROM agent_breaks WHERE agent_id=? AND ended_at IS NULL").bind(u.agentId).first();
  const recent = (await env.DB.prepare("SELECT id,break_type,started_at,ended_at,duration_seconds FROM agent_breaks WHERE agent_id=? ORDER BY started_at DESC LIMIT 20").bind(u.agentId).all()).results;
  return { active: active ? { ...active, elapsedSeconds: Math.max(0,Math.floor((Date.now()-Date.parse(active.started_at))/1000)) } : null, history: recent };
}
async function breakStart(req,env,u) {
  const b=await req.json().catch(()=>({}));
  const type=String(b.break_type||"").toLowerCase();
  if(!BREAK_TYPES.has(type)) bad("Select a valid break type.");
  const t=now();
  try {
    const r=await env.DB.prepare("INSERT INTO agent_breaks(employee_id,agent_id,break_type,started_at,created_at) VALUES(?,?,?,?,?)").bind(u.employeeId,u.agentId,type,t,t).run();
    return { id:r.meta.last_row_id, breakType:type, startedAt:t };
  } catch(e) { bad("An active break already exists. End it before starting another break.",409); }
}
async function breakEnd(env,u) {
  const active=await env.DB.prepare("SELECT id,break_type,started_at FROM agent_breaks WHERE agent_id=? AND ended_at IS NULL").bind(u.agentId).first();
  if(!active) bad("There is no active break to end.",409);
  const t=now(), seconds=Math.max(0,Math.floor((Date.parse(t)-Date.parse(active.started_at))/1000));
  await env.DB.prepare("UPDATE agent_breaks SET ended_at=?,duration_seconds=?,duration_minutes=? WHERE id=? AND ended_at IS NULL").bind(t,seconds,Math.floor(seconds/60),active.id).run();
  return { id:active.id,breakType:active.break_type,startedAt:active.started_at,endedAt:t,durationSeconds:seconds };
}
async function adminBreakStatus(url, env) {
  const from=url.searchParams.get("from"), to=url.searchParams.get("to");
  if(from&&!isDate(from))bad("Invalid 'from' date.");
  if(to&&!isDate(to))bad("Invalid 'to' date.");
  const where=["a.active=1"],args=[];
  if(from){where.push("date(b.started_at)>=?");args.push(from);}
  if(to){where.push("date(b.started_at)<=?");args.push(to);}
  const rows=(await env.DB.prepare("SELECT b.id,b.break_type,b.started_at,b.ended_at,b.duration_minutes,a.employee_id,a.full_name FROM agent_breaks b JOIN agents a ON a.id=b.agent_id WHERE "+where.join(" AND ")+" ORDER BY b.started_at DESC LIMIT 2000").bind(...args).all()).results;
  const t=Date.now();
  return { breaks:rows.map(r=>({...r,elapsedSeconds:r.ended_at?Math.max(0,Math.floor((Date.parse(r.ended_at)-Date.parse(r.started_at))/1000)):Math.max(0,Math.floor((t-Date.parse(r.started_at))/1000))})), serverTime:now() };
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
  const month=url.searchParams.get("month"), from=url.searchParams.get("from"), to=url.searchParams.get("to");
  if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))bad("Invalid month (use YYYY-MM).");
  if(from&&!isDate(from))bad("Invalid 'from' date.");
  if(to&&!isDate(to))bad("Invalid 'to' date.");
  const emp=admin?(url.searchParams.get("employee_id")||null):u.employeeId;
  const w=[],b=[];
  if(month){w.push("work_date LIKE ?");b.push(month+"-%");}
  if(from){w.push("work_date>=?");b.push(from);}
  if(to){w.push("work_date<=?");b.push(to);}
  if(emp){w.push("employee_id=?");b.push(emp);}
  const W=w.length?w.join(" AND "):"1=1";
  const rows=(await env.DB.prepare(`SELECT employee_id employeeId,work_date workDate,check_in_at checkInAt,check_out_at checkOutAt,duration_minutes durationMinutes FROM attendance WHERE ${W} ORDER BY work_date DESC,check_in_at DESC LIMIT 3000`).bind(...b).all()).results;
  const sum=(await env.DB.prepare(`SELECT employee_id employeeId,COUNT(DISTINCT work_date) daysPresent,COALESCE(SUM(duration_minutes),0) totalMinutes FROM attendance WHERE ${W} GROUP BY employee_id ORDER BY employee_id LIMIT 500`).bind(...b).all()).results;
  return {month,from,to,records:rows,summary:sum};
}

// ---------- Isolated Call Performance ----------
const cpNormKey = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function cpPick(row, names) {
  const wanted = new Set(names.map(cpNormKey));
  for (const [key, value] of Object.entries(row || {})) {
    if (key.startsWith("__call_performance_")) continue;
    if (wanted.has(cpNormKey(key)) && value !== "" && value != null) return value;
  }
  return null;
}
function cpDate(value) {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isDate(s) ? s : null;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    const out = year + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return isDate(out) ? out : null;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}
function cpNormalizeRow(input) {
  const source = Object.fromEntries(Object.entries(input || {}).filter(([key]) => cpNormKey(key) !== "req filed"));
  const helperDate = source.__call_performance_date;
  const helperAgent = source.__call_performance_agent;
  delete source.__call_performance_date;
  delete source.__call_performance_agent;
  const agentName = clean(cpPick(source, ["agent name", "employee name", "caller name", "caller full name", "full name", "agent", "caller", "employee"]) || helperAgent, 200);
  const employeeId = clean(cpPick(source, ["employee id", "agent id", "employee code", "caller id"]) || helperAgent || agentName, 100);
  const date = cpDate(helperDate || cpPick(source, ["date", "report date", "call date", "activity date", "created date", "created on", "call start date"]));
  const disposition = clean(cpPick(source, ["disposition", "call disposition", "call status", "status", "call result", "result"]), 160) || "";
  return { source, employeeId, employeeName: agentName || employeeId || "", date, disposition };
}
function cpWhere(url, u, admin) {
  const where = ["1=1"], args = [];
  const from = url.searchParams.get("from"), to = url.searchParams.get("to"), employee = url.searchParams.get("employee_id");
  if (from && !isDate(from)) bad("Invalid 'from' date (use YYYY-MM-DD).");
  if (to && !isDate(to)) bad("Invalid 'to' date (use YYYY-MM-DD).");
  if (from) { where.push("report_date >= ?"); args.push(from); }
  if (to) { where.push("report_date <= ?"); args.push(to); }
  if (admin) {
    if (employee) { where.push("employee_id = ?"); args.push(employee); }
  } else {
    // Agent access is strictly tied to the authenticated Help Desk employee ID.
    // Never trust an employee_id supplied by the browser.
    where.push("employee_id = ?");
    args.push(u.employeeId);
  }
  const disposition = url.searchParams.get("disposition");
  if (disposition) { where.push("lower(trim(disposition)) = lower(trim(?))"); args.push(disposition.trim()); }
  return { where: where.join(" AND "), args };
}
async function callPerformanceSummary(url, env, u, admin = false) {
  const { where, args } = cpWhere(url, u, admin);
  const one = sql => env.DB.prepare(sql).bind(...args).first();
  const all = sql => env.DB.prepare(sql).bind(...args).all().then(r => r.results);
  const [totals, byAgent, daily, byDisposition] = await Promise.all([
    one(`SELECT COUNT(*) calls, COUNT(DISTINCT employee_id) agents, COUNT(DISTINCT report_date) dates, COUNT(DISTINCT disposition) dispositions FROM call_performance_rows WHERE ${where}`),
    all(`SELECT employee_id employeeId, MAX(employee_name) employeeName, COUNT(*) calls, MIN(report_date) firstDate, MAX(report_date) lastDate FROM call_performance_rows WHERE ${where} GROUP BY employee_id ORDER BY calls DESC, employee_id`),
    all(`SELECT report_date date, COUNT(*) calls, COUNT(DISTINCT employee_id) agents FROM call_performance_rows WHERE ${where} GROUP BY report_date ORDER BY report_date`),
    all(`SELECT disposition, COUNT(*) calls FROM call_performance_rows WHERE ${where} GROUP BY disposition ORDER BY calls DESC, disposition`)
  ]);
  return { totals: totals || { calls: 0, agents: 0, dates: 0, dispositions: 0 }, byAgent, daily, byDisposition };
}
async function callPerformanceRows(url, env, u, admin = false) {
  const { where, args } = cpWhere(url, u, admin);
  const rows = (await env.DB.prepare(`SELECT id, employee_id employeeId, employee_name employeeName, report_date reportDate, disposition, source_json, created_at createdAt FROM call_performance_rows WHERE ${where} ORDER BY report_date DESC, employee_name, id`).bind(...args).all()).results;
  return { rows: rows.map(r => ({ ...r, source: JSON.parse(r.source_json || "{}"), source_json: undefined })) };
}
async function callPerformanceSections(url, env, u) {
  await ensureCallPerformanceSections(env);
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  if (from && !isDate(from)) bad("Invalid 'from' date (use YYYY-MM-DD).");
  if (to && !isDate(to)) bad("Invalid 'to' date (use YYYY-MM-DD).");
  const where = ["1=1"], args = [];
  if (from) { where.push("(report_date IS NULL OR report_date >= ?)"); args.push(from); }
  if (to) { where.push("(report_date IS NULL OR report_date <= ?)"); args.push(to); }
  const employee = url.searchParams.get("employee_id");
  if (employee) { where.push("employee_id = ?"); args.push(employee); }
  const disposition = url.searchParams.get("disposition");
  if (disposition) { where.push("lower(trim(label)) = lower(trim(?))"); args.push(disposition.trim()); }
  const rows = (await env.DB.prepare(`SELECT report_type reportType, employee_id employeeId, employee_name employeeName, report_date reportDate, label, data_json dataJson FROM call_performance_report_rows WHERE ${where.join(" AND ")} ORDER BY COALESCE(report_date,''), employee_name, label`).bind(...args).all()).results || [];
  const dispositions=(await env.DB.prepare("SELECT DISTINCT label FROM call_performance_report_rows WHERE report_type=? AND label<>'' ORDER BY label").bind("team_day_disposition").all()).results.map(r=>r.label);
  return { sections: rows.map(r => ({ ...r, data: JSON.parse(r.dataJson || "{}"), dataJson: undefined })), dispositions };
}
async function ensureCallPerformanceSections(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS call_performance_report_rows (
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
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_cp_report_type_date ON call_performance_report_rows(report_type, report_date)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_cp_report_agent ON call_performance_report_rows(employee_id, report_type)").run();
}
async function callPerformanceImport(req, env, u) {
  const body = await req.json().catch(() => bad("Invalid JSON body."));
  if (!Array.isArray(body?.rows) || !body.rows.length) bad("rows must be a non-empty array.");
  const normalized = body.rows.map((r, i) => ({ rowNumber: i + 1, ...cpNormalizeRow(r) }));
  const reportRows = Array.isArray(body.report_rows) ? body.report_rows : [];
  // Resolve name-only workbook rows to the canonical Help Desk employee ID.
  const agents = (await env.DB.prepare("SELECT employee_id, full_name FROM agents").all()).results || [];
  const agentByName = new Map(agents.map(a => [String(a.full_name || "").trim().toLowerCase(), a.employee_id]));
  const resolveAgent = name => { const n=String(name||"").trim().toLowerCase(); if(agentByName.has(n)) return agentByName.get(n); const matches=agents.filter(a=>String(a.full_name||"").toLowerCase().split(/\s+/).includes(n)); return matches.length===1?matches[0].employee_id:null; };
  for (const row of normalized) {
    const matchedId = agentByName.get(String(row.employeeName || "").trim().toLowerCase());
    if (matchedId && (!row.employeeId || String(row.employeeId).trim().toLowerCase() === String(row.employeeName || "").trim().toLowerCase())) {
      row.employeeId = String(matchedId);
    }
  }
  for (const rr of reportRows) { if (rr.employeeName && !rr.employeeId) rr.employeeId=String(resolveAgent(rr.employeeName)||""); else if (rr.employeeName && rr.employeeId===rr.employeeName) rr.employeeId=String(resolveAgent(rr.employeeName)||""); }
  const invalidRows = normalized.filter(r => !r.employeeId || !r.date).map(r => ({ row: r.rowNumber, reason: !r.employeeId ? "Agent/Employee is missing." : "Date is missing or invalid." }));
  const seen = new Set(), candidates = [];
  for (const row of normalized) {
    if (!row.employeeId || !row.date) continue;
    const rowHash = await sha256(JSON.stringify({ employeeId: row.employeeId, date: row.date, source: row.source }));
    if (seen.has(rowHash)) continue;
    seen.add(rowHash);
    candidates.push({ ...row, rowHash });
  }
  const reportCandidates = reportRows.filter(r => r && r.type && r.data && (String(r.type).startsWith("team_") || r.employeeId)).map(r => ({...r, employeeId:r.employeeId?String(r.employeeId):null, employeeName:clean(r.employeeName,200)||"", reportDate:r.reportDate&&isDate(r.reportDate)?r.reportDate:null, label:clean(r.label,200)||"", type:clean(r.type,40)}));
  const fileHash = await sha256(JSON.stringify({rows:body.rows, report_rows:reportRows}));
  const existingImport = await env.DB.prepare("SELECT id FROM call_performance_imports WHERE file_hash=?").bind(fileHash).first();
  const existingHashes = new Set();
  for (let i = 0; i < candidates.length; i += 80) {
    const chunk = candidates.slice(i, i + 80);
    if (!chunk.length) continue;
    const marks = chunk.map(() => "?").join(",");
    const found = (await env.DB.prepare("SELECT row_hash FROM call_performance_rows WHERE row_hash IN (" + marks + ")").bind(...chunk.map(x => x.rowHash)).all()).results;
    for (const row of found) existingHashes.add(row.row_hash);
  }
  const accepted = candidates.filter(r => !existingHashes.has(r.rowHash)).length;
  const skippedDuplicates = candidates.length - accepted + (normalized.length - candidates.length - invalidRows.length);
  const dryRun = body.dry_run === true;
  if (dryRun) return { dryRun: true, totalRows: body.rows.length, reportRows: reportCandidates.length, accepted: existingImport ? 0 : accepted, skippedDuplicates: existingImport ? body.rows.length - invalidRows.length : skippedDuplicates, invalidCount: invalidRows.length, invalidRows, duplicateFile: !!existingImport };
  if (existingImport) return { success: true, saved: 0, skippedDuplicates: body.rows.length - invalidRows.length, invalidCount: invalidRows.length, duplicateFile: true, message: "This exact workbook has already been imported." };
  if (invalidRows.length && body.accept_partial !== true) bad("Some rows are invalid. Validate the workbook or set accept_partial=true.");
  const t = now();
  const ins = await env.DB.prepare("INSERT INTO call_performance_imports(file_hash,filename,imported_by,imported_at,rows_received,rows_inserted,rows_skipped) VALUES(?,?,?,?,?,?,?)")
    .bind(fileHash, clean(body.filename, 255), u.employeeId, t, body.rows.length, 0, 0).run();
  const importId = ins.meta.last_row_id;
  let saved = 0;
  const fresh = candidates.filter(r => !existingHashes.has(r.rowHash));
  await ensureCallPerformanceSections(env);
  for (let i = 0; i < fresh.length; i += 100) {
    const statements = fresh.slice(i, i + 100).map(r => env.DB.prepare(
      "INSERT OR IGNORE INTO call_performance_rows(import_id,employee_id,employee_name,report_date,disposition,row_hash,source_json,created_at) VALUES(?,?,?,?,?,?,?,?)"
    ).bind(importId, r.employeeId, r.employeeName, r.date, r.disposition, r.rowHash, JSON.stringify(r.source), t));
    const results = await env.DB.batch(statements);
    saved += results.reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
  }
  let savedReports=0;
  for (let i=0;i<reportCandidates.length;i+=100) {
    const batch=[]; for(const r of reportCandidates.slice(i,i+100)){const payload={type:r.type,employeeId:r.employeeId,employeeName:r.employeeName,reportDate:r.reportDate,label:r.label,data:r.data};const hash=await sha256(JSON.stringify(payload));batch.push(env.DB.prepare("INSERT OR IGNORE INTO call_performance_report_rows(import_id,report_type,employee_id,employee_name,report_date,label,row_hash,data_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(importId,r.type,r.employeeId,r.employeeName,r.reportDate,r.label,hash,JSON.stringify(r.data),t));}
    const results=await env.DB.batch(batch); savedReports+=results.reduce((n,x)=>n+Number(x?.meta?.changes||0),0);
  }
  const skipped = body.rows.length - saved;
  await env.DB.prepare("UPDATE call_performance_imports SET rows_inserted=?, rows_skipped=? WHERE id=?").bind(saved, skipped, importId).run();
  return { success: true, importId, saved, savedReports, skippedDuplicates: skipped - invalidRows.length, invalidCount: invalidRows.length, duplicateFile: false };
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
  const week=wk(url.searchParams.get("week")),from=url.searchParams.get("from"),to=url.searchParams.get("to");
  if(from&&!isDate(from))bad("Invalid 'from' date.");
  if(to&&!isDate(to))bad("Invalid 'to' date.");
  const where=["qa.week_number=?"],args=[week];
  if(from){where.push("date(qa.completed_at)>=?");args.push(from);}
  if(to){where.push("date(qa.completed_at)<=?");args.push(to);}
  const r=(await env.DB.prepare("SELECT a.employee_id employeeId,qa.score,qa.total_questions total,qa.completed_at completedAt FROM quiz_attempts qa JOIN agents a ON a.id=qa.agent_id WHERE "+where.join(" AND ")+" ORDER BY qa.score DESC LIMIT 2000").bind(...args).all()).results;
  const s=r.reduce((a,x)=>a+x.score,0),t=r.reduce((a,x)=>a+x.total,0);
  return {week,from,to,attempts:r,team:{attempts:r.length,averagePercent:rate(s,t)}};
}
