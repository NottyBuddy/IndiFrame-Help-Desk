import { handleHelpdesk } from "./helpdesk-routes.js";
import { handleWeeklyData } from "./weekly-data-routes.js";

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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    "SELECT a.id, a.employee_id, a.full_name, a.role, a.active, a.is_super_admin, a.must_change_password FROM sessions s JOIN agents a ON a.id=s.agent_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1"
  ).bind(tokenHash, now()).first();
}
function requireRole(user, role) {
  if (!user) throw Object.assign(new Error("Login required."), { status: 401 });
  if (role === "super_admin" && Number(user.is_super_admin) !== 1) throw Object.assign(new Error("Super Admin access required."), { status: 403 });
  if (role === "admin" && String(user.role).toLowerCase() !== "admin") throw Object.assign(new Error("Admin access required."), { status: 403 });
}
function publicUser(user) {
  return {
    id: user.id,
    employeeId: user.employee_id,
    fullName: user.full_name,
    role: user.role,
    isSuperAdmin: Number(user.is_super_admin) === 1
  };
}

async function audit(env, actor, action, detail) {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_log(actor,action,detail,created_at) VALUES(?,?,?,?)"
    )
      .bind(actor.employee_id, action, detail, now())
      .run();
  } catch {
    /* Audit table is added by migration 004; core actions must still return a clear result. */
  }
}

