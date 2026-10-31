const USERS = new Map([
  ['admin', { employeeId: 'admin', fullName: 'System Admin', role: 'admin', password: 'admin123' }],
  ['A101', { employeeId: 'A101', fullName: 'Agent Alpha', role: 'agent', password: 'Hrhca@123456' }],
  ['A102', { employeeId: 'A102', fullName: 'Agent Beta', role: 'agent', password: 'Hrhca@123456' }],
  ['A103', { employeeId: 'A103', fullName: 'Agent Gamma', role: 'agent', password: 'Hrhca@123456' }],
  ['agent', { employeeId: 'agent', fullName: 'Agent User', role: 'agent', password: 'Hrhca@123456' }]
]);

const KPI_ROWS = [
  { employeeId: 'A101', fullName: 'Agent Alpha', calls: 120, attempts: 160, connected: 48, qualified: 22 },
  { employeeId: 'A102', fullName: 'Agent Beta', calls: 98, attempts: 150, connected: 41, qualified: 18 },
  { employeeId: 'A103', fullName: 'Agent Gamma', calls: 88, attempts: 140, connected: 35, qualified: 17 }
];

const QUIZ_ATTEMPTS = [
  { id: 1, employeeId: 'A101', weekNumber: 1, score: 8, totalQuestions: 10 },
  { id: 2, employeeId: 'A102', weekNumber: 1, score: 7, totalQuestions: 10 }
];

const SESSIONS = new Map();
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Content-Type': 'application/json'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

function getBody(req) {
  return req.json().catch(() => ({}));
}

function normalizeEmployeeId(value) {
  return String(value || '').trim();
}

function createToken(user) {
  const token = crypto.randomUUID();
  SESSIONS.set(token, {
    employeeId: user.employeeId,
    fullName: user.fullName,
    role: user.role,
    expiresAt: Date.now() + TOKEN_TTL_MS
  });
  return token;
}

function requireAuth(req) {
  const auth = req.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = match[1];
  const session = SESSIONS.get(token);
  if (!session) {
    throw new Error('Session expired or invalid');
  }

  if (Date.now() > session.expiresAt) {
    SESSIONS.delete(token);
    throw new Error('Session expired');
  }

  return session;
}

function requireAdmin(req) {
  const user = requireAuth(req);
  if (user.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return user;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      const path = url.pathname;

      if (path === '/api/health') {
        return json({ ok: true, name: 'indiframe-helpdesk-api', time: new Date().toISOString() });
      }

      if (path === '/api/login' && request.method === 'POST') {
        const body = await getBody(request);
        const employeeId = normalizeEmployeeId(body.employeeId);
        const password = String(body.password || '');
        const user = USERS.get(employeeId) || USERS.get(employeeId.toLowerCase()) || null;

        if (!user || password !== user.password) {
          return json({ error: 'Invalid Employee ID or password' }, 401);
        }

        const token = createToken(user);
        return json({ token, user: { employeeId: user.employeeId, fullName: user.fullName, role: user.role } }, 200);
      }

      if (path === '/api/me' && request.method === 'GET') {
        const session = requireAuth(request);
        return json({ user: { employeeId: session.employeeId, fullName: session.fullName, role: session.role } });
      }

      if (path === '/api/change-password' && request.method === 'POST') {
        const session = requireAuth(request);
        const body = await getBody(request);
        const newPassword = String(body.password || '').trim();

        if (newPassword.length < 6) {
          return json({ error: 'Password must be at least 6 characters.' }, 400);
        }

        const existing = USERS.get(session.employeeId) || USERS.get(session.employeeId.toLowerCase()) || null;
        if (!existing) {
          return json({ error: 'User not found.' }, 404);
        }

        existing.password = newPassword;
        return json({ success: true, user: { employeeId: existing.employeeId, fullName: existing.fullName, role: existing.role } });
      }

      if (path === '/api/admin/agents' && request.method === 'GET') {
        requireAdmin(request);
        return json({ agents: Array.from(USERS.values()).map((user) => ({ employeeId: user.employeeId, fullName: user.fullName, role: user.role })) });
      }

      if (path === '/api/admin/kpis' && request.method === 'GET') {
        requireAdmin(request);
        return json({ kpis: KPI_ROWS });
      }

      if (path === '/api/quiz-attempts' && request.method === 'GET') {
        requireAuth(request);
        return json({ attempts: QUIZ_ATTEMPTS });
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      if (message.toLowerCase().includes('session') || message.toLowerCase().includes('authorization') || message.toLowerCase().includes('admin')) {
        return json({ error: message }, 401);
      }
      return json({ error: message }, 500);
    }
  }
};
