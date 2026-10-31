import { handleHelpdesk } from "./helpdesk-routes.js";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  "https://nottybuddy.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);
function cors(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://nottybuddy.github.io",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  };
}
function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(request) }
  });
}
async function body(request) {
  try { return await request.json(); } catch { return null; }
}
const now = () => new Date().toISOString();
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function bytesToB64Url(bytes) {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeHex(value) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function decodeB64(value) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch { return null; }
}
function decodeCandidates(value) {
  const values = [decodeHex(value), decodeB64(value)].filter(Boolean);
  const unique = new Map(values.map(v => [Array.from(v).join(","), v]));
  return [...unique.values()];
}
async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function verifyPassword(password, stored) {
  // Supported stored format: pbkdf2$iterations$salt$derivedKey.
  // Decoding supports hex and base64url so existing hashes can be checked without resetting them.
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0].toLowerCase() !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) return false;
  const salts = decodeCandidates(parts[2]), expectedValues = decodeCandidates(parts[3]);
  if (!salts.length || !expectedValues.length) return false;
  for (const expected of expectedValues) {
    const digest = expected.length === 20 ? "SHA-1" : "SHA-256";
    for (const salt of salts) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: digest }, key, expected.length * 8));
      let diff = 0;
      for (let i = 0; i < expected.length; i++) diff |= bits[i] ^ expected[i];
      if (diff === 0) return true;
    }
  }
  return false;
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256));
  return "pbkdf2$100000$" + bytesToB64Url(salt) + "$" + bytesToB64Url(derived);
}
function randomToken() {
  return bytesToB64Url(crypto.getRandomValues(new Uint8Array(32)));
}
async function auth(request, env) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  return await env.DB.prepare(
    "SELECT a.id, a.employee_id, a.full_name, a.role, a.active, a.is_super_admin FROM sessions s JOIN agents a ON a.id=s.agent_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1"
  ).bind(tokenHash, now()).first();
}
function requireRole(user, role) {
  if (!user) throw Object.assign(new Error("Login required."), { status: 401 });
  if (role === "super_admin" && Number(user.is_super_admin) !== 1) throw Object.assign(new Error("Super Admin access required."), { status: 403 });
  if (role === "admin" && String(user.role).toLowerCase() !== "admin") throw Object.assign(new Error("Admin access required."), { status: 403 });
}
function publicUser(user) {
  return { id: user.id, employeeId: user.employee_id, fullName: user.full_name, role: user.role, isSuperAdmin: Number(user.is_super_admin) === 1 };
}
async function audit(env, actor, action, detail) {
  try {
    await env.DB.prepare("INSERT INTO audit_log(actor,action,detail,created_at) VALUES(?,?,?,?)")
      .bind(actor.employee_id, action, detail, now()).run();
  } catch { /* Audit table is added by migration 004; core actions must still return a clear result. */ }
}
async function coreRoute(request, env, url) {
  const path = url.pathname, method = request.method;
  if (path === "/api/health" && method === "GET") return json(request, { ok: true, name: "indiframe-helpdesk-api", time: now() });

  if (path === "/api/login" && method === "POST") {
    const b = await body(request);
    if (!b || !String(b.employeeId || "").trim() || typeof b.password !== "string") return json(request, { error: "Employee ID and password are required." }, 400);
    const user = await env.DB.prepare("SELECT id,employee_id,full_name,password_hash,role,active,is_super_admin,must_change_password FROM agents WHERE employee_id=? COLLATE NOCASE LIMIT 1").bind(String(b.employeeId).trim()).first();
    if (!user || Number(user.active) !== 1 || !(await verifyPassword(b.password, user.password_hash))) return json(request, { error: "Invalid Employee ID or password." }, 401);
    const token = randomToken(), expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    await env.DB.prepare("INSERT INTO sessions(agent_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)").bind(user.id, await sha256(token), expires, now()).run();
    return json(request, { token, user: publicUser(user), mustChangePassword: Number(user.must_change_password) === 1, expiresAt: expires });
  }

  const user = await auth(request, env);
  if (path === "/api/me" && method === "GET") {
    if (!user) return json(request, { error: "Session expired or invalid. Please log in again." }, 401);
    return json(request, { user: publicUser(user) });
  }

  if (path === "/api/change-password" && method === "POST") {
    requireRole(user, "agent");
    const b = await body(request), password = String(b?.password || "");
    if (password.length < 10) return json(request, { error: "Password kam se kam 10 characters ka hona chahiye." }, 400);
    const hash = await hashPassword(password);
    await env.DB.prepare("UPDATE agents SET password_hash=?, must_change_password=0 WHERE id=?").bind(hash, user.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE agent_id=? AND id NOT IN (SELECT id FROM sessions WHERE agent_id=? ORDER BY created_at DESC LIMIT 1)").bind(user.id,user.id).run();
    await audit(env,user,"password_changed","Employee changed own password");
    return json(request, { success: true });
  }

  if (path === "/api/admin/agents" && method === "GET") {
    requireRole(user,"admin");
    const rows=(await env.DB.prepare("SELECT id,employee_id employeeId,full_name fullName,role,active,is_super_admin isSuperAdmin,created_at createdAt FROM agents ORDER BY role DESC,full_name").all()).results;
    return json(request,{agents:rows});
  }
  if (path === "/api/admin/kpis" && method === "GET") {
    requireRole(user,"admin");
    const rows=(await env.DB.prepare("SELECT a.employee_id employeeId,a.full_name fullName,w.week_start weekStart,w.week_end weekEnd,w.metrics_json metricsJson,w.created_at createdAt FROM weekly_kpis w JOIN agents a ON a.id=w.agent_id ORDER BY w.week_start DESC,a.full_name LIMIT 2000").all()).results;
    return json(request,{kpis:rows});
  }
  if (path === "/api/kpis/my" && method === "GET") {
    requireRole(user,"agent");
    const rows=(await env.DB.prepare("SELECT week_start weekStart,week_end weekEnd,metrics_json metricsJson,created_at createdAt FROM weekly_kpis WHERE agent_id=? ORDER BY week_start DESC LIMIT 200").bind(user.id).all()).results;
    return json(request,{kpis:rows,scope:"personal"});
  }
  if (path === "/api/quiz-attempts" && method === "GET") {
    requireRole(user,"agent");
    const sql = String(user.role).toLowerCase()==="admin"
      ? "SELECT q.id,a.employee_id employeeId,a.full_name fullName,q.week_number weekNumber,q.score,q.total_questions totalQuestions,q.completed_at completedAt FROM quiz_attempts q JOIN agents a ON a.id=q.agent_id ORDER BY q.completed_at DESC LIMIT 2000"
      : "SELECT q.id,a.employee_id employeeId,a.full_name fullName,q.week_number weekNumber,q.score,q.total_questions totalQuestions,q.completed_at completedAt FROM quiz_attempts q JOIN agents a ON a.id=q.agent_id WHERE q.agent_id=? ORDER BY q.completed_at DESC LIMIT 500";
    const rows=(await (String(user.role).toLowerCase()==="admin" ? env.DB.prepare(sql).all() : env.DB.prepare(sql).bind(user.id).all())).results;
    return json(request,{attempts:rows,scope:String(user.role).toLowerCase()==="admin"?"team":"personal"});
  }

  if (path === "/api/superadmin/agents" && method === "GET") {
    requireRole(user,"super_admin");
    const rows=(await env.DB.prepare("SELECT id,employee_id employeeId,full_name fullName,role,active,is_super_admin isSuperAdmin,created_at createdAt FROM agents ORDER BY created_at DESC").all()).results;
    return json(request,{agents:rows});
  }
  if (path === "/api/superadmin/agents" && method === "POST") {
    requireRole(user,"super_admin");
    const b=await body(request), employeeId=String(b?.employeeId||"").trim(), fullName=String(b?.fullName||"").trim(), password=String(b?.password||"");
    if(!employeeId||employeeId.length>50||!fullName||fullName.length>160) return json(request,{error:"Employee ID aur full name required hain."},400);
    if(password.length<10) return json(request,{error:"Temporary password kam se kam 10 characters ka hona chahiye."},400);
    const duplicate=await env.DB.prepare("SELECT id FROM agents WHERE employee_id=? COLLATE NOCASE LIMIT 1").bind(employeeId).first();
    if(duplicate)return json(request,{error:"Ye Employee ID pehle se registered hai."},409);
    const hash=await hashPassword(password);
    try{
      const r=await env.DB.prepare("INSERT INTO agents(employee_id,full_name,password_hash,role,active,is_super_admin,created_at) VALUES(?,?,?,'agent',1,0,?)").bind(employeeId,fullName,hash,now()).run();
      await audit(env,user,"agent_created","Agent account created: "+employeeId);
      return json(request,{success:true,id:r.meta.last_row_id,employeeId,role:"agent"},201);
    }catch(e){return json(request,{error:"Agent account create nahi ho paya."},409);}
  }
  const accountMatch=path.match(/^\/api\/superadmin\/agents\/(\d+)$/);
  if(accountMatch && method==="PUT"){
    requireRole(user,"super_admin");
    const id=Number(accountMatch[1]), b=await body(request);
    const target=await env.DB.prepare("SELECT id,employee_id,role,is_super_admin FROM agents WHERE id=?").bind(id).first();
    if(!target)return json(request,{error:"Employee record nahi mila."},404);
    if(Number(target.is_super_admin)===1 && id!==user.id)return json(request,{error:"Dusre Super Admin account ko yahan se change nahi kar sakte."},403);
    const sets=[],args=[];
    if(typeof b?.fullName==="string"&&b.fullName.trim()){sets.push("full_name=?");args.push(b.fullName.trim().slice(0,160));}
    if(b?.role!==undefined)return json(request,{error:"Admin role changes are disabled. Only the existing Super Admin can have Admin access."},400);
    if(typeof b?.active==="boolean"){if(id===user.id&&!b.active)return json(request,{error:"Apne Super Admin account ko deactivate nahi kar sakte."},400);sets.push("active=?");args.push(b.active?1:0);}
    if(b?.password){const pw=String(b.password);if(pw.length<10)return json(request,{error:"Password kam se kam 10 characters ka hona chahiye."},400);sets.push("password_hash=?");args.push(await hashPassword(pw));}
    if(!sets.length)return json(request,{error:"Update ke liye koi valid field nahi mili."},400);
    args.push(id);await env.DB.prepare("UPDATE agents SET "+sets.join(",")+" WHERE id=?").bind(...args).run();
    await audit(env,user,"account_updated","Account updated: "+target.employee_id);
    return json(request,{success:true});
  }

  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors(request)});
    try {
      const url=new URL(request.url);
      const core=await coreRoute(request,env,url);
      if(core)return core;
      const hd=await handleHelpdesk(request,env);
      if(hd)return hd;
      return json(request,{error:"Not found"},404);
    } catch(e) {
      const status=Number(e?.status)||500;
      if(status>=500)console.error("Worker error:",e?.message||e);
      return json(request,{error:status===500?"Server error. Please try again.":e.message},status);
    }
  }
};
