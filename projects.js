/* Project workspace. All authorization and record scoping are enforced by the Worker. */
const $ = id => document.getElementById(id);
const api = window.IndiFrameAPI;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let searchTimer;
function message(text, error=false){ const el=$("projectMessage"); el.textContent=text; el.className="project-message"+(error?" error":""); }
function formatDate(v){ if(!v) return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?v:d.toLocaleString(); }
async function loadProjects(){
  const q=$("projectSearch").value.trim(), status=$("projectStatus").value;
  const params=new URLSearchParams(); if(q)params.set("q",q); if(status)params.set("status",status);
  $("projectList").textContent="Loading projects…";
  try{
    const data=await api.apiRequest("/api/hd/projects?"+params.toString());
    const rows=Array.isArray(data.projects)?data.projects:[];
    if(!rows.length){ $("projectList").innerHTML='<div class="empty">No project records found. Create a project using the form. No demo records are shown.</div>'; return; }
    $("projectList").innerHTML='<div class="project-table-wrap"><table class="project-table"><thead><tr><th>Project / Customer</th><th>Contact</th><th>Location</th><th>Status</th><th>Assigned to</th><th>Next follow-up</th></tr></thead><tbody>'+
      rows.map(p=>'<tr><td><span class="project-code">'+esc(p.project_code)+'</span><br>'+esc(p.customer_name)+'</td><td>'+esc(p.customer_phone)+'</td><td>'+esc([p.city,p.state,p.pincode].filter(Boolean).join(", ")||"—")+'</td><td><span class="project-status">'+esc(p.status)+'</span></td><td>'+esc(p.assigned_employee_name||p.assigned_employee_id||"Unassigned")+'</td><td>'+esc(formatDate(p.next_follow_up_at))+'</td></tr>').join("")+
      '</tbody></table></div>';
    message(rows.length+" project record(s) loaded from the server.");
  }catch(e){ $("projectList").textContent="Project service is not available yet. "+e.message; message(e.message,true); }
}
async function init(){
  if(!api || !api.getToken()){ location.replace("index.html"); return; }
  $("logoutBtn").addEventListener("click",()=>{api.clearToken();location.replace("index.html");});
  try{
    const me=await api.apiRequest("/api/me"), user=me.user||me;
    $("profile").textContent=(user.fullName||user.full_name||user.employeeId||user.employee_id||"Employee")+" · "+(user.role||"agent");
    await loadProjects();
  }catch(e){api.clearToken();location.replace("index.html");return;}
  $("refreshProjects").addEventListener("click",loadProjects);
  $("projectStatus").addEventListener("change",loadProjects);
  $("projectSearch").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadProjects,250);});
  $("projectForm").addEventListener("submit",async ev=>{
    ev.preventDefault(); const form=ev.currentTarget, data=Object.fromEntries(new FormData(form).entries());
    if(data.next_follow_up_at) data.next_follow_up_at=new Date(data.next_follow_up_at).toISOString(); else delete data.next_follow_up_at;
    for(const k of Object.keys(data)) if(data[k]==="") data[k]=null;
    const submit=form.querySelector('button[type="submit"]'); submit.disabled=true; submit.textContent="Saving…";
    try{
      const result=await api.apiRequest("/api/hd/projects",{method:"POST",body:JSON.stringify(data)});
      form.reset(); message("Project saved: "+result.projectCode); await loadProjects();
    }catch(e){message(e.message,true);}
    finally{submit.disabled=false;submit.textContent="Save Project";}
  });
}
document.addEventListener("DOMContentLoaded",init);