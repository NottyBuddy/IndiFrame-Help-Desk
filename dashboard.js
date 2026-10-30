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

  if ($('welcomeName')) $('welcomeName').textContent = String(name);
  if ($('userRole')) $('userRole').textContent = role.charAt(0).toUpperCase() + role.slice(1);
  if ($('userId')) $('userId').textContent = id || 'N/A';
}

function renderKpis(rows) {
  const kpis = arr(rows, ['kpis', 'results', 'data', 'reports']).map(normalizeKpiRow);
  const calls = kpis.reduce((sum, item) => sum + (Number(first(item, ['calls', 'total_calls', 'totalCalls', 'callsMade', 'assigned_leads', 'assignedLeads'], 0)) || 0), 0);
  const qualified = kpis.reduce((sum, item) => sum + (Number(first(item, ['qualified', 'qualified_leads', 'qualifiedLeads'], 0)) || 0), 0);
  const connected = kpis.reduce((sum, item) => sum + (Number(first(item, ['connected_calls', 'connectedCalls', 'connected'], 0)) || 0), 0);
  const attempted = kpis.reduce((sum, item) => sum + (Number(first(item, ['attempts', 'total_attempts', 'totalAttempts', 'outgoing_attempts', 'outgoingAttempts'], 0)) || 0), 0);

  if ($('metricCalls')) $('metricCalls').textContent = calls.toLocaleString();
  if ($('metricQualified')) $('metricQualified').textContent = qualified.toLocaleString();
  if ($('metricConnected')) $('metricConnected').textContent = connected.toLocaleString();
  if ($('metricAttempts')) $('metricAttempts').textContent = attempted.toLocaleString();

  if ($('metricAgents')) $('metricAgents').textContent = kpis.length.toLocaleString();

  const rowsOut = kpis.map((item) => [
    first(item, ['employeeId', 'employee_id', 'employee', 'fullName', 'full_name', 'name'], '—'),
    Number(first(item, ['calls', 'total_calls', 'totalCalls', 'callsMade', 'assigned_leads', 'assignedLeads'], 0)) || 0,
    Number(first(item, ['attempts', 'total_attempts', 'totalAttempts', 'outgoing_attempts', 'outgoingAttempts'], 0)) || 0,
    Number(first(item, ['connected_calls', 'connectedCalls', 'connected'], 0)) || 0,
    Number(first(item, ['qualified', 'qualified_leads', 'qualifiedLeads'], 0)) || 0
  ]);

  if ($('teamKpiTable')) {
    const table = $('teamKpiTable');
    if (!rowsOut.length) {
      table.innerHTML = '<div class="empty">No KPI records found.</div>';
      return;
    }

    table.innerHTML = `
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
  if ($('metricAttempts')) $('metricAttempts').textContent = result.length.toLocaleString();
}

async function loadDashboard() {
  const token = sessionStorage.getItem('indiframe_token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  if (sessionStorage.getItem('forcePasswordChange') === 'true') {
    window.location.href = 'change-password.html';
    return;
  }

  try {
    const me = await request('/api/me');
    const user = me.user || me;
    setProfile(user);

    const role = normRole(first(user, ['role', 'userRole'], 'agent'));

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
    }
  } catch (error) {
    sessionStorage.removeItem('indiframe_token');
    sessionStorage.removeItem('forcePasswordChange');
    window.location.href = 'index.html';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});

window.IndiFrameAPI = window.IndiFrameAPI || {};
window.IndiFrameAPI.KPI = { arr, parseJsonObject, normalizeKpiRow };
