/* Role-aware dashboard. All access control must still be enforced by the Worker. */
const $ = (id) => document.getElementById(id);
const state = { user: null, quizAttempts: [], agents: [], kpis: [] };
const API_BASE = (window.IndiFrameAPI && window.IndiFrameAPI.API_BASE) || 'https://indiframe-helpdesk-api.mukuls2302.workers.dev';

function normRole(v) {
  return String(v || 'agent').toLowerCase();
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function arr(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const candidates = [...keys, 'reports', 'kpis', 'results', 'data', 'rows', 'items'];
  for (const key of candidates) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function first(obj, keys, fallback = '—') {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return fallback;
}

function setTextByIdCandidates(ids, value) {
  for (const id of ids) {
    const el = $(id);
    if (el) {
      el.textContent = value;
      return true;
    }
  }
  return false;
}

function parseJsonObject(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  if (typeof value === 'object') return value;
  return fallback;
}

function normalizeKpiRow(row) {
  if (!row || typeof row !== 'object') return {};
  const metrics = parseJsonObject(row.metrics_json ?? row.metricsJson ?? row.metrics ?? row.data ?? {});
  return {
    ...row,
    ...metrics,
    employeeId: row.employeeId ?? row.employee_id ?? metrics.employeeId ?? metrics.employee_id,
    fullName: row.fullName ?? row.full_name ?? metrics.fullName ?? metrics.full_name ?? row.name ?? metrics.name
  };
}

function buildRequest(path, options = {}) {
  const token = sessionStorage.getItem('indiframe_token') || '';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };

  if (token && !headers.Authorization) {
    headers.Authorization = 'Bearer ' + token;
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(API_BASE + path, { ...options, headers });
}

async function request(path, options = {}) {
  if (window.IndiFrameAPI && typeof window.IndiFrameAPI.apiRequest === 'function') {
    return window.IndiFrameAPI.apiRequest(path, options);
  }

  const response = await buildRequest(path, options);
  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
  }

  return payload;
}

function setProfile(user) {
  state.user = user || {};
  const id = first(user, ['employeeId', 'employee_id', 'id'], '');
  const name = first(user, ['fullName', 'full_name', 'name', 'employeeId', 'employee_id'], 'Employee');
  const role = normRole(first(user, ['role', 'userRole'], 'agent'));
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  setTextByIdCandidates(['welcomeName', 'welcome'], String(name));
  setTextByIdCandidates(['userRole', 'roleBadge'], roleLabel);
  setTextByIdCandidates(['userId', 'profile'], id || 'N/A');

  const badge = $('roleBadge');
  if (badge) {
    badge.textContent = roleLabel;
    badge.classList.toggle('admin', role === 'admin');
  }
}

function setConnectionStatus(message, isOk = true) {
  const el = $('connectionStatus') || $('globalStatus');
  if (!el) return;
  el.textContent = message;
  el.className = isOk ? 'empty' : 'status error';
}

function renderKpis(rows) {
  const kpis = arr(rows, ['kpis', 'results', 'data', 'reports']).map(normalizeKpiRow);
  const calls = kpis.reduce((sum, item) => sum + (Number(first(item, ['calls', 'total_calls', 'totalCalls', 'callsMade', 'assigned_leads', 'assignedLeads'], 0)) || 0), 0);
  const qualified = kpis.reduce((sum, item) => sum + (Number(first(item, ['qualified', 'qualified_leads', 'qualifiedLeads'], 0)) || 0), 0);
  const connected = kpis.reduce((sum, item) => sum + (Number(first(item, ['connected_calls', 'connectedCalls', 'connected'], 0)) || 0), 0);
  const attempted = kpis.reduce((sum, item) => sum + (Number(first(item, ['attempts', 'total_attempts', 'totalAttempts', 'outgoing_attempts', 'outgoingAttempts'], 0)) || 0), 0);

  setTextByIdCandidates(['metricCalls'], calls.toLocaleString());
  setTextByIdCandidates(['metricQualified'], qualified.toLocaleString());
  setTextByIdCandidates(['metricConnected'], connected.toLocaleString());
  setTextByIdCandidates(['metricAttempts'], attempted.toLocaleString());
  setTextByIdCandidates(['metricAgents'], kpis.length.toLocaleString());

  const rowsOut = kpis.map((item) => [
    first(item, ['employeeId', 'employee_id', 'employee', 'fullName', 'full_name', 'name'], '—'),
    Number(first(item, ['calls', 'total_calls', 'totalCalls', 'callsMade', 'assigned_leads', 'assignedLeads'], 0)) || 0,
    Number(first(item, ['attempts', 'total_attempts', 'totalAttempts', 'outgoing_attempts', 'outgoingAttempts'], 0)) || 0,
    Number(first(item, ['connected_calls', 'connectedCalls', 'connected'], 0)) || 0,
    Number(first(item, ['qualified', 'qualified_leads', 'qualifiedLeads'], 0)) || 0
  ]);

  const myKpiTable = $('myKpiTable') || $('teamKpiTable');
  if (myKpiTable) {
    if (!rowsOut.length) {
      myKpiTable.innerHTML = '<div class="empty">No KPI records found.</div>';
      return;
    }

    myKpiTable.innerHTML = `
      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Calls</th>
              <th>Attempts</th>
              <th>Connected</th>
              <th>Qualified</th>
            </tr>
          </thead>
          <tbody>
            ${rowsOut.map((row) => `<tr><td>${esc(row[0])}</td><td>${Number(row[1])}</td><td>${Number(row[2])}</td><td>${Number(row[3])}</td><td>${Number(row[4])}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

async function loadAttendance() {
  const panel = $('attendancePanel');
  try {
    const status = await request('/api/hd/attendance/status');
    if (panel) {
      panel.textContent = status.active
        ? 'Aap checked-in hain. Check-in time: ' + new Date(status.checkInAt).toLocaleString()
        : 'Aap abhi checked-in nahi hain.';
    }
    const inBtn = $('checkInBtn'), outBtn = $('checkOutBtn');
    if (inBtn) inBtn.disabled = !!status.active;
    if (outBtn) outBtn.disabled = !status.active;
    const month = new Date().toISOString().slice(0, 7);
    const history = await request('/api/hd/attendance/history?month=' + month);
    const records = history.records || [];
    const el = $('attendanceHistory');
    if (el) {
      el.innerHTML = records.length
        ? '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Duration</th></tr></thead><tbody>' +
          records.map(r => '<tr><td>' + esc(r.workDate) + '</td><td>' + esc(r.checkInAt ? new Date(r.checkInAt).toLocaleTimeString() : '—') + '</td><td>' + esc(r.checkOutAt ? new Date(r.checkOutAt).toLocaleTimeString() : '—') + '</td><td>' + esc(r.durationMinutes == null ? 'In progress' : Math.floor(r.durationMinutes/60)+'h '+(r.durationMinutes%60)+'m') + '</td></tr>').join('') +
          '</tbody></table></div>'
        : '<div class="empty">Is month ki attendance history abhi available nahi hai.</div>';
    }
  } catch (e) {
    if (panel) panel.textContent = 'Attendance service abhi available nahi hai: ' + e.message;
  }
}

async function attendanceAction(action) {
  const inBtn = $('checkInBtn'), outBtn = $('checkOutBtn');
  if (inBtn) inBtn.disabled = true;
  if (outBtn) outBtn.disabled = true;
  try {
    if (action === 'in') {
      await request('/api/hd/attendance/check-in', { method: 'POST', body: JSON.stringify({ tzOffsetMinutes: new Date().getTimezoneOffset() }) });
      setConnectionStatus('Check-in successfully save ho gaya.', true);
    } else {
      await request('/api/hd/attendance/check-out', { method: 'POST' });
      setConnectionStatus('Check-out successfully save ho gaya.', true);
    }
    await loadAttendance();
  } catch (e) {
    setConnectionStatus(e.message, false);
    await loadAttendance();
  }
}

function renderQuiz(attempts) {
  const result = arr(attempts, ['attempts', 'results', 'data', 'reports']);
  state.quizAttempts = result;
  const total = Array.isArray(result) ? result.length : 0;
  setTextByIdCandidates(['metricAttempts'], total.toLocaleString());

  const quizTable = $('quizTable');
  if (quizTable) {
    if (!result.length) {
      quizTable.innerHTML = '<div class="empty">No quiz attempts found.</div>';
      return;
    }

    quizTable.innerHTML = `
      <div class="tablewrap">
        <table>
          <thead>
            <tr><th>Week</th><th>Score</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${result.map((item) => `<tr><td>${esc(first(item,['weekNumber','week','week_number'], '—'))}</td><td>${Number(first(item,['score','totalScore'],0))}</td><td>${Number(first(item,['totalQuestions','total_questions','total'],0))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

async function loadDashboard() {
  const token = sessionStorage.getItem('indiframe_token');
  if (!token) {
    setConnectionStatus('No active session. Redirecting to login…', false);
    window.location.href = 'index.html';
    return;
  }

  if (sessionStorage.getItem('forcePasswordChange') === 'true') {
    window.location.href = 'change-password.html';
    return;
  }

  try {
    setConnectionStatus('Checking the existing API…', true);
    const me = await request('/api/me');
    const user = me.user || me;
    setProfile(user);
    await loadAttendance();

    const role = normRole(first(user, ['role', 'userRole'], 'agent'));
    setTextByIdCandidates(['profile'], `${String(first(user,['fullName','full_name','name'],'Employee'))} • ${role}`);
    const superAdminLink = $('superAdminLink');
    if (superAdminLink) superAdminLink.classList.toggle('hidden', user.isSuperAdmin !== true);

    if (role === 'admin') {
      const adminNav = $('adminNav'); if (adminNav) adminNav.classList.remove('hidden');
      await loadAdminWorkspace();
      const [agentsRes, kpisRes, quizRes] = await Promise.allSettled([
        request('/api/admin/agents'),
        request('/api/admin/kpis'),
        request('/api/quiz-attempts')
      ]);

      if (agentsRes.status === 'fulfilled') {
        state.agents = arr(agentsRes.value, ['agents', 'users', 'results', 'data', 'reports']);
      }

      if (kpisRes.status === 'fulfilled') {
        state.kpis = arr(kpisRes.value, ['kpis', 'results', 'data', 'reports']);
        renderKpis(state.kpis);
      }

      if (quizRes.status === 'fulfilled') {
        renderQuiz(quizRes.value);
      }

      setConnectionStatus('Connected to the API. Admin data loaded successfully.', true);
    } else {
      const [myKpiRes, myQuizRes] = await Promise.allSettled([
        request('/api/kpis/my'),
        request('/api/quiz-attempts')
      ]);
      if (myKpiRes.status === 'fulfilled') {
        state.kpis = arr(myKpiRes.value, ['kpis', 'results', 'data']);
        renderKpis(state.kpis);
      } else {
        renderKpis([]);
      }
      if (myQuizRes.status === 'fulfilled') renderQuiz(myQuizRes.value);
      else renderQuiz([]);
      setConnectionStatus('Connected to the API. Aapka personal KPI aur quiz history load ho gaya.', true);
    }
  } catch (error) {
    setConnectionStatus(error.message || 'API unavailable. Please check the Worker or log in again.', false);
    window.IndiFrameAPI.clearToken();
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  }
}


async function loadWeeklyQuiz() {
  const week = Number($('quizWeek')?.value || 1), player=$('quizPlayer'), message=$('quizMessage');
  if (!Number.isInteger(week) || week<1 || week>60) { message.textContent='Week number 1 se 60 ke beech hona chahiye.'; return; }
  player.textContent='Quiz load ho raha hai…'; message.textContent='';
  try {
    const data=await request('/api/hd/quiz/questions?week='+week);
    if(data.alreadyAttempted){player.textContent='Aap is week ka quiz already submit kar chuke hain. Score: '+data.previous.score+'/'+data.previous.total_questions;return;}
    if(!data.questions?.length){player.textContent='Is week ke liye abhi quiz questions publish nahi hue hain.';return;}
    player.innerHTML='<form id="weeklyQuizForm">'+data.questions.map((q,i)=>'<fieldset class="card" style="margin:12px 0;padding:16px;border:1px solid var(--line);border-radius:10px"><legend><strong>'+(i+1)+'. '+esc(q.question)+'</strong></legend>'+q.options.map((o,n)=>'<label style="display:block;margin:10px 0"><input type="radio" name="q_'+q.id+'" value="'+n+'" required> '+esc(o)+'</label>').join('')+'</fieldset>').join('')+'<button class="primary-btn" type="submit">Submit Weekly Quiz</button></form>';
    $('weeklyQuizForm').addEventListener('submit',async ev=>{ev.preventDefault();const answers={};for(const q of data.questions){const picked=ev.currentTarget.querySelector('input[name="q_'+q.id+'"]:checked');if(!picked){message.textContent='Please answer every question.';return;}answers[String(q.id)]=Number(picked.value);}const btn=ev.currentTarget.querySelector('button');btn.disabled=true;try{const result=await request('/api/hd/quiz/submit',{method:'POST',body:JSON.stringify({week,answers})});player.textContent='Quiz submitted. Score: '+result.score+'/'+result.total+' ('+result.percent+'%).';message.textContent='Submission successfully save ho gaya.';const hist=await request('/api/quiz-attempts');renderQuiz(hist);}catch(err){message.textContent=err.message;btn.disabled=false;}});
  } catch(e){player.textContent='Quiz load nahi ho paya: '+e.message;}
}
async function loadAdminWorkspace() {
  const put=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  const table=(id,headers,rows)=>{const el=$(id);if(!el)return;if(!rows.length){el.textContent='No records available.';return;}el.innerHTML='<div class="tablewrap"><table><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';};
  const jobs=await Promise.allSettled([
    request('/api/admin/agents'),request('/api/hd/kpis/summary'),request('/api/quiz-attempts'),
    request('/api/hd/attendance/history?month='+new Date().toISOString().slice(0,7)),
    request('/api/hd/admin/breaks/status'),request('/api/hd/admin/quiz/results?week='+Number($('quizWeek')?.value||1))
  ]);
  const val=i=>jobs[i].status==='fulfilled'?jobs[i].value:null;
  const agents=val(0)?.agents||[], kpi=val(1), quiz=val(2)?.attempts||[], attendance=val(3)?.records||[], breaks=val(4)?.activeBreaks||[], results=val(5)?.attempts||[];
  put('adminActiveAgents',agents.filter(a=>Number(a.active)===1&&a.role!=='admin').length);
  put('adminQuizAttempts',quiz.length);put('adminAttendanceCount',new Set(attendance.filter(a=>!a.checkOutAt).map(a=>a.employeeId)).size);put('adminBreakCount',breaks.length);
  table('adminAgentsTable',['Employee','Role','Status'],agents.map(a=>'<tr><td>'+esc(a.fullName)+'<br><small>'+esc(a.employeeId)+'</small></td><td>'+esc(a.role)+'</td><td>'+(Number(a.active)===1?'Active':'Inactive')+'</td></tr>'));
  table('adminAttendanceTable',['Employee ID','Date','Check In','Check Out','Duration'],attendance.map(a=>'<tr><td>'+esc(a.employeeId)+'</td><td>'+esc(a.workDate)+'</td><td>'+esc(a.checkInAt?new Date(a.checkInAt).toLocaleTimeString():'—')+'</td><td>'+esc(a.checkOutAt?new Date(a.checkOutAt).toLocaleTimeString():'—')+'</td><td>'+esc(a.durationMinutes==null?'In progress':a.durationMinutes+' min')+'</td></tr>'));
  table('adminBreakTable',['Employee','Break','Started','Elapsed'],breaks.map(b=>'<tr><td>'+esc(b.full_name)+' ('+esc(b.employee_id)+')</td><td>'+esc(b.break_type)+'</td><td>'+esc(new Date(b.started_at).toLocaleTimeString())+'</td><td>'+Math.floor(b.elapsedSeconds/60)+' min</td></tr>'));
  const byAgent=kpi?.byAgent||[];
  table('adminKpiTable',['Employee ID','Assigned','Attempts','Connected','Qualified','Conversion'],byAgent.map(x=>'<tr><td>'+esc(x.employeeId)+'</td><td>'+x.assigned+'</td><td>'+x.attempts+'</td><td>'+x.connected+'</td><td>'+x.qualified+'</td><td>'+esc(x.conversionRate==null?'—':x.conversionRate+'%')+'</td></tr>'));
  table('adminQuizTable',['Employee ID','Score','Total','Completed'],results.map(x=>'<tr><td>'+esc(x.employeeId)+'</td><td>'+x.score+'</td><td>'+x.total+'</td><td>'+esc(x.completedAt?new Date(x.completedAt).toLocaleString():'—')+'</td></tr>'));
  const failed=jobs.map((x,i)=>x.status==='rejected'?['Agents','KPI','Quiz','Attendance','Breaks','Quiz results'][i]+': '+x.reason.message:null).filter(Boolean);
  if(failed.length)put('globalStatus','Some Admin panels unavailable: '+failed.join(' | '));
}

window.addEventListener('DOMContentLoaded', () => {
  const checkIn = $('checkInBtn'), checkOut = $('checkOutBtn'), refresh = $('refreshAttendanceBtn');
  if (checkIn) checkIn.addEventListener('click', () => attendanceAction('in'));
  if (checkOut) checkOut.addEventListener('click', () => attendanceAction('out'));
  if (refresh) refresh.addEventListener('click', loadAttendance);
  const loadQuizBtn = $('loadQuizBtn'); if (loadQuizBtn) loadQuizBtn.addEventListener('click', loadWeeklyQuiz);
  const nav = document.querySelector('.nav'); if (nav) nav.addEventListener('click', e => { const b=e.target.closest('[data-view]'); if(!b)return; document.querySelectorAll('.nav [data-view]').forEach(x=>x.classList.toggle('active',x===b)); document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('hidden',x.id!=='view-'+b.dataset.view)); });
  loadDashboard();
});

window.IndiFrameAPI = window.IndiFrameAPI || {};
window.IndiFrameAPI.KPI = { arr, parseJsonObject, normalizeKpiRow };
