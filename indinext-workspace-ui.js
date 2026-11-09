/* INDINEXT unified workspace shell. Presentation/navigation only; app feature handlers remain untouched. */
(function () {
  "use strict";
  const body = document.body;
  const path = location.pathname.split("/").pop() || "dashboard.html";
  const existingNav = document.querySelector("body:not(.helpdesk-login) .nav");
  const links = [
    ["dashboard.html", "Overview", "OV"],
    ["call-performance.html", "Call Performance", "CP"],
    ["breaks.html", "Break Management", "BR"],
    ["admin-section.html", "Admin Workspace", "AD"],
    ["weekly-data.html", "Weekly Data", "WD"],
    ["superadmin.html", "Super Admin", "SA"],
    ["change-password.html", "Change Password", "PW"]
  ];
  function makeWorkspaceNav() {
    const nav = document.createElement("nav");
    nav.className = "if-workspace-nav";
    nav.setAttribute("aria-label", "Workspace navigation");
    links.forEach(([href, label, short]) => {
      const a = document.createElement("a");
      a.href = href;
      a.className = "if-workspace-link";
      a.dataset.workspaceHref = href;
      const mark = document.createElement("span");
      mark.className = "if-workspace-short";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = short;
      const text = document.createElement("span");
      text.className = "if-workspace-label";
      text.textContent = label;
      a.append(mark, text);
      if (path === href) {
        a.classList.add("is-current");
        a.setAttribute("aria-current", "page");
      }
      nav.appendChild(a);
    });
    return nav;
  }
  async function applyRoleNavigation(nav) {
    if (sessionStorage.getItem("forcePasswordChange") === "true") {
      nav.remove();
      document.querySelector(".topbar .topright")?.replaceChildren();
      return;
    }
    try {
      const token = sessionStorage.getItem("indiframe_token") || "";
      if (!token) throw new Error("No session");
      const response = await fetch("https://indiframe-helpdesk-api.mukuls2302.workers.dev/api/me", {
        headers: { Accept: "application/json", Authorization: "Bearer " + token }
      });
      if (!response.ok) throw new Error("Session unavailable");
      const payload = await response.json();
      const user = payload.user || payload;
      const role = String(user.role || user.userRole || "").toLowerCase().replace(/[ _-]/g, "");
      const isSuper = role === "superadmin" || user.isSuperAdmin === true || Number(user.isSuperAdmin) === 1;
      const isAdmin = isSuper || role === "admin";
      const allowed = new Set(["dashboard.html", "call-performance.html", "change-password.html"]);
      if (!isAdmin) allowed.add("breaks.html");
      if (isAdmin) allowed.add("admin-section.html");
      if (isSuper) { allowed.add("weekly-data.html"); allowed.add("superadmin.html"); }
      nav.querySelectorAll("[data-workspace-href]").forEach(link => {
        if (!allowed.has(link.dataset.workspaceHref)) link.remove();
      });
    } catch (_) {
      nav.querySelectorAll("[data-workspace-href]").forEach(link => {
        if (!["dashboard.html", "change-password.html"].includes(link.dataset.workspaceHref)) link.remove();
      });
    }
  }

  let topbar = document.querySelector(".topbar");
  let nav = existingNav;
  if (!topbar && document.querySelector("main.panel")) {
    topbar = document.createElement("header");
    topbar.className = "topbar if-auth-topbar";
    const brand = document.createElement("div");
    brand.innerHTML = '<div class="brand">INDINEXT</div><div class="subtitle">Secure Account Settings</div>';
    const right = document.createElement("div");
    right.className = "topright";
    const dashboardLink = document.createElement("a");
    dashboardLink.className = "logout-btn";
    dashboardLink.href = "dashboard.html";
    dashboardLink.textContent = "Dashboard";
    right.appendChild(dashboardLink);
    topbar.append(brand, right);
    body.insertBefore(topbar, document.querySelector("main.panel"));
  }
  if (topbar && !nav) {
    nav = makeWorkspaceNav();
    topbar.insertAdjacentElement("afterend", nav);
    applyRoleNavigation(nav);
  }
  if (!nav) return;

  nav.id = nav.id || (existingNav ? "if-dashboard-navigation" : "if-workspace-navigation");
  nav.classList.add("if-left-sidebar");
  nav.querySelector(".if-sidebar-toggle")?.remove();
  if (topbar && nav.parentElement !== body) body.insertBefore(nav, topbar.nextSibling);

  nav.querySelectorAll("button, a").forEach(item => {
    const label = (item.textContent || "").trim();
    if (label) { item.setAttribute("aria-label", label); item.setAttribute("title", label); }
  });
  const brand = document.querySelector(".topbar .brand");
  if (brand) brand.textContent = "INDINEXT";
  body.classList.add("if-app-shell");

  if (topbar && !topbar.querySelector(".if-menu-toggle")) {
    const right = topbar.querySelector(".topright") || topbar;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "if-menu-toggle";
    toggle.setAttribute("aria-label", "Open navigation");
    toggle.setAttribute("aria-controls", nav.id);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<span aria-hidden="true">☰</span><span class="if-menu-toggle-label">Menu</span>';
    right.insertBefore(toggle, right.firstChild);
    const close = () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation");
    };
    const open = () => {
      nav.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close navigation");
    };
    toggle.addEventListener("click", () => nav.classList.contains("is-open") ? close() : open());
    nav.addEventListener("click", event => { if (event.target.closest("a, button")) close(); });
    document.addEventListener("click", event => {
      if (nav.classList.contains("is-open") && !nav.contains(event.target) && !toggle.contains(event.target)) close();
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  }
})();