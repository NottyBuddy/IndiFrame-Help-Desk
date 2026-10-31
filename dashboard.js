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

    const role = normRole(first(user, ['role', 'userRole'], 'agent'));
    setTextByIdCandidates(['profile'], `${String(first(user,['fullName','full_name','name'],'Employee'))} • ${role}`);
    const superAdminLink = $('superAdminLink');
    if (superAdminLink) superAdminLink.classList.toggle('hidden', user.isSuperAdmin !== true);

    if (role === 'admin') {
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
      setConnectionStatus('Connected to the API. Agent dashboard ready.', true);
      renderKpis([]);
      renderQuiz([]);
    }
  } catch (error) {
    setConnectionStatus(error.message || 'API unavailable. Please check the Worker or log in again.', false);
    window.IndiFrameAPI.clearToken();
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});

window.IndiFrameAPI = window.IndiFrameAPI || {};
window.IndiFrameAPI.KPI = { arr, parseJsonObject, normalizeKpiRow };
