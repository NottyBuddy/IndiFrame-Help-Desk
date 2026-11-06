const ORIGIN = "https://nottybuddy.github.io";
const CORS = {"Access-Control-Allow-Origin":ORIGIN,"Vary":"Origin","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...CORS}});
const stamp=()=>new Date().toISOString();
const isDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))&&Number.isFinite(Date.parse(v));
async function sha256(value){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function identity(req,env){const m=(req.headers.get("Authorization")||"").match(/^Bearer (.+)$/);if(!m)return null;const tokenHash=await sha256(m[1]);return env.DB.prepare("SELECT a.id,a.employee_id,a.full_name,a.role,a.is_super_admin FROM sessions s JOIN agents a ON a.id=s.agent_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1").bind(tokenHash,stamp()).first();}
async function audit(env,u,action,detail){await env.DB.prepare("INSERT INTO audit_log(actor,action,detail,created_at) VALUES(?,?,?,?)").bind(u.employee_id,action,detail,stamp()).run();}
export async function handleWeeklyData(req,env){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(!path.startsWith("/api/hd/weekly-data"))return null;
 if(method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 try{
  const u=await identity(req,env);if(!u)return json({error:"Session expired or invalid."},401);
  const sa=Number(u.is_super_admin)===1;
  if(path==="/api/hd/weekly-data/access"&&method==="GET")return json({isSuperAdmin:sa,role:u.role});
  if(!sa)return json({error:"Only Super Admin can access Weekly Data management."},403);
  if(path==="/api/hd/weekly-data/imports"&&method==="GET"){
   const imports=(await env.DB.prepare("SELECT i.id,i.dataset,i.filename,i.imported_by,i.imported_at,i.rows_received,i.rows_inserted,(SELECT COUNT(*) FROM weekly_source_rows r WHERE r.import_id=i.id) row_count FROM weekly_source_imports i ORDER BY i.id DESC LIMIT 200").all()).results;
   return json({imports});
  }
  if(path==="/api/hd/weekly-data/rows"&&method==="GET"){
   const dataset=url.searchParams.get("dataset");if(!["attendance","disposition"].includes(dataset))return json({error:"Invalid dataset."},400);
   const from=url.searchParams.get("from"),to=url.searchParams.get("to");const where=["i.dataset=?"],args=[dataset];
   if(from){if(!isDate(from))return json({error:"Invalid from date."},400);where.push("r.record_date>=?");args.push(from);}
   if(to){if(!isDate(to))return json({error:"Invalid to date."},400);where.push("r.record_date<=?");args.push(to);}
   const rows=(await env.DB.prepare("SELECT r.id,r.import_id,r.row_number,r.record_date,r.agent_name,r.total_calls,r.source_json,i.filename,i.headers_json FROM weekly_source_rows r JOIN weekly_source_imports i ON i.id=r.import_id WHERE "+where.join(" AND ")+" ORDER BY r.record_date DESC,r.id DESC LIMIT 5000").bind(...args).all()).results;
   return json({rows:rows.map(r=>({...r,source:JSON.parse(r.source_json),headers:JSON.parse(r.headers_json)})),count:rows.length});
  }
  if(path==="/api/hd/weekly-data/import"&&method==="POST"){
   const b=await req.json().catch(()=>null);if(!b||!["attendance","disposition"].includes(b.dataset)||!Array.isArray(b.headers)||!Array.isArray(b.rows)||!b.rows.length)return json({error:"Dataset, headers and rows are required."},400);
   if(b.rows.length>5000||b.headers.length>100)return json({error:"Workbook exceeds supported row or column count."},413);
   const filename=String(b.filename||"weekly-upload.xlsx").slice(0,180),fileHash=String(b.fileHash||"");
   if(!/^[a-f0-9]{64}$/i.test(fileHash))return json({error:"File fingerprint missing or invalid."},400);
   const existing=await env.DB.prepare("SELECT id FROM weekly_source_imports WHERE file_hash=?").bind(fileHash).first();
   const headers=b.headers.map(x=>String(x??""));
   const invalid=[],normalized=[];
   for(let i=0;i<b.rows.length;i++){
    const row=b.rows[i];if(!Array.isArray(row)||row.length!==headers.length){invalid.push({row:i+1,reason:"Column count does not match source headers."});continue;}
    const date=String(b.meta?.[i]?.date||"");if(date&&!isDate(date)){invalid.push({row:i+1,reason:"Invalid date value."});continue;}
    const total=b.meta?.[i]?.totalCalls;
    if(b.dataset==="disposition"&&Number.isFinite(Number(total))&&Number(total)!==Number(b.meta?.[i]?.categorySum)){invalid.push({row:i+1,reason:"Disposition category sum does not match Total Calls."});continue;}
    normalized.push({rowNumber:i+1,recordDate:date||null,agentName:String(b.meta?.[i]?.agent||""),totalCalls:Number.isFinite(Number(total))?Number(total):null,sourceJson:JSON.stringify(row)});
   }
   if(b.dryRun!==false)return json({receivedRows:b.rows.length,validRows:normalized.length,invalidRows:invalid,duplicateFile:!!existing,headers});
   if(existing)return json({error:"This exact workbook has already been imported.",duplicateFile:true},409);
   if(invalid.length)return json({error:"Validation failed. No rows were imported.",invalidRows:invalid},422);
   const result=await env.DB.prepare("INSERT INTO weekly_source_imports(dataset,file_hash,filename,imported_by,imported_at,rows_received,rows_inserted,headers_json) VALUES(?,?,?,?,?,?,?,?)").bind(b.dataset,fileHash,filename,u.employee_id,stamp(),b.rows.length,normalized.length,JSON.stringify(headers)).run();
   const importId=result.meta.last_row_id;
   const stmts=normalized.map(r=>env.DB.prepare("INSERT INTO weekly_source_rows(import_id,row_number,record_date,agent_name,total_calls,source_json) VALUES(?,?,?,?,?,?)").bind(importId,r.rowNumber,r.recordDate,r.agentName,r.totalCalls,r.sourceJson));
   for(let i=0;i<stmts.length;i+=80)await env.DB.batch(stmts.slice(i,i+80));
   await audit(env,u,"weekly_data_import",b.dataset+" · "+filename+" · "+normalized.length+" rows · import "+importId);
   return json({success:true,importId,dataset:b.dataset,rowsInserted:normalized.length},201);
  }
  const del=path.match(/^\/api\/hd\/weekly-data\/imports\/(\d+)$/);
  if(del&&method==="DELETE"){
   const id=Number(del[1]);const item=await env.DB.prepare("SELECT id,dataset,filename,rows_inserted FROM weekly_source_imports WHERE id=?").bind(id).first();if(!item)return json({error:"Import not found."},404);
   await env.DB.batch([env.DB.prepare("DELETE FROM weekly_source_rows WHERE import_id=?").bind(id),env.DB.prepare("DELETE FROM weekly_source_imports WHERE id=?").bind(id)]);
   await audit(env,u,"weekly_data_delete",item.dataset+" · "+item.filename+" · "+item.rows_inserted+" rows · import "+id);
   return json({success:true,deletedImportId:id,rowsDeleted:item.rows_inserted});
  }
  return json({error:"Not found."},404);
 }catch(e){console.error("weekly data route",e?.message||e);return json({error:"Weekly Data request failed."},500);}
}