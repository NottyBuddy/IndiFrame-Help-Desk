const $=id=>document.getElementById(id), api=window.IndiFrameAPI;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function msg(t,error=false){$("message").textContent=t;$("message").className="sa-msg"+(error?" error":"")}
async function request(path,options){return api.apiRequest(path,options)}
async function loadAnalytics(){
 const host=$("analyticsGrid"),status=$("analyticsStatus");if(!host)return;
 status.textContent="Refreshing live metrics…";
 const sources=[
  {name:"Agents",path:"/api/admin/agents"},
  {name:"KPI",path:"/api/hd/kpis/summary"},
  {name:"Quiz",path:"/api/quiz-attempts"},
  {name:"Attendance",path:"/api/hd/attendance/history"},
  {name:"Breaks",path:"/api/hd/admin/breaks/status"},
  {name:"Call Performance",path:"/api/hd/admin/call-performance/summary"}
 ];
 const jobs=await Promise.allSettled(sources.map(x=>request(x.path)));
 const data=i=>jobs[i].status==="fulfilled"?jobs[i].value:null;
 const agents=data(0)?.agents||[],kpi=data(1)?.totals||{},quiz=data(2)?.attempts||[];
 const attendance=data(3)?.records||[],breakData=data(4)||{},breaks=breakData.breaks||[];
 const calls=data(5)?.totals||{};
 const active=agents.filter(a=>Number(a.active)===1);
 const today=new Date();
 const localToday=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
 const checked=attendance.filter(a=>String(a.workDate||a.work_date||"").slice(0,10)===localToday&&!(a.checkOutAt||a.check_out_at));
 const activeBreaks=Array.isArray(breakData.activeBreaks)?breakData.activeBreaks:breaks.filter(b=>!b.ended_at);
 const quizScore=quiz.reduce((n,a)=>n+Number(a.score||0),0);
 const quizTotal=quiz.reduce((n,a)=>n+Number(a.totalQuestions||a.total_questions||a.total||0),0);
 const avg=quizTotal?(quizScore/quizTotal*100).toFixed(1)+"%":"—";
 const metric=(index,value)=>jobs[index].status==="fulfilled"?value:"—";
 const stats=[
  ["Active agents",metric(0,active.length),"of "+(jobs[0].status==="fulfilled"?agents.length:"—")+" registered"],
  ["Checked in now",metric(3,checked.length),"from website attendance records"],
  ["Active breaks",metric(4,activeBreaks.length),"currently running"],
  ["KPI attempts",metric(1,Number(kpi.attempts||0).toLocaleString()),"daily KPI records"],
  ["Quiz attempts",metric(2,quiz.length.toLocaleString()),"all weeks"],
  ["Quiz average",metric(2,avg),"score percentage"],
  ["Call records",metric(5,Number(calls.calls||0).toLocaleString()),"imported call rows"]
 ];
 host.innerHTML=stats.map(x=>'<article class="sa-stat"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></article>').join("");
 const failed=jobs.map((x,i)=>x.status==="rejected"?sources[i].name:null).filter(Boolean);
 status.textContent=failed.length
  ?"Some analytics sources are unavailable: "+failed.join(", ")+". Unavailable metrics are shown as —, not zero."
  :"All 6 analytics sources refreshed successfully.";
}
async function load(){
 try{
  const me=await request("/api/me"),u=me.user||me;
  if(!u.isSuperAdmin){msg("Is page ke liye Super Admin permission required hai.",true);setTimeout(()=>location.replace("dashboard.html"),1000);return}
  $("profile").textContent=(u.fullName||u.employeeId)+" · Super Admin";
  const data=await request("/api/superadmin/agents"),rows=data.agents||[];
  $("accountList").innerHTML=rows.length?'<div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>Employee</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+rows.map(a=>'<tr><td><strong>'+esc(a.fullName)+'</strong><br><span class="muted">'+esc(a.employeeId)+'</span></td><td>'+esc(a.role)+'</td><td>'+(Number(a.active)===1?'<span class="sa-status active">Active</span>':'<span class="sa-status inactive">Inactive</span>')+'</td><td><div class="sa-actions">'+(Number(a.isSuperAdmin)===1?'<span class="muted">Protected Super Admin</span>':'<button class="sa-small" data-edit="'+a.id+'">Edit</button><button class="sa-small" data-toggle="'+a.id+'" data-active="'+a.active+'">'+(Number(a.active)===1?"Inactive":"Activate")+'</button><button class="sa-small" data-password="'+a.id+'">Reset Password</button><button class="sa-small sa-danger" data-delete="'+a.id+'">Permanent Delete</button>')+'</div></td></tr>').join("")+'</tbody></table></div>':'<div class="empty">Abhi koi employee account nahi mila.</div>';
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
  if(b.dataset.edit){
   const row=(await request("/api/superadmin/agents")).agents.find(a=>String(a.id)===String(b.dataset.edit));if(!row)return;
   $("editAccountId").value=row.id;$("editEmployeeId").value=row.employeeId;$("editFullName").value=row.fullName;$("editRole").value=row.role;
   $("accountEditDialog").showModal();return;
  }
  if(b.dataset.toggle){const active=Number(b.dataset.active)===1;await request("/api/superadmin/agents/"+b.dataset.toggle,{method:"PUT",body:JSON.stringify({active:!active})});msg(active?"Account set to Inactive; active sessions revoked.":"Account activated.");}
  if(b.dataset.password){const password=prompt("Naya temporary password enter karein (minimum 10 characters):");if(password===null)return;if(password.length<10){msg("Password minimum 10 characters ka hona chahiye.",true);return}await request("/api/superadmin/agents/"+b.dataset.password,{method:"PUT",body:JSON.stringify({password})});msg("Password reset ho gaya. Existing sessions revoked; next login par password change required.");}
  if(b.dataset.delete){const id=b.dataset.delete;if(!confirm("PERMANENT DELETE: Is employee account ko permanently delete karna hai? Ye action undo nahi ho sakta. Account sessions, linked break/ACW history aur quiz attempts permanently delete honge. Attendance/KPI aur audit history preserve rahegi."))return;await request("/api/superadmin/agents/"+id,{method:"DELETE"});msg("Account permanently deleted.");}
  await load();
 }catch(err){msg(err.message,true)}
});

$("accountEditForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget,id=$("editAccountId").value,body={employeeId:$("editEmployeeId").value.trim(),fullName:$("editFullName").value.trim(),role:$("editRole").value},btn=f.querySelector("button[type=submit]");
 btn.disabled=true;try{await request("/api/superadmin/agents/"+id,{method:"PUT",body:JSON.stringify(body)});$("accountEditDialog").close();msg("Account profile updated.");await load()}catch(err){msg(err.message,true)}finally{btn.disabled=false}
});
$("cancelAccountEdit").onclick=()=>$("accountEditDialog").close();
$("refreshBtn").onclick=load;
$("analyticsRefresh")?.addEventListener("click",loadAnalytics);
$("logoutBtn").onclick=()=>{api.clearToken();location.replace("index.html")};
document.addEventListener("DOMContentLoaded",load);
