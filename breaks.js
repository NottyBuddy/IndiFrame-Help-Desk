const $=id=>document.getElementById(id),api=window.IndiFrameAPI;let activeBreak=null,serverOffset=0,ticker=null,refreshTimer=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function message(t,error=false){$("message").textContent=t;$("message").className="break-message"+(error?" error":"")}
function duration(sec){sec=Math.max(0,Math.floor(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":")}
function fmt(v){if(!v)return"—";const d=new Date(v);return isNaN(d)?v:d.toLocaleString()}
function renderOwn(){
 const on=!!activeBreak;$("breakStatus").textContent=on?("Active: "+activeBreak.break_type+" · Started "+fmt(activeBreak.started_at)):"Abhi koi active break nahi hai.";
 $("breakStatePill").textContent=on?"ON BREAK":"WORKING";$("breakStatePill").classList.toggle("is-active",on);
 $("startBreak").disabled=on;$("breakType").disabled=on;$("endBreak").disabled=!on;
 $("elapsed").textContent=on?duration((Date.now()+serverOffset-new Date(activeBreak.started_at).getTime())/1000):"00:00:00";
}
async function load(){
 try{
  const me=await api.apiRequest("/api/me"),u=me.user||me;
  if(String(u.role||"").toLowerCase()==="admin"){location.replace("dashboard.html?view=admin");return;}
  $("profile").textContent=(u.fullName||u.employeeId)+" · "+u.role;
  const own=await api.apiRequest("/api/hd/breaks/status");
  activeBreak=own.active;serverOffset=Date.now()-Date.parse(own.serverTime||new Date().toISOString());renderOwn();
  const historyRows=own.history||[],now=new Date(),todayKey=now.toDateString(),weekStart=new Date(now);weekStart.setHours(0,0,0,0);weekStart.setDate(weekStart.getDate()-(weekStart.getDay()+6)%7);
  const seconds=x=>Number(x.duration_seconds??x.durationSeconds??(x.ended_at?Math.max(0,(Date.parse(x.ended_at)-Date.parse(x.started_at))/1000):activeBreak&&x===activeBreak?(Date.now()+serverOffset-Date.parse(x.started_at))/1000:0))||0;
  const todayRows=historyRows.filter(x=>new Date(x.started_at).toDateString()===todayKey),weekRows=historyRows.filter(x=>new Date(x.started_at)>=weekStart);
  $("breakTodayCount").textContent=todayRows.length+(activeBreak&&new Date(activeBreak.started_at).toDateString()===todayKey&&!todayRows.includes(activeBreak)?1:0);
  $("breakTodayDuration").textContent=duration(todayRows.reduce((a,x)=>a+seconds(x),0)+(activeBreak&&new Date(activeBreak.started_at).toDateString()===todayKey?seconds(activeBreak):0));
  $("breakWeekDuration").textContent=duration(weekRows.reduce((a,x)=>a+seconds(x),0)+(activeBreak&&new Date(activeBreak.started_at)>=weekStart?seconds(activeBreak):0));
  $("breakLastTime").textContent=historyRows.length?new Date(historyRows[0].started_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):activeBreak?new Date(activeBreak.started_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"—";
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
document.addEventListener("DOMContentLoaded",()=>{load();ticker=setInterval(renderOwn,1000);refreshTimer=setInterval(load,30000)});
