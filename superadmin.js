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
  $("accountList").innerHTML=rows.length?'<div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>Employee</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+rows.map(a=>'<tr><td><strong>'+esc(a.fullName)+'</strong><br><span class="muted">'+esc(a.employeeId)+'</span></td><td>'+esc(Number(a.isSuperAdmin)===1?"Super Admin":a.role)+'</td><td>'+ (Number(a.active)===1?"Active":"Inactive")+'</td><td><div class="sa-actions">'+(Number(a.isSuperAdmin)===1?'<span class="muted">Protected account</span>':'<button class="sa-small" data-toggle="'+a.id+'" data-active="'+a.active+'">'+(Number(a.active)===1?"Deactivate":"Activate")+'</button><button class="sa-small" data-role="'+a.id+'" data-current="'+esc(a.role)+'">Change Role</button><button class="sa-small" data-password="'+a.id+'">Reset Password</button>')+'</div></td></tr>').join("")+'</tbody></table></div>':'<div class="empty">Abhi koi employee account nahi mila.</div>';
 }catch(e){if(/session|login|unauthor/i.test(e.message)){api.clearToken();location.replace("index.html");return}msg(e.message,true)}
}
$("createForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget,b=Object.fromEntries(new FormData(f).entries()),btn=f.querySelector("button");
 btn.disabled=true;btn.textContent="Creating…";
 try{const r=await request("/api/superadmin/agents",{method:"POST",body:JSON.stringify(b)});msg("Account create ho gaya: "+r.employeeId);f.reset();await load()}
 catch(err){msg(err.message,true)}
 finally{btn.disabled=false;btn.textContent="Create Account"}
});
$("accountList").addEventListener("click",async e=>{
 const b=e.target.closest("button");if(!b)return;
 try{
  if(b.dataset.toggle){const active=Number(b.dataset.active)===1;await request("/api/superadmin/agents/"+b.dataset.toggle,{method:"PUT",body:JSON.stringify({active:!active})});msg("Account status update ho gaya.");}
  if(b.dataset.role){const role=b.dataset.current==="admin"?"agent":"admin";if(!confirm("Is employee ka role "+role+" karna hai?"))return;await request("/api/superadmin/agents/"+b.dataset.role,{method:"PUT",body:JSON.stringify({role})});msg("Employee role update ho gaya.");}
  if(b.dataset.password){const password=prompt("Naya temporary password enter karein (minimum 10 characters):");if(password===null)return;if(password.length<10){msg("Password minimum 10 characters ka hona chahiye.",true);return}await request("/api/superadmin/agents/"+b.dataset.password,{method:"PUT",body:JSON.stringify({password})});msg("Password reset ho gaya. Employee ko securely share karein.");}
  await load();
 }catch(err){msg(err.message,true)}
});
$("refreshBtn").onclick=load;
$("logoutBtn").onclick=()=>{api.clearToken();location.replace("index.html")};
document.addEventListener("DOMContentLoaded",load);