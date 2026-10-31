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

## Example login
```bash
curl -X POST https://your-worker.example.workers.dev/api/login \
  -H 'Content-Type: application/json' \
  -d '{"employeeId":"admin","password":"admin123"}'
```

## Expected routes
- `POST /api/login`
- `GET /api/me`
- `POST /api/change-password`
- `GET /api/admin/agents`
- `GET /api/admin/kpis`
- `GET /api/quiz-attempts`
- `GET /api/health`

## Default users
- `admin` / `admin123`
- `A101` / `Hrhca@123456`
- `A102` / `Hrhca@123456`
- `A103` / `Hrhca@123456`
