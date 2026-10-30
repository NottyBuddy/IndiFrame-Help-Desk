/* IndiFrame API helper — uses the existing Worker; does not deploy or modify it. */
const API_BASE = "https://indiframe-helpdesk-api.mukuls2302.workers.dev";
const TOKEN_KEY = "indiframe_token";

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  let response;
  try {
    response = await fetch(API_BASE + path, { ...options, headers });
  } catch (e) {
    throw new Error("API se connect nahi ho paaya. Internet/Worker availability check karein.");
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
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
  apiRequest
};
