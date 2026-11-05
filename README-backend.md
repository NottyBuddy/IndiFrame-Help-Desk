# IndiFrame Help Desk Backend

This repo now includes a real Cloudflare Worker backend for the app.

## Files
- `worker.js` — backend API routes and session auth
- `wrangler.toml` — Cloudflare Worker config
- `package.json` — scripts for local development and deployment

## Local dev
```bash
npm install
npm run dev
```

## Deploy
```bash
npm run deploy
```

## Authentication

Create and manage employee accounts through the authenticated Super Admin workspace. Never use demo credentials or publish real passwords in repository documentation. Production credentials remain in D1 as password hashes.

## Expected routes
- `POST /api/login`
- `GET /api/me`
- `POST /api/change-password`
- `GET /api/admin/agents`
- `GET /api/admin/kpis`
- `GET /api/quiz-attempts`
- `GET /api/health`

