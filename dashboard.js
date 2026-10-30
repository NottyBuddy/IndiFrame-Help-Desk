/* Role-aware dashboard. All access control must still be enforced by the Worker. */
const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  quizAttempts: [],
  agents: [],
  kpis: [],
  activeTab: "overview"
};

function normRole(v) {
  return String(v || "agent").toLowerCase();
}

function esc(v) {
  return String(v ?? "").replace(/[&<>\"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function arr(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const candidates = [...keys, "reports", "kpis", "results", "data", "rows", "items"];
  for (const k of candidates) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

function parseJsonObject(value, fallback = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  if (typeof value === "object") return value;
  return fallback;
}

function normalizeKpiRow(row) {
  if (!row || typeof row !== "object") return {};
  const metrics = parseJsonObject(row.metrics_json ?? row.metricsJson ?? row.metrics ?? row.data ?? {});
  return {
    ...row,
    ...metrics,
    employeeId: row.employeeId ?? row.employee_id ?? metrics.employeeId ?? metrics.employee_id,
    fullName: row.fullName ?? row.full_name ?? metrics.fullName ?? metrics.full_name,
    name: row.name ?? metrics.name
  };
}

function first(obj, keys, fallback = "—") {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return fallback;
}

function setStatus(message, type = "") {
  const el = $("globalStatus");
  if (!el) return;
  el.textContent = message || "";
  el.className = "status " + (type || "");
}

function setProfile(user) {
  state.user = user || {};
  const id = first(user, ["employeeId", "employee_id", "id"], "");
  const name = first(user, ["fullName", "full_name", "name", "employeeId", "employee_id"], "Employee");

  if ($("welcome")) $("welcome").textContent = `Welcome, ${name}`;
  if ($("roleBadge")) $("roleBadge").textContent = normRole(state.user.role);
  if ($("profile")) $("profile").textContent = id ? `ID: ${id}` : "Profile loaded";
}

function showTab(viewName) {
  state.activeTab = viewName;

  document.querySelectorAll(".nav button").forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle("active", isActive);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isVisible = panel.id === `view-${viewName}`;
    panel.classList.toggle("hidden", !isVisible);
  });
}

function renderKpis(rows) {
  const list = arr(rows, ["kpis", "results", "data", "reports"]).map(normalizeKpiRow);

  const calls = list.reduce((sum, item) => {
    return sum + (Number(first(item, ["calls", "total_calls", "totalCalls", "callsMade", "assigned_leads", "assignedLeads"], 0)) || 0);
  }, 0);

  const qualified = list.reduce((sum, item) => {
    return sum + (Number(first(item, ["qualified", "qualified_leads", "qualifiedLeads"], 0)) || 0);
  }, 0);

  const connected = list.reduce((sum, item) => {
    return sum + (Number(first(item, ["connected_calls", "connectedCalls", "connected"], 0)) || 0);
  }, 0);

  const attempted = list.reduce((sum, item) => {
    return sum + (Number(first(item, ["attempts", "total_attempts", "totalAttempts", "outgoing_attempts", "outgoingAttempts"], 0)) || 0);
  }, 0);

  if ($("metricCalls")) $("metricCalls").textContent = calls.toLocaleString();
  if ($("metricQualified")) $("metricQualified").textContent = qualified.toLocaleString();
  if ($("metricConnected")) $("metricConnected").textContent = connected.toLocaleString();
  if ($("metricAttempts")) $("metricAttempts").textContent = attempted.toLocaleString();

  const tableEl = $("myKpiTable");
  if (tableEl) {
    if (!list.length) {
      tableEl.innerHTML = '<div class="empty">No KPI records found.</div>';
      return;
    }

    const rowsOut = list.slice(0, 10).map((x) => [
      first(x, ["employeeId", "employee_id", "fullName", "full_name", "name"], "—"),
      Number(first(x, ["calls", "total_calls", "totalCalls", "callsMade", "assigned_leads", "assignedLeads"], 0)) || 0,
      Number(first(x, ["attempts", "total_attempts", "totalAttempts", "outgoing_attempts", "outgoingAttempts"], 0)) || 0,
      Number(first(x, ["connected_calls", "connectedCalls", "connected"], 0)) || 0,
      Number(first(x, ["qualified", "qualified_leads", "qualifiedLeads"], 0)) || 0
    ]);

    const headers = ["Employee", "Calls", "Attempts", "Connected", "Qualified"];
    tableEl.innerHTML = `
      <div class="tablewrap">
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rowsOut.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
}

function renderQuiz(attempts) {
  const list = arr(attempts, ["attempts", "results", "data", "reports"]);
  state.quizAttempts = list;

  if ($("metricAttempts")) {
    $("metricAttempts").textContent = list.length.toLocaleString();
  }

  const tableEl = $("quizTable");
  if (tableEl) {
    if (!list.length) {
      tableEl.innerHTML = '<div class="empty">No quiz attempts found.</div>';
      return;
    }

    const rowsOut = list.slice(0, 10).map((item) => [
      first(item, ["date", "attemptedAt", "created_at"], "—"),
      first(item, ["score", "result", "status"], "—"),
      first(item, ["quizTitle", "title", "name"], "—")
    ]);

    const headers = ["Date", "Score", "Quiz"];
    tableEl.innerHTML = `
      <div class="tablewrap">
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rowsOut.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
}

async function loadDashboard() {
  const token = window.IndiFrameAPI.getToken();
  if (!token) {
    location.replace("index.html");
    return;
  }

  try {
    const me = await window.IndiFrameAPI.apiRequest("/api/me");
    setProfile(me.user || me);
    setStatus("Dashboard loaded successfully.");
  } catch (error) {
    console.error("Profile load failed:", error);
    window.IndiFrameAPI.clearToken();
    location.replace("index.html");
    return;
  }

  const role = normRole(state.user.role);

  try {
    const health = await window.IndiFrameAPI.apiRequest("/api/me");
    if ($("connectionStatus")) {
      $("connectionStatus").textContent = `Connected to Worker API. User role: ${role || "agent"}`;
    }
  } catch (error) {
    if ($("connectionStatus")) {
      $("connectionStatus").textContent = "Connection check failed. Worker endpoints may not be reachable.";
    }
  }

  try {
    if (role === "admin") {
      const [agentsResult, kpisResult, quizResult] = await Promise.allSettled([
        window.IndiFrameAPI.apiRequest("/api/admin/agents"),
        window.IndiFrameAPI.apiRequest("/api/admin/kpis"),
        window.IndiFrameAPI.apiRequest("/api/quiz-attempts")
      ]);

      if (agentsResult.status === "fulfilled") {
        state.agents = arr(agentsResult.value, ["agents", "users", "results", "data", "reports"]);
      }

      if (kpisResult.status === "fulfilled") {
        state.kpis = arr(kpisResult.value, ["kpis", "results", "data", "reports"]);
        renderKpis(state.kpis);
      }

      if (quizResult.status === "fulfilled") {
        renderQuiz(quizResult.value);
      }
    } else {
      if ($("myKpiTable")) {
        $("myKpiTable").innerHTML = '<div class="empty">No KPI data available for your role.</div>';
      }
    }
  } catch (error) {
    console.error("Dashboard data load failed:", error);
    setStatus("Some dashboard data could not be loaded.", "warn");
  }
}

function bindEvents() {
  document.querySelectorAll(".nav button").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.view));
  });

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      window.IndiFrameAPI.clearToken();
      location.replace("index.html");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  showTab("overview");

  if (window.IndiFrameAPI) {
    loadDashboard();
  } else {
    setStatus("API library not loaded.", "error");
  }
});
