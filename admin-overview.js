(() => {
"use strict";
const $=id=>document.getElementById(id),api=window.IndiFrameAPI;
if(!api||!api.apiRequest)return;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=v=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>iso(new Date());
const aliases={
 name:["Agent Name","Employee Name","Caller Name","Agent","Caller","Employee"],
 id:["Employee ID","Employee Code","Agent ID","Caller ID"],
 calls:["Total Calls","Calls","Total Outgoing Calls + Incoming Calls","Total Call Count"],
 connected:["Connected Calls","Connect Calls","Total Connected Calls","Answered Calls"],
 incoming:["Incoming","Incoming Calls","Total Incoming Calls"],
 outgoing:["Outgoing","Outgoing Calls","Total Outgoing Calls"],
 inConnected:["Incoming Connected","Incoming Connected Calls"],
 outConnected:["Outgoing Connected","Outgoing Connected Calls"],
 inMissed:["Incoming Missed","Missed Incoming","Incoming Not Connected","Incoming Not Answered"],
 outMissed:["Outgoing Not Connected","Outgoing Missed","Outgoing Not Answered"]
};
let agents=[],rawRows=[],attendance=[],breaks=[],uniqueRows=[],selectedAgent="",lastRefresh=null;
function field(source,names){const wanted=names.map(norm);for(const [k,v] of Object.entries(source||{})){if(wanted.includes(norm(k))&&v!==""&&v!==null&&v!==undefined)return v;}return null;}
function num(v){if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(/[,% ]/g,""));return Number.isFinite(n)?n:null;}
function dateOf(v){const s=String(v??"").slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:"";}
function resolve(row){
 const s=row.source||{},name=String(row.employeeName||field(s,aliases.name)||"").trim(),id=String(row.employeeId||field(s,aliases.id)||"").trim();
 const sameName=name?agents.filter(a=>norm(a.fullName)===norm(name)):[];
 if(sameName.length===1){
  const a=sameName[0];
  if(id&&String(a.employeeId).toLowerCase()!==id.toLowerCase())return{key:"review:"+norm(name)+":"+id,name,id,matched:false,reason:"Name and Employee ID mismatch"};
  return{key:String(a.employeeId),name:a.fullName||name,id:a.employeeId,matched:true};
 }
 if(sameName.length>1&&id){const a=sameName.find(x=>String(x.employeeId).toLowerCase()===id.toLowerCase());if(a)return{key:String(a.employeeId),name:a.fullName||name,id:a.employeeId,matched:true};}
 if(id){const a=agents.find(x=>String(x.employeeId).toLowerCase()===id.toLowerCase());if(a&&sameName.length===0)return{key:String(a.employeeId),name:a.fullName||name,id:a.employeeId,matched:true};}
 return{key:"review:"+norm(name)+":"+id,name:name||"Unmatched agent",id,matched:false,reason:sameName.length>1?"Duplicate name; ID required":"No exact agent match"};
}
function completeness(r){const s=r.source||{};return Object.values(s).filter(v=>v!==""&&v!==null&&v!==undefined).length+(r.disposition?1:0);}
function dedupe(rows){
 const map=new Map();let duplicateCount=0;
 for(const r of rows){const date=dateOf(r.reportDate),agent=resolve(r);if(!date||!agent.key)continue;const key=date+"|"+agent.key,entry={...r,date,agent,source:r.source||{}};
  if(map.has(key)){duplicateCount++;if(completeness(entry)>completeness(map.get(key)))map.set(key,entry);}else map.set(key,entry);
 }
 return{rows:[...map.values()],duplicateCount};
}
function period(kind){const d=new Date(),t=new Date(d.getFullYear(),d.getMonth(),d.getDate());if(kind==="today")return[today(),today()];if(kind==="week"){const a=new Date(t);a.setDate(a.getDate()-(a.getDay()+6)%7);return[iso(a),today()];}if(kind==="month")return[iso(new Date(t.getFullYear(),t.getMonth(),1)),today()];return["",""];}
function filterRows(from,to,agentKey=""){return uniqueRows.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)&&(!agentKey||r.agent.key===agentKey));}
function aggregate(rows){
 const sums={calls:0,connected:0,incoming:0,outgoing:0,inConnected:0,outConnected:0,inMissed:0,outMissed:0};
 const known={};Object.keys(sums).forEach(k=>known[k]=false);
 for(const r of rows){const s=r.source;for(const k of Object.keys(sums)){const v=num(field(s,aliases[k]||[]));if(v!==null){sums[k]+=v;known[k]=true;}}}
 if(!known.calls&&known.incoming&&known.outgoing){sums.calls=sums.incoming+sums.outgoing;known.calls=true;}
 if(!known.connected&&known.inConnected&&known.outConnected){sums.connected=sums.inConnected+sums.outConnected;known.connected=true;}
 return{sums,known,rate:known.calls&&known.connected&&sums.calls>0?sums.connected/sums.calls*100:null};
}
function set(id,value){const e=$(id);if(e)e.textContent=value;}
function renderPeriod(prefix,kind){
 const [from,to]=period(kind),a=aggregate(filterRows(from,to));
 set(prefix+"Calls",a.known.calls?a.sums.calls.toLocaleString():"—");
 set(prefix+"Connected",a.known.connected?a.sums.connected.toLocaleString():"—");
 set(prefix+"Rate",a.rate===null?"—":a.rate.toFixed(1)+"%");
}
function renderFixed(){renderPeriod("admToday","today");renderPeriod("admWeek","week");renderPeriod("admMonth","month");}
function renderAttendanceAndBreaks(){
 const d=today(),todayRows=attendance.filter(x=>dateOf(x.workDate||x.work_date)===d);
 const present=new Set(todayRows.filter(x=>x.checkInAt||x.check_in_at).map(x=>String(x.employeeId||x.employee_id))).size;
 const activeBreaks=breaks.filter(x=>!x.ended_at);
 set("admPresent",String(present));set("admOnBreak",String(new Set(activeBreaks.map(x=>String(x.employee_id))).size));
 const byId=new Map(todayRows.map(x=>[String(x.employeeId||x.employee_id),x]));
 const breakById=new Map(activeBreaks.map(x=>[String(x.employee_id),x]));
 const team=agents.filter(a=>!["admin","superadmin","super_admin"].includes(String(a.role||"").toLowerCase()));
 const html=team.map(a=>{
  const id=String(a.employeeId||a.employee_id||""),att=byId.get(id),br=breakById.get(id),active=!!att&&!(att.checkOutAt||att.check_out_at);
  const status=br?"On Break":active?"Working":"Checked Out";
  const login=att?(att.checkInAt||att.check_in_at):null;
  const duration=br?Math.max(0,Math.floor(Number(br.elapsedSeconds||0)/60))+" min":"—";
  return '<tr class="adm-agent-row" tabindex="0" role="button" data-agent-key="'+esc(id)+'" data-agent-name="'+esc(a.fullName||a.full_name||id)+'"><td><strong>'+esc(a.fullName||a.full_name||"—")+'</strong></td><td>'+esc(id)+'</td><td>'+ (login?esc(new Date(login).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})):"—")+'</td><td><span class="adm-status '+(br?"break":active?"working":"out")+'">'+status+'</span></td><td>'+duration+'</td></tr>';
 }).join("");
 $("admLiveAgents").innerHTML=html?'<div class="adm-table-scroll"><table class="adm-table"><thead><tr><th>Agent name</th><th>Employee ID</th><th>Login time</th><th>Current status</th><th>Break duration</th></tr></thead><tbody>'+html+'</tbody></table></div>':'<div class="adm-empty">No agent accounts found.</div>';
}
function renderDispositions(rows){
 const counts=new Map();for(const r of rows){const d=String(r.disposition||field(r.source,["Disposition","Call Disposition","Call Status","Result"])||"").trim();if(d)counts.set(d,(counts.get(d)||0)+1);}
 const list=[...counts.entries()].sort((a,b)=>b[1]-a[1]),max=Math.max(1,...list.map(x=>x[1]));
 $("admDispositionChart").innerHTML=list.length?list.map(([name,n])=>'<div class="adm-bar-row"><span title="'+esc(name)+'">'+esc(name)+'</span><div class="adm-bar-track"><i style="width:'+Math.max(1,n/max*100)+'%"></i></div><strong>'+n.toLocaleString()+'</strong></div>').join(""):'<div class="adm-empty">No disposition values are available in the published data.</div>';
}
function metricValue(rows,key){const a=aggregate(rows),v=key==="incoming"?a.sums.incoming:key==="outgoing"?a.sums.outgoing:key==="inConnected"?a.sums.inConnected:key==="outConnected"?a.sums.outConnected:key==="inMissed"?a.sums.inMissed:a.sums.outMissed;return a.known[key]?v.toLocaleString():"Not provided";}
function renderDirection(rows){
 $("admIncoming").textContent=metricValue(rows,"incoming");$("admIncomingConnected").textContent=metricValue(rows,"inConnected");$("admIncomingMissed").textContent=metricValue(rows,"inMissed");
 $("admOutgoing").textContent=metricValue(rows,"outgoing");$("admOutgoingConnected").textContent=metricValue(rows,"outConnected");$("admOutgoingMissed").textContent=metricValue(rows,"outMissed");
 const a=aggregate(rows);$("admCombinedCalls").textContent=a.known.calls?a.sums.calls.toLocaleString():"Not provided";$("admCombinedConnected").textContent=a.known.connected?a.sums.connected.toLocaleString():"Not provided";$("admCombinedRate").textContent=a.rate===null?"Not provided":a.rate.toFixed(1)+"%";
}
function renderCustom(){
 const from=$("admCustomFrom").value,to=$("admCustomTo").value;
 if(from&&to&&from>to){set("admCustomStatus","From date cannot be after To date.");return;}
 const rows=filterRows(from,to,selectedAgent),a=aggregate(rows),daily=new Map();
 for(const r of rows){const x=daily.get(r.date)||{calls:0,known:false,rows:0};const n=num(field(r.source,aliases.calls));if(n!==null){x.calls+=n;x.known=true;}x.rows++;daily.set(r.date,x);}
 const days=[...daily.entries()].sort((x,y)=>x[0].localeCompare(y[0]));
 $("admCustomSummary").innerHTML='<div><span>Calls</span><strong>'+(a.known.calls?a.sums.calls.toLocaleString():"Not provided")+'</strong></div><div><span>Connect calls</span><strong>'+(a.known.connected?a.sums.connected.toLocaleString():"Not provided")+'</strong></div><div><span>Connect rate</span><strong>'+(a.rate===null?"Not provided":a.rate.toFixed(1)+"%")+'</strong></div><div><span>Unique agent-date records</span><strong>'+rows.length.toLocaleString()+'</strong></div>';
 $("admCustomTable").innerHTML=days.length?'<div class="adm-table-scroll"><table class="adm-table"><thead><tr><th>Date</th><th>Unique agent-date records</th><th>Total calls</th></tr></thead><tbody>'+days.map(([d,x])=>'<tr><td>'+d+'</td><td>'+x.rows+'</td><td>'+(x.known?x.calls.toLocaleString():"Not provided")+'</td></tr>').join("")+'</tbody></table></div>':'<div class="adm-empty">No published records for this custom range.</div>';
 set("admCustomStatus",rows.length+" unique agent-date records · "+(lastRefresh?"Refreshed "+lastRefresh:""));
}
function bind(){
 $("admCustomApply")?.addEventListener("click",renderCustom);
 $("admCustomReset")?.addEventListener("click",()=>{selectedAgent="";$("admAgentSearch").value="";renderCustom();});
 $("admAgentSearch")?.addEventListener("input",()=>{const q=norm($("admAgentSearch").value);const found=agents.filter(a=>norm(a.fullName||a.full_name).includes(q));selectedAgent=q&&found.length===1?String(found[0].employeeId||found[0].employee_id):"";});
 $("admLiveAgents")?.addEventListener("click",e=>{const row=e.target.closest("[data-agent-key]");if(!row)return;selectedAgent=row.dataset.agentKey;$("admAgentSearch").value=row.dataset.agentName;const now=new Date(),from=new Date(now.getFullYear(),now.getMonth(),1);$("admCustomFrom").value=iso(from);$("admCustomTo").value=today();renderCustom();$("admCustomReport")?.scrollIntoView({behavior:"smooth",block:"start"});});
 $("admLiveAgents")?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){const row=e.target.closest("[data-agent-key]");if(row){e.preventDefault();row.click();}}});
 $("admRefresh")?.addEventListener("click",load);
}
async function load(){
 try{
  set("admDataStatus","Loading verified team and call records…");
  const d=today(),[m,a,c,t,b]=await Promise.all([
   api.apiRequest("/api/me"),
   api.apiRequest("/api/admin/agents"),
   api.apiRequest("/api/hd/admin/call-performance/rows"),
   api.apiRequest("/api/hd/attendance/history?from="+d+"&to="+d),
   api.apiRequest("/api/hd/admin/breaks/status?from="+d+"&to="+d)
  ]);
  const u=m.user||m;if(String(u.role||"").toLowerCase()!=="admin"&&!u.isSuperAdmin){$("adminOverviewNew").hidden=true;return;}
  agents=(a.agents||[]).map(x=>({fullName:x.fullName||x.full_name||"",employeeId:x.employeeId||x.employee_id||"",role:x.role||""}));
  rawRows=c.rows||[];attendance=t.records||[];breaks=b.breaks||[];
  const result=dedupe(rawRows);uniqueRows=result.rows;
  renderFixed();renderAttendanceAndBreaks();renderDispositions(filterRows(...period("today")));renderDirection(filterRows(...period("today")));
  set("admDataStatus",rawRows.length.toLocaleString()+" source rows · "+uniqueRows.length.toLocaleString()+" unique agent-date records · "+result.duplicateCount.toLocaleString()+" repeated agent-date rows excluded.");
  lastRefresh=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
  renderCustom();
 }catch(e){set("admDataStatus","Unable to load one or more Admin overview sources: "+e.message);set("admPresent","—");set("admOnBreak","—");}
}
document.addEventListener("DOMContentLoaded",()=>{if(!$("adminOverviewNew"))return;bind();load();});
})();