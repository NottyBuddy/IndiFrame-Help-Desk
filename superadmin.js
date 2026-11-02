const $=id=>document.getElementById(id), api=window.IndiFrameAPI;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function msg(t,error=false){$("message").textContent=t;$("message").className="sa-msg"+(error?" error":"")}
async function request(path,options){return api.apiRequest(path,options)}
async function load(){
 try{
  const me=await request("/api/me"),u=me.user||me;
  if(!u.isSuperAdmin){msg("Is page ke liye Super Admin permission required hai.",true);setTimeout(()=>location.replace("dashboard.html"),1000);return}
  $("profile").textContent=(u.fullName||u.employeeId)+" · Super Admin";
  const data=await request("/api/superadmin/agents"),rows=data.agents||[];
  $("accountList").innerHTML=rows.length?'<div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>Employee</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+rows.map(a=>'<tr><td><strong>'+esc(a.fullName)+'</strong><br><span class="muted">'+esc(a.employeeId)+'</span></td><td>'+ (Number(a.active)===1?"Active":"Inactive")+'</td><td><div class="sa-actions">'+(Number(a.isSuperAdmin)===1?'<span class="muted">Protected Super Admin</span>':'<button class="sa-small" data-toggle="'+a.id+'" data-active="'+a.active+'">'+(Number(a.active)===1?"Deactivate":"Activate")+'</button><button class="sa-small" data-password="'+a.id+'">Reset Password</button>')+'</div></td></tr>').join("")+'</tbody></table></div>':'<div class="empty">Abhi koi employee account nahi mila.</div>';
 }catch(e){if(/session|login|unauthor/i.test(e.message)){api.clearToken();location.replace("index.html");return}msg(e.message,true)}
}
$("createForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget,b=Object.fromEntries(new FormData(f).entries()),btn=f.querySelector("button");
 btn.disabled=true;btn.textContent="Creating…";
 try{const r=await request("/api/superadmin/agents",{method:"POST",body:JSON.stringify(b)});msg("Agent account create ho gaya: "+r.employeeId);f.reset();await load()}
 catch(err){msg(err.message,true)}
 finally{btn.disabled=false;btn.textContent="Create Account"}
});
$("accountList").addEventListener("click",async e=>{
 const b=e.target.closest("button");if(!b)return;
 try{
  if(b.dataset.toggle){const active=Number(b.dataset.active)===1;await request("/api/superadmin/agents/"+b.dataset.toggle,{method:"PUT",body:JSON.stringify({active:!active})});msg("Account status update ho gaya.");}
  if(b.dataset.password){const password=prompt("Naya temporary password enter karein (minimum 10 characters):");if(password===null)return;if(password.length<10){msg("Password minimum 10 characters ka hona chahiye.",true);return}await request("/api/superadmin/agents/"+b.dataset.password,{method:"PUT",body:JSON.stringify({password})});msg("Password reset ho gaya. Employee ko securely share karein.");}
  await load();
 }catch(err){msg(err.message,true)}
});
$("refreshBtn").onclick=load;
$("logoutBtn").onclick=()=>{api.clearToken();location.replace("index.html")};
document.addEventListener("DOMContentLoaded",load);
// Super Admin KPI workbook upload
const KPI_NUMS=['assigned_leads','total_attempts','unique_leads','connected_calls','interested','not_interested','follow_ups','callbacks','qualified'];
const KPI_ALIASES={employee_id:['employee id','employee_id','agent id','employee'],report_date:['date','report date','report_date'],disposition:['disposition'],assigned_leads:['assigned leads','assigned_leads'],total_attempts:['total attempts','total_attempts','total calls'],unique_leads:['unique leads','unique_leads'],connected_calls:['connected calls','connected_calls','completed calls'],interested:['interested'],not_interested:['not interested','not_interested'],follow_ups:['follow ups','follow-ups','follow_ups'],callbacks:['callbacks','callback'],qualified:['qualified']};
let stagedKpiRows=[],stagedKpiFile='',kpiDryRun=false;
const kpiNorm=v=>String(v??'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
const kpiDate=v=>{if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);if(typeof v==='number'&&window.XLSX)return window.XLSX.SSF.format('yyyy-mm-dd',v);let s=String(v??'').trim();let m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);if(m)return (m[3].length===2?'20'+m[3]:m[3])+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return s;};
const kpiStatus=(s,err=false)=>{$('kpiUploadStatus').textContent=s;$('kpiUploadStatus').className='sa-msg'+(err?' error':'');};
function parseKpiSheet(sheet){const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});const hi=rows.findIndex(r=>r.some(v=>['employee id','employee_id'].includes(kpiNorm(v))));if(hi<0)throw Error('Employee ID header nahi mila.');const heads=rows[hi].map(kpiNorm),ix={};Object.keys(KPI_ALIASES).forEach(k=>ix[k]=heads.findIndex(h=>KPI_ALIASES[k].includes(h)));if(ix.employee_id<0||ix.report_date<0)throw Error('Employee ID aur Date columns required hain.');return rows.slice(hi+1).map(r=>{let o={employee_id:String(r[ix.employee_id]??'').trim(),report_date:kpiDate(r[ix.report_date]),disposition:ix.disposition<0?'':String(r[ix.disposition]??'').trim()};KPI_NUMS.forEach(k=>o[k]=ix[k]<0?0:Number(String(r[ix[k]]??0).replace(/,/g,'')));return o;}).filter(r=>r.employee_id||r.report_date||r.disposition||KPI_NUMS.some(k=>r[k]));}
function showKpiPreview(rows){let sample=rows.slice(0,15);let cols=['employee_id','report_date','disposition'].concat(KPI_NUMS);$('kpiPreview').innerHTML='<p>'+rows.length+' rows loaded · showing first '+sample.length+'</p><table class="sa-table"><thead><tr>'+cols.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+sample.map(r=>'<tr>'+cols.map(x=>'<td>'+esc(r[x])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
$('kpiFile').addEventListener('change',()=>{stagedKpiRows=[];kpiDryRun=false;$('kpiPublishBtn').disabled=true;$('kpiPreview').innerHTML='';kpiStatus('');});
$('kpiCheckBtn').addEventListener('click',async()=>{try{let f=$('kpiFile').files[0];if(!f)throw Error('Pehle workbook select karein.');if(!window.XLSX)throw Error('Excel reader load nahi hua; page refresh karein.');let wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});stagedKpiRows=parseKpiSheet(wb.Sheets[wb.SheetNames[0]]);if(!stagedKpiRows.length)throw Error('Data rows nahi mili.');stagedKpiFile=f.name;showKpiPreview(stagedKpiRows);kpiStatus('Server validation running…');let r=await request('/api/hd/admin/kpis/import',{method:'POST',body:JSON.stringify({filename:stagedKpiFile,rows:stagedKpiRows,dry_run:true})});kpiDryRun=true;$('kpiPublishBtn').disabled=r.accepted===0;kpiStatus('Validated · New: '+r.accepted+' · Existing: '+r.skippedDuplicates+' · Invalid: '+r.invalidCount);if(r.invalid?.length||r.skippedRows?.length)$('kpiPreview').insertAdjacentHTML('beforeend','<pre>'+esc(JSON.stringify({invalid:r.invalid,skipped:r.skippedRows},null,2))+'</pre>');}catch(e){kpiDryRun=false;$('kpiPublishBtn').disabled=true;kpiStatus(e.message,true);}});
$('kpiPublishBtn').addEventListener('click',async()=>{if(!kpiDryRun||!stagedKpiRows.length)return;if(!confirm('Validated new KPI rows team ke saath publish karne hain? Existing rows overwrite nahi honge.'))return;let b=$('kpiPublishBtn');b.disabled=true;b.textContent='Publishing…';try{let r=await request('/api/hd/admin/kpis/import',{method:'POST',body:JSON.stringify({filename:stagedKpiFile,rows:stagedKpiRows,dry_run:false,accept_partial:true})});kpiStatus('Published: '+r.saved+' new rows. Existing skipped: '+r.skippedDuplicates+' · Invalid: '+r.invalidCount);stagedKpiRows=[];kpiDryRun=false;$('kpiFile').value='';$('kpiPreview').innerHTML='';}catch(e){kpiStatus(e.message,true);}finally{b.textContent='Publish KPI to Team';b.disabled=true;}});
$('kpiTemplateBtn').addEventListener('click',()=>{let rows=[['Employee ID','Date','Disposition','Assigned Leads','Total Attempts','Unique Leads','Connected Calls','Interested','Not Interested','Follow Ups','Callbacks','Qualified'],['EMP001','2026-11-01','Interested',10,15,8,6,3,2,2,1,4]];let csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');let url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));let a=document.createElement('a');a.href=url;a.download='IndiFrame-KPI-Upload-Template.csv';a.click();URL.revokeObjectURL(url);});