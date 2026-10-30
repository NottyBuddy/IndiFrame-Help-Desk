/* Role-aware dashboard. All access control must still be enforced by the Worker. */
const $ = id => document.getElementById(id);
const state={user:null,quizAttempts:[],agents:[],kpis:[]};
function normRole(v){return String(v||'agent').toLowerCase()}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function arr(data,keys=[]){
  if(Array.isArray(data)) return data;
  if(!data || typeof data !== 'object') return [];
  const candidates = [...keys, 'reports', 'kpis', 'results', 'data', 'rows', 'items'];
  for(const k of candidates){ if(Array.isArray(data?.[k])) return data[k]; }
  return [];
}
function parseJsonObject(value, fallback={}){
  if(value === undefined || value === null || value === '') return fallback;
  if(typeof value === 'string'){
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  if(typeof value === 'object') return value;
  return fallback;
}
function normalizeKpiRow(row){
  if(!row || typeof row !== 'object') return {};
  const metrics = parseJsonObject(row.metrics_json ?? row.metricsJson ?? row.metrics ?? row.data ?? {});
  return { ...row, ...metrics, employeeId: row.employeeId ?? row.employee_id ?? metrics.employeeId ?? metrics.employee_id, fullName: row.fullName ?? row.full_name ?? metrics.fullName ?? metrics.full_name };
}
function msg(text,type=''){const el=$('globalStatus');el.textContent=text;el.className='status '+type}
function table(elId,headers,rows,empty='No records found.'){const el=$(elId);if(!rows.length){el.innerHTML=`<div class="empty">${esc(empty)}</div>`;return}el.innerHTML=`<div class="tablewrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function first(obj,keys,fallback='—'){for(const k of keys){if(obj&&obj[k]!==undefined&&obj[k]!==null&&obj[k]!=='')return obj[k]}return fallback}
function setProfile(user){state.user=user||{};const id=first(user,['employeeId','employee_id','id'],'');const name=first(user,['fullName','full_name','name','employeeId','employee_id'],'Employee');const role=first(user,['role','userRole'], 'agent');$('profileName').textContent=name;$('profileId').textContent=id;$('roleBadge').textContent=String(role).toLowerCase()==='admin'?'Admin':'Employee';$('welcomeTitle').textContent='Welcome, '+name;$('welcomeSub').textContent=String(role).toLowerCase()==='admin'?'Team overview and pre-sales performance reports.':'Your pre-sales performance at a glance.';}
function renderKpis(rows){
  const kpis=arr(rows,['kpis','results','data','reports']).map(normalizeKpiRow);
  const calls=kpis.reduce((s,x)=>s+(Number(first(x,['calls','total_calls','totalCalls','callsMade','assigned_leads','assignedLeads'],0))||0),0);
  const qualified=kpis.reduce((s,x)=>s+(Number(first(x,['qualified','qualified_leads','qualifiedLeads'],0))||0),0);
  const connected=kpis.reduce((s,x)=>s+(Number(first(x,['connected_calls','connectedCalls','connected'],0))||0),0);
  const attempted=kpis.reduce((s,x)=>s+(Number(first(x,['attempts','total_attempts','totalAttempts','outgoing_attempts','outgoingAttempts'],0))||0),0);
  const totalAgents=kpis.length;
  $('metricCalls').textContent=calls.toLocaleString();
  $('metricQualified').textContent=qualified.toLocaleString();
  $('metricConnected').textContent=connected.toLocaleString();
  $('metricAttempts').textContent=attempted.toLocaleString();
  $('metricAgents').textContent=totalAgents.toLocaleString();
  const rowsOut=kpis.map(x=>[
    first(x,['employeeId','employee_id','employee','fullName','full_name','name'],'—'),
    Number(first(x,['calls','total_calls','totalCalls','callsMade','assigned_leads','assignedLeads'],0))||0,
    Number(first(x,['attempts','total_attempts','totalAttempts','outgoing_attempts','outgoingAttempts'],0))||0,
    Number(first(x,['connected_calls','connectedCalls','connected'],0))||0,
    Number(first(x,['qualified','qualified_leads','qualifiedLeads'],0))||0
  ]);
  if($('teamKpiTable')) table('teamKpiTable',['Employee','Calls','Attempts','Connected','Qualified'],rowsOut,'No KPI records found.');
}
function renderQuiz(attempts){const a=arr(attempts,['attempts','results','data','reports']);state.quizAttempts=a;$('metricAttempts').textContent=a.length.toLocaleString();}
async function load(){
  const token=window.IndiFrameAPI.getToken();if(!token){location.replace('index.html');return}
  try{const me=await window.IndiFrameAPI.apiRequest('/api/me');setProfile(me.user||me);}
  catch(e){window.IndiFrameAPI.clearToken();location.replace('index.html');return}
  const role=normRole(state.user.role);
  let kpiLoaded=false;
  if(role==='admin'){
    const results=await Promise.allSettled([
      window.IndiFrameAPI.apiRequest('/api/admin/agents'),
      window.IndiFrameAPI.apiRequest('/api/admin/kpis'),
      window.IndiFrameAPI.apiRequest('/api/quiz-attempts')
    ]);
    if(results[0].status==='fulfilled'){state.agents=arr(results[0].value,['agents','users','results','data','reports']);}
    if(results[1].status==='fulfilled'){state.kpis=arr(results[1].value,['kpis','results','data','reports']);kpiLoaded=true;}
    if(results[2].status==='fulfilled'){renderQuiz(results[2].value);}
    renderKpis(kpiLoaded ? state.kpis : []);
  }
}
window.IndiFrameAPI = window.IndiFrameAPI || {};
if(typeof window !== 'undefined') window.IndiFrameAPI.KPI = { arr, parseJsonObject, normalizeKpiRow };
