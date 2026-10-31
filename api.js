/* IndiFrame API helper — supports the real Worker and a local demo fallback for GitHub Pages. */
const API_BASE = "https://indiframe-helpdesk-api.mukuls2302.workers.dev";
const TOKEN_KEY = "indiframe_token";
const DEMO_USER_KEY = "indiframe_demo_user";

const DEMO_USERS = {
  admin: {
    employeeId: "admin",
    fullName: "System Admin",
    role: "admin",
    password: "admin123"
  },
  A101: {
    employeeId: "A101",
    fullName: "Agent Alpha",
    role: "agent",
    password: "Hrhca@123456"
  },
  agent: {
    employeeId: "agent",
    fullName: "Agent User",
    role: "agent",
    password: "Hrhca@123456"
  }
};

function normalizeEmployeeId(value) {
  return String(value || '').trim();
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('forcePasswordChange');
}

function getDemoUser() {
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setDemoUser(user) {
  if (!user) return;
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
}

function resolveDemoUser(employeeId, password) {
  const normalizedId = normalizeEmployeeId(employeeId).toLowerCase();
  const candidate = DEMO_USERS[normalizedId] || DEMO_USERS[employeeId] || null;
  if (!candidate) return null;
  if (!password || String(password) !== String(candidate.password)) return null;
  return {
    employeeId: candidate.employeeId,
    fullName: candidate.fullName,
    role: candidate.role,
    password: candidate.password
  };
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function mockApiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = parseBody(options.body || null);
  const demoUser = getDemoUser();

  if (path === '/api/login') {
    const user = resolveDemoUser(body.employeeId, body.password);
    if (!user) {
      throw new Error('Invalid Employee ID or password');
    }
    setDemoUser(user);
    return { token: 'demo-token', user };
  }

  if (path === '/api/me') {
    if (!demoUser) {
      throw new Error('No active session');
    }
    return { user: demoUser };
  }

  if (path === '/api/admin/agents') {
    return {
      agents: [
        { employeeId: 'admin', fullName: 'System Admin', role: 'admin' },
        { employeeId: 'A101', fullName: 'Agent Alpha', role: 'agent' },
        { employeeId: 'A102', fullName: 'Agent Beta', role: 'agent' },
        { employeeId: 'A103', fullName: 'Agent Gamma', role: 'agent' }
      ]
    };
  }

  if (path === '/api/admin/kpis') {
    return {
      kpis: [
        { employeeId: 'A101', fullName: 'Agent Alpha', calls: 120, attempts: 160, connected: 48, qualified: 22 },
        { employeeId: 'A102', fullName: 'Agent Beta', calls: 98, attempts: 150, connected: 41, qualified: 18 },
        { employeeId: 'A103', fullName: 'Agent Gamma', calls: 88, attempts: 140, connected: 35, qualified: 17 }
      ]
    };
  }

  if (path === '/api/quiz-attempts') {
    return {
      attempts: [
        { id: 1, employeeId: 'A101', weekNumber: 1, score: 8, totalQuestions: 10 },
        { id: 2, employeeId: 'A102', weekNumber: 1, score: 7, totalQuestions: 10 }
      ]
    };
  }

  if (path === '/api/change-password') {
    if (!demoUser) {
      throw new Error('Session expired');
    }
    const payload = parseBody(options.body || {});
    const password = String(payload.password || '');
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    const updated = { ...demoUser, password };
    setDemoUser(updated);
    return { success: true, user: updated };
  }

  if (method === 'POST' && path === '/api/attendance') {
    return { savedLocally: true };
  }

  throw new Error('Endpoint unavailable in demo mode');
}

async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  let response;
  try {
    response = await fetch(API_BASE + path, { ...options, headers });
  } catch (e) {
    return mockApiRequest(path, options);
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
    }
    if (path === '/api/login' || path === '/api/me' || path === '/api/admin/agents' || path === '/api/admin/kpis' || path === '/api/quiz-attempts' || path === '/api/change-password') {
      return mockApiRequest(path, options);
    }
    throw new Error(payload.error || payload.message || `API error (${response.status})`);
  }

  return payload;
}

window.IndiFrameAPI = {
  API_BASE,
  TOKEN_KEY,
  getToken,
  clearToken,
  apiRequest,
  getDemoUser,
  setDemoUser,
  DEMO_USERS
};
