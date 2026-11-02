const $=id=>document.getElementById(id),api=window.IndiFrameAPI;
let cpRows=[],cpSummary=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function cpStatus(t,error=false){$("cpStatus").textContent=t||"";$("cpStatus").style.color=error?"#b42318":"";}
function cpQuery(){const p=new URLSearchParams();if($("cpFrom").value)p.set("from",$("cpFrom").value);if($("cpTo").value)p.set("to",$("cpTo").value);if($("cpAgent").value)p.set("employee_id",$("cpAgent").value);return p.toString();}
function cpTable(id,headers,rows){const e=$(id);if(!rows.length){e.innerHTML='<div class="empty">No records found for this filter.</div>';return;}e.innerHTML='<table class="cp-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join("")+'</tr>').join("")+'</tbody></table>';}
function cpRender(){
 const s=cpSummary||{},t=s.totals||{};
 $("cpTotal").textContent=Number(t.calls||0).toLocaleString();
 $("cpAgents").textContent=Number(t.agents||0).toLocaleString();
 $("cpDates").textContent=Number(t.dates||0).toLocaleString();
 $("cpDispositions").textContent=Number(t.dispositions||0).toLocaleString();
 const agents=s.byAgent||[],dates=s.daily||[],disps=s.byDisposition||[];
 const current=$("cpAgent").value,selected=new Set([...$("cpAgent").options].map(o=>o.value));
 for(const a of agents){const key=String(a.employeeId||"");if(key&&!selected.has(key)){const o=document.createElement("option");o.value=key;o.textContent=(a.employeeName||key)+" · "+key;$("cpAgent").appendChild(o);}}
 $("cpAgent").value=current;
 cpTable("cpByAgent",["Agent","Employee ID","Call Records","First Date","Last Date"],agents.map(a=>[a.employeeName||a.employeeId,a.employeeId,a.calls,a.firstDate,a.lastDate]));
 cpTable("cpByDate",["Date","Call Records","Agents"],dates.map(a=>[a.date,a.calls,a.agents]));
 cpTable("cpByDisposition",["Disposition","Call Records"],disps.map(a=>[a.disposition||"(blank)",a.calls]));
 const keys=[];for(const r of cpRows){const src=r.source||{};for(const k of Object.keys(src))if(!keys.includes(k))keys.push(k);}
 const preferred=["reportDate","employeeName","employeeId","disposition"];const columns=[...preferred.filter(k=>keys.includes(k)),...keys.filter(k=>!preferred.includes(k))];
 cpTable("cpRows",["Date","Agent","Disposition",...columns],cpRows.map(r=>[r.reportDate,r.employeeName||r.employeeId,r.disposition,...columns.map(k=>r.source?.[k])]));
}
async function cpLoad(){cpStatus("Loading Call Performance data…");try{const q=cpQuery(),suffix=q?"?"+q:"";const [summary,records]=await Promise.all([api.apiRequest("/api/hd/admin/call-performance/summary"+suffix),api.apiRequest("/api/hd/admin/call-performance/rows"+suffix)]);cpSummary=summary;cpRows=records.rows||[];cpRender();cpStatus(cpRows.length.toLocaleString()+" matching records loaded.");}catch(e){cpStatus(e.message,true);}}
async function cpInit(){try{const me=await api.apiRequest("/api/me"),u=me.user||me;if(String(u.role).toLowerCase()!=="admin"){location.replace("dashboard.html");return;}$("cpProfile").textContent=(u.fullName||u.employeeId)+" · Admin";await cpLoad();}catch(e){cpStatus(e.message,true);if(/session|login|unauthor/i.test(e.message)){api.clearToken();location.replace("index.html");}}}
$("cpApply").addEventListener("click",cpLoad);$("cpReset").addEventListener("click",()=>{$("cpFrom").value="";$("cpTo").value="";$("cpAgent").value="";cpLoad();});
$("cpExport").addEventListener("click",()=>{const keys=[];for(const r of cpRows)for(const k of Object.keys(r.source||{}))if(!keys.includes(k))keys.push(k);const headers=["Date","Agent","Employee ID","Disposition",...keys];const values=cpRows.map(r=>[r.reportDate,r.employeeName||r.employeeId,r.employeeId,r.disposition,...keys.map(k=>r.source?.[k])]);const csv=[headers,...values].map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="IndiFrame_Call_Performance.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$("logoutBtn").addEventListener("click",()=>{api.clearToken();location.replace("index.html");});
document.addEventListener("DOMContentLoaded",cpInit);