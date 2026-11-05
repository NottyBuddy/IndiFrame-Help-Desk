const $=id=>document.getElementById(id), api=window.IndiFrameAPI;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function msg(t,error=false){$("message").textContent=t;$("message").className="sa-msg"+(error?" error":"")}
async function request(path,options){return api.apiRequest(path,options)}
async function loadAnalytics(){
 const host=$("analyticsGrid"),status=$("analyticsStatus");if(!host)return;
 status.textContent="Refreshing live metrics…";
 const paths=["/api/admin/agents","/api/hd/kpis/summary","/api/quiz-attempts","/api/hd/attendance/history","/api/hd/admin/breaks/status","/api/hd/projects?limit=100","/api/hd/admin/call-performance/summary"];
 const jobs=await Promise.allSettled(paths.map(p=>request(p))),v=i=>jobs[i].status==="fulfilled"?jobs[i].value:null;
 const agents=v(0)?.agents||[],kpi=v(1)?.totals||{},quiz=v(2)?.attempts||[],attendance=v(3)?.records||[],breaks=v(4)?.breaks||[],projects=v(5)?.projects||[],calls=v(6)?.totals||{};
 const active=agents.filter(a=>Number(a.active)===1),checked=attendance.filter(a=>!a.checkOutAt),activeBreaks=breaks.filter(b=>!b.ended_at);
 const quizScore=quiz.reduce((n,a)=>n+Number(a.score||0),0),quizTotal=quiz.reduce((n,a)=>n+Number(a.totalQuestions||a.total_questions||0),0);
 const avg=quizTotal?(quizScore/quizTotal*100).toFixed(1)+"%":"—";
 const stats=[["Active agents",active.length,"of "+agents.length+" registered"],["Checked in now",checked.length,"from attendance records"],["Active breaks",activeBreaks.length,"currently running"],["KPI attempts",Number(kpi.attempts||0).toLocaleString(),"daily KPI records"],["Quiz attempts",quiz.length.toLocaleString(),"all weeks"],["Quiz average",avg,"score percentage"],["Projects",projects.length.toLocaleString(),"active pipeline records"],["Call records",Number(calls.calls||0).toLocaleString(),"imported call rows"]];
 host.innerHTML=stats.map(x=>'<article class="sa-stat"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></article>').join("");
 const failed=jobs.map((x,i)=>x.status==="rejected"?["Agents","KPI","Quiz","Attendance","Breaks","Projects","Call Performance"][i]:null).filter(Boolean);
 status.textContent=failed.length?"Some data sources could not load: "+failed.join(", ")+".":"All available analytics sources refreshed successfully.";
}
async function load(){
 try{
  const me=await request("/api/me"),u=me.user||me;
  if(!u.isSuperAdmin){msg("Is page ke liye Super Admin permission required hai.",true);setTimeout(()=>location.replace("dashboard.html"),1000);return}
  $("profile").textContent=(u.fullName||u.employeeId)+" · Super Admin";
  const data=await request("/api/superadmin/agents"),rows=data.agents||[];
  $("accountList").innerHTML=rows.length?'<div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>Employee</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+rows.map(a=>'<tr><td><strong>'+esc(a.fullName)+'</strong><br><span class="muted">'+esc(a.employeeId)+'</span></td><td>'+ (Number(a.active)===1?"Active":"Inactive")+'</td><td><div class="sa-actions">'+(Number(a.isSuperAdmin)===1?'<span class="muted">Protected Super Admin</span>':'<button class="sa-small" data-toggle="'+a.id+'" data-active="'+a.active+'">'+(Number(a.active)===1?"Deactivate":"Activate")+'</button><button class="sa-small" data-password="'+a.id+'">Reset Password</button>')+'</div></td></tr>').join("")+'</tbody></table></div>':'<div class="empty">Abhi koi employee account nahi mila.</div>';
 await loadAnalytics();
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
$("analyticsRefresh")?.addEventListener("click",loadAnalytics);
$("logoutBtn").onclick=()=>{api.clearToken();location.replace("index.html")};
document.addEventListener("DOMContentLoaded",load);
