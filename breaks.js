const $=id=>document.getElementById(id),api=window.IndiFrameAPI;let activeBreak=null,serverOffset=0,ticker=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function message(t,error=false){$("message").textContent=t;$("message").className="break-message"+(error?" error":"")}
function duration(sec){sec=Math.max(0,Math.floor(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":")}
function fmt(v){if(!v)return"—";const d=new Date(v);return isNaN(d)?v:d.toLocaleString()}
function renderOwn(){
 const on=!!activeBreak;$("breakStatus").textContent=on?("Active: "+activeBreak.break_type+" · Started "+fmt(activeBreak.started_at)):"Abhi koi active break nahi hai.";
 $("startBreak").disabled=on;$("breakType").disabled=on;$("endBreak").disabled=!on;
 $("elapsed").textContent=on?duration((Date.now()+serverOffset-new Date(activeBreak.started_at).getTime())/1000):"00:00:00";
}
async function load(){
 try{
  const me=await api.apiRequest("/api/me"),u=me.user||me;
  $("profile").textContent=(u.fullName||u.employeeId)+" · "+u.role;
  const own=await api.apiRequest("/api/hd/breaks/status");
  activeBreak=own.active;serverOffset=Date.now()-Date.parse(own.serverTime||new Date().toISOString());renderOwn();
  $("history").innerHTML=(own.history||[]).length?'<div style="overflow:auto"><table class="break-list"><thead><tr><th>Type</th><th>Started</th><th>Ended</th><th>Duration</th></tr></thead><tbody>'+(own.history||[]).map(x=>'<tr><td>'+esc(x.break_type)+'</td><td>'+esc(fmt(x.started_at))+'</td><td>'+esc(fmt(x.ended_at))+'</td><td>'+esc(x.duration_seconds==null?"Active":duration(x.duration_seconds))+'</td></tr>').join("")+'</tbody></table></div>':'<div class="empty">Abhi break history available nahi hai.</div>';
  if(String(u.role).toLowerCase()==="admin"){
   $("teamCard").classList.remove("hidden");const team=await api.apiRequest("/api/hd/admin/breaks/status"),rows=team.activeBreaks||[];
   $("teamBreaks").innerHTML=rows.length?'<div style="overflow:auto"><table class="break-list"><thead><tr><th>Employee</th><th>Break</th><th>Started</th><th>Duration</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.full_name)+'<br><span class="muted">'+esc(x.employee_id)+'</span></td><td>'+esc(x.break_type)+'</td><td>'+esc(fmt(x.started_at))+'</td><td>'+duration(x.elapsedSeconds)+'</td></tr>').join("")+'</tbody></table></div>':'<div class="empty">Is waqt koi agent break par nahi hai.</div>';
  }
 }catch(e){if(/session|login|unauthor/i.test(e.message)){api.clearToken();location.replace("index.html");return}message(e.message,true)}
}
$("startBreak").onclick=async()=>{try{await api.apiRequest("/api/hd/breaks/start",{method:"POST",body:JSON.stringify({break_type:$("breakType").value})});message("Break start ho gaya.");await load()}catch(e){message(e.message,true)}};
$("endBreak").onclick=async()=>{try{const r=await api.apiRequest("/api/hd/breaks/end",{method:"POST"});message("Break end ho gaya. Duration: "+duration(r.durationSeconds));await load()}catch(e){message(e.message,true)}};
$("logoutBtn").onclick=()=>{api.clearToken();location.replace("index.html")};
document.addEventListener("DOMContentLoaded",()=>{load();ticker=setInterval(()=>{renderOwn();if(String($("profile").textContent).includes("admin"))load()},1000)});
