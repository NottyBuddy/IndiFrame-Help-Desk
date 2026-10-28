INDIFRAME DASHBOARD — FRONTEND PACKAGE ONLY

Files:
- dashboard.html: dashboard UI
- dashboard.css: responsive styling
- dashboard.js: role-based dashboard logic
- api.js: API helper for the existing Worker endpoint

Important:
- This package does NOT deploy or change Cloudflare Worker/D1.
- It uses the existing API base URL and confirmed routes: POST /api/login is handled by your existing login page; GET /api/me; GET /api/admin/agents; GET /api/admin/kpis; GET /api/quiz-attempts.
- It does not call guessed write routes. The project notes do not confirm employee KPI reads, attendance punch-in/out, quiz questions/submission, or KPI upload endpoints as deployed.

Integration with the current index.html:
1. Keep the existing login code and the token key `indiframe_token`.
2. After successful login, redirect to `dashboard.html` instead of showing the placeholder text “Dashboard abhi banana baaki hai.”
3. Upload the three dashboard files plus this README to the root of the existing GitHub Pages repository. Keep the current `index.html` in place.
4. On logout, dashboard returns to `index.html`.

Security:
- UI role hiding is only for presentation. Worker must enforce authorization for every endpoint.
- Do not put Worker secrets or admin setup keys in these files.
