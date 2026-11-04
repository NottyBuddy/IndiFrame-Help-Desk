/* IndiFrame Help Desk API client. Production remains the default; preview can be selected explicitly. */
// Preview mode is opt-in via the preview entry URL and remains scoped to this browser tab.
const apiQuery = new URLSearchParams(window.location.search);
if (apiQuery.get("preview") === "1") sessionStorage.setItem("indiframe_api_environment", "preview");
const previewMode = sessionStorage.getItem("indiframe_api_environment") === "preview";
const configuredApiBase = typeof window.INDIFRAME_API_BASE === "string"
  ? window.INDIFRAME_API_BASE.trim().replace(/\/+$/, "")
  : "";
const API_BASE = configuredApiBase || (previewMode
  ? "https://d9ec26e2-indiframe-helpdesk-api.mukuls2302.workers.dev"
  : "https://indiframe-helpdesk-api.mukuls2302.workers.dev");
const TOKEN_KEY = "indiframe_token";

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}
function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem("forcePasswordChange");
}
async function apiRequest(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;
  let response;
  try {
    response = await fetch(API_BASE + path, { ...options, headers });
  } catch {
    throw new Error("Unable to reach the Help Desk server. No offline or demo data was substituted.");
  }
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401) clearToken();
    throw new Error(payload.error || payload.message || `API error (${response.status})`);
  }
  return payload;
}
window.IndiFrameAPI = { API_BASE, TOKEN_KEY, getToken, clearToken, apiRequest };
