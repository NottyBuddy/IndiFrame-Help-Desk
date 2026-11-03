(() => {
const $=id=>document.getElementById(id),api=window.IndiFrameAPI;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let stagedCallRows=[],stagedCallSections=[],stagedCallFile="",callDryRun=false;
const norm=v=>String(v??"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
function dateValue(v){if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);if(typeof v==="number"&&window.XLSX)return window.XLSX.SSF.format("yyyy-mm-dd",v);let s=String(v??"").trim(),m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);if(m)return(m[3].length===2?"20"+m[3]:m[3])+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s;}
function callMsg(t,error=false){$("callPerformanceStatus").textContent=t;$("callPerformanceStatus").className="sa-msg"+(error?" error":"");}
function parseCallSheet(sheet){
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true});
 const dateNames=["date","report date","call date","activity date","created date","created on","call start date"];
 const agentNames=["employee id","employee code","employee","employee name","agent id","agent name","agent full name","agent","caller id","caller name","caller","caller full name","owner"];
 const hi=rows.findIndex(r=>{const h=r.map(norm);return h.some(x=>dateNames.includes(x))&&h.some(x=>agentNames.includes(x));});
 if(hi<0)throw Error("Date aur Agent columns nahi mile.");
 const headers=rows[hi].map((v,i)=>String(v??"").trim()||("Column "+(i+1))),h=rows[hi].map(norm),di=h.findIndex(x=>dateNames.includes(x)),ai=h.findIndex(x=>agentNames.includes(x));
 const daily=rows.slice(hi+1).map(r=>{const d=dateValue(r[di]),name=String(r[ai]??"").trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!name||/^grand total$/i.test(name))return null;const o={};headers.forEach((k,i)=>{if(norm(k)==="req filed")return;let v=r[i];if(v instanceof Date)v=v.toISOString().slice(0,10);o[k]=v===undefined?"":v;});o.__call_performance_date=d;o.__call_performance_agent=name;return o;}).filter(Boolean);
 const reportRows=[];
 const push=(type,employeeName,reportDate,label,data)=>reportRows.push({type,employeeName:employeeName||"",reportDate:reportDate||"",label:label||"",data});
 // Overall date summary block: Date + Total Calls, without Agent column.
 const overallHeader=rows.findIndex(r=>{const h=r.map(norm);return h.includes("date")&&h.includes("total calls")&&!h.some(x=>agentNames.includes(x));});
 if(overallHeader>=0){const hs=rows[overallHeader].map((v,i)=>String(v??"").trim()||("Column "+(i+1)));for(let i=overallHeader+1;i<rows.length;i++){const r=rows[i],date=dateValue(r[0]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))break;const data={};hs.forEach((k,j)=>data[k]=r[j]??"");push("team_day", "",date,"",data);}}
 // Agent summary block.
 const agentHeader=rows.findIndex(r=>{const h=r.map(norm);return h.includes("agent")&&h.includes("raw agent key")&&h.includes("total calls");});
 if(agentHeader>=0){const hs=rows[agentHeader].map((v,i)=>String(v??"").trim()||("Column "+(i+1)));for(let i=agentHeader+1;i<rows.length;i++){const r=rows[i],name=String(r[0]??"").trim();if(!name)break;if(norm(name)==="grand total")break;const data={};hs.forEach((k,j)=>data[k]=r[j]??"");push("team_agent",name,"","",data);}}
 // Agent-wise disposition summary.
 const dispHeader=rows.findIndex(r=>norm(r[0])==="disposition"&&r.slice(1).some(v=>/mahesh|javeed/i.test(String(v))));
 if(dispHeader>=0){const hs=rows[dispHeader].map((v,i)=>String(v??"").trim()||("Column "+(i+1)));for(let i=dispHeader+1;i<rows.length;i++){const r=rows[i],label=String(r[0]??"").trim();if(!label)break;const data={};hs.forEach((k,j)=>data[k]=r[j]??"");if(norm(label)==="total")break;for(let j=1;j<hs.length;j++){const person=hs[j];if(norm(person)==="total")continue;push("team_disposition_agent",person,"",label,{Disposition:label,Count:r[j]??0,Total:r[hs.findIndex(x=>norm(x)==="total")]??""});}}}
 // Day-wise disposition matrix, with a date in each record.
 const title=rows.findIndex(r=>r.some(v=>norm(v)==="day wise disposition calls"));
 if(title>=0){const hrow=title+1,hs=rows[hrow].map((v,i)=>String(v??"").trim()||("Column "+(i+1)));for(let i=hrow+1;i<rows.length;i++){const r=rows[i],label=String(r[0]??"").trim();if(!label)break;if(["total calls"].includes(norm(label)))break;for(let j=1;j<hs.length;j++){const date=dateValue(hs[j]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;push("team_day_disposition","",date,label,{Disposition:label,Date:date,Calls:r[j]??0,GrandTotal:r[hs.findIndex(x=>norm(x)==="grand total")]??""});}}}
 return {rows:daily,reportRows};
}
// Expose the pure parser for the Node VM regression harness.
if(typeof window!=="undefined")window.__callPerformanceTestHooks={parseCallSheet};
function showCallPreview(rows){const sample=rows.slice(0,12),keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];$("callPerformancePreview").innerHTML="<p>"+rows.length.toLocaleString()+" rows loaded · showing first "+sample.length+"</p><div class='sa-table-wrap'><table class='sa-table'><thead><tr>"+keys.map(k=>"<th>"+esc(k)+"</th>").join("")+"</tr></thead><tbody>"+sample.map(r=>"<tr>"+keys.map(k=>"<td>"+esc(r[k])+"</td>").join("")+"</tr>").join("")+"</tbody></table></div>";}
$("callPerformanceFile").addEventListener("change",()=>{stagedCallRows=[];callDryRun=false;$("callPerformancePublishBtn").disabled=true;$("callPerformancePreview").innerHTML="";callMsg("");});
$("callPerformanceCheckBtn").addEventListener("click",async()=>{try{const f=$("callPerformanceFile").files[0];if(!f)throw Error("Pehle Call Performance workbook select karein.");if(!window.XLSX)throw Error("Excel reader load nahi hua; page refresh karein.");const wb=XLSX.read(await f.arrayBuffer(),{type:"array",cellDates:true});const parsed=parseCallSheet(wb.Sheets[wb.SheetNames[0]]);stagedCallRows=parsed.rows;stagedCallSections=parsed.reportRows;if(!stagedCallRows.length)throw Error("Data rows nahi mili.");stagedCallFile=f.name;showCallPreview(stagedCallRows);callMsg("Validating all rows…");const r=await api.apiRequest("/api/hd/admin/call-performance/import",{method:"POST",body:JSON.stringify({filename:stagedCallFile,rows:stagedCallRows,report_rows:stagedCallSections,dry_run:true})});callDryRun=true;$("callPerformancePublishBtn").disabled=r.accepted===0&&!(Number(r.reportRows||0)>0&&!r.duplicateFile);callMsg("Validated · New: "+r.accepted+" · Existing/duplicate: "+r.skippedDuplicates+" · Report sections: "+(r.savedReports||0)+" · Invalid: "+r.invalidCount+(r.duplicateFile?" · This file was already imported.":""));if(r.invalidRows?.length)$("callPerformancePreview").insertAdjacentHTML("beforeend","<pre>"+esc(JSON.stringify(r.invalidRows,null,2))+"</pre>");}catch(e){callDryRun=false;$("callPerformancePublishBtn").disabled=true;callMsg(e.message,true);}});
$("callPerformancePublishBtn").addEventListener("click",async()=>{if(!callDryRun||!stagedCallRows.length)return;if(!confirm("Validated Call Performance rows import karne hain? Existing KPI data bilkul touch nahi hoga."))return;const b=$("callPerformancePublishBtn");b.disabled=true;b.textContent="Importing…";try{const r=await api.apiRequest("/api/hd/admin/call-performance/import",{method:"POST",body:JSON.stringify({filename:stagedCallFile,rows:stagedCallRows,report_rows:stagedCallSections,dry_run:false,accept_partial:true})});callMsg("Imported: "+r.saved+" new rows · Duplicate skipped: "+r.skippedDuplicates+" · Invalid: "+r.invalidCount);stagedCallRows=[];callDryRun=false;$("callPerformanceFile").value="";$("callPerformancePreview").innerHTML="";}catch(e){callMsg(e.message,true);}finally{b.textContent="Import Call Performance";b.disabled=true;}});

})();