async function coreRoute(request, env, url) {
  const path = url.pathname, method = request.method;

  // ROOT ROUTE — Worker status
  if (path === "/" && method === "GET") {
    return json(request, {
      ok: true,
      name: "indiframe-helpdesk-api",
      service: "IndiFrame Help Desk API",
      message: "Worker is running.",
      health: "/api/health"
    });
  }

  // EXISTING HEALTH ROUTE
  if (path === "/api/health" && method === "GET") {
    return json(request, {
      ok: true,
      name: "indiframe-helpdesk-api",
      time: now()
    });
  }

  if (path === "/api/login" && method === "POST") {
    const b = await body(request);

    if (!b || !String(b.employeeId || "").trim() || typeof b.password !== "string") {
      return json(request, {
        error: "Employee ID and password are required."
      }, 400);
    }

    const user = await env.DB.prepare(
      "SELECT id,employee_id,full_name,password_hash,role,active,is_super_admin,must_change_password FROM agents WHERE employee_id=? COLLATE NOCASE LIMIT 1"
    )
      .bind(String(b.employeeId).trim())
      .first();

    if (!user || Number(user.active) !== 1 || !(await verifyPassword(b.password, user.password_hash))) {
      return json(request, {
        error: "Invalid Employee ID or password."
      }, 401);
    }

    const token = randomToken();
    const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    await env.DB.prepare(
      "INSERT INTO sessions(agent_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)"
    )
      .bind(user.id, await sha256(token), expires, now())
      .run();

    return json(request, {
      token,
      user: publicUser(user),
      mustChangePassword: Number(user.must_change_password) === 1,
      expiresAt: expires
    });
  }
  const user = await auth(request, env);
  if (user && Number(user.must_change_password) === 1 && path !== "/api/change-password" && path !== "/api/me") {
    return json(request, { error: "First login par password change karna zaroori hai.", mustChangePassword: true }, 403);
  }
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
    const b=await body(request), employeeId=String(b?.employeeId||"").trim(), fullName=String(b?.fullName||"").trim(), password=String(b?.password||""), role=String(b?.role||"agent").toLowerCase();
    if(!employeeId||employeeId.length>50||!fullName||fullName.length>160) return json(request,{error:"Employee ID aur full name required hain."},400);
    if(!["agent","admin"].includes(role)) return json(request,{error:"Role Agent ya Admin hona chahiye."},400);
    if(password.length<10) return json(request,{error:"Temporary password kam se kam 10 characters ka hona chahiye."},400);
    const duplicate=await env.DB.prepare("SELECT id FROM agents WHERE employee_id=? COLLATE NOCASE LIMIT 1").bind(employeeId).first();
    if(duplicate)return json(request,{error:"Ye Employee ID pehle se registered hai."},409);
    const hash=await hashPassword(password);
    try{
      const r=await env.DB.prepare("INSERT INTO agents(employee_id,full_name,password_hash,role,active,is_super_admin,must_change_password,created_at) VALUES(?,?,?,?,1,0,1,?)").bind(employeeId,fullName,hash,role,now()).run();
      await audit(env,user,"account_created",role+" account created: "+employeeId);
      return json(request,{success:true,id:r.meta.last_row_id,employeeId,role},201);
    }catch(e){return json(request,{error:"Account create nahi ho paya. Employee ID duplicate ho sakti hai."},409);}
  }
  const accountParts=path.split("/"), accountId=accountParts.length===5&&accountParts[1]==="api"&&accountParts[2]==="superadmin"&&accountParts[3]==="agents"?Number(accountParts[4]):0;
  if(Number.isSafeInteger(accountId)&&accountId>0 && ["PUT","DELETE"].includes(method)){
    requireRole(user,"super_admin");
    const id=accountId, b=method==="PUT"?await body(request):{};
    const target=await env.DB.prepare("SELECT id,employee_id,full_name,role,is_super_admin,active FROM agents WHERE id=?").bind(id).first();
    if(!target)return json(request,{error:"Employee record nahi mila."},404);
    if(Number(target.is_super_admin)===1)return json(request,{error:"Super Admin account protected hai; is account ko edit, deactivate ya archive nahi kar sakte."},403);
    if(method==="DELETE"){
      // Preserve quiz history: the existing quiz-attempt schema is legacy-managed,
      // and its FK definition is not owned by this repository. Refuse deletion
      // rather than silently lose history or leave orphaned rows.
      const quizHistory=await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_attempts WHERE agent_id=?").bind(id).first();
      if(Number(quizHistory?.total||0)>0){
        return json(request,{error:"Is account ki quiz history maujood hai. History preserve karne ke liye permanent delete block kiya gaya hai. Pehle quiz-history retention/reassignment approve karein."},409);
      }
      // Remove login sessions and account-bound break/ACW rows. Employee-ID based
      // attendance/KPI history and project records are retained.
      const statements=[
        env.DB.prepare("DELETE FROM sessions WHERE agent_id=?").bind(id)
      ];
      const optionalAcw=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_acw_sessions'").first();
      if(optionalAcw){
        statements.push(env.DB.prepare("DELETE FROM agent_acw_sessions WHERE agent_id=?").bind(id));
      }
      const optionalBreaks=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_breaks'").first();
      if(optionalBreaks){
        statements.push(env.DB.prepare("DELETE FROM agent_breaks WHERE agent_id=?").bind(id));
      }
      statements.push(env.DB.prepare("DELETE FROM agents WHERE id=? AND is_super_admin=0").bind(id));
      const results=await env.DB.batch(statements);
      const removed=Number(results[results.length-1]?.meta?.changes||0);
      if(!removed)return json(request,{error:"Account delete nahi hua. Record protected ho sakta hai ya dependent data constraint block kar raha hai."},409);
      await audit(env,user,"account_permanently_deleted","Permanently deleted account: "+target.employee_id);
      return json(request,{success:true,deleted:true,message:"Account permanently deleted."});
    }
    const sets=[],args=[],changes=[];
    if("employeeId" in (b||{})){
      const employeeId=String(b.employeeId||"").trim();
      if(!employeeId||employeeId.length>50)return json(request,{error:"Employee ID required hai (maximum 50 characters)."},400);
      const duplicate=await env.DB.prepare("SELECT id FROM agents WHERE employee_id=? COLLATE NOCASE AND id<>? LIMIT 1").bind(employeeId,id).first();
      if(duplicate)return json(request,{error:"Ye Employee ID kisi aur account par already use ho rahi hai."},409);
      sets.push("employee_id=?");args.push(employeeId);changes.push("employee ID");
    }
    if("fullName" in (b||{})){
      const fullName=String(b.fullName||"").trim();
      if(!fullName||fullName.length>160)return json(request,{error:"Full name required hai (maximum 160 characters)."},400);
      sets.push("full_name=?");args.push(fullName);changes.push("full name");
    }
    if("role" in (b||{})){
      const role=String(b.role||"").toLowerCase();
      if(!["agent","admin"].includes(role))return json(request,{error:"Role Agent ya Admin hona chahiye."},400);
      sets.push("role=?");args.push(role);changes.push("role");
    }
    if(typeof b?.active==="boolean"){
      sets.push("active=?");args.push(b.active?1:0);changes.push("status");
      if(!b.active)await env.DB.prepare("DELETE FROM sessions WHERE agent_id=?").bind(id).run();
    }
    if(b?.password!==undefined&&String(b.password).length){
      const pw=String(b.password);
      if(pw.length<10)return json(request,{error:"Password kam se kam 10 characters ka hona chahiye."},400);
      sets.push("password_hash=?","must_change_password=1");args.push(await hashPassword(pw));changes.push("password");
      await env.DB.prepare("DELETE FROM sessions WHERE agent_id=?").bind(id).run();
    }
    if(!sets.length)return json(request,{error:"Update ke liye valid fields nahi mili."},400);
    args.push(id);await env.DB.prepare("UPDATE agents SET "+sets.join(",")+" WHERE id=?").bind(...args).run();
    await audit(env,user,"account_updated","Updated "+changes.join(", ")+": "+target.employee_id);
    return json(request,{success:true,updated:changes});
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
      const weekly=await handleWeeklyData(request,env);
      if(weekly)return weekly;
      const hd=await handleHelpdesk(request,env);
      if(hd)return hd;
      return json(request,{error:"Not found"},404);
    } catch(e) {
      const status=Number(e?.status)||500;
      if(status>=500) {
        const url=new URL(request.url);
        console.error("[API_FAILURE]", JSON.stringify({
          method: request.method,
          path: url.pathname,
          status,
          message: String(e?.message || e || "Unknown error"),
          stack: e?.stack || null
        }));
      }
      return json(request,{error:status===500?"Server error. Please try again.":e.message},status);
    }
  }
};
