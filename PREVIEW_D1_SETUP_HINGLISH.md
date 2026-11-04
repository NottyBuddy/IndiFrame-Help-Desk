# Preview D1 setup — IndiFrame Help Desk

Target database: `indiframe-helpdesk-preview-db`
Database ID: `abb0abb1-3a62-47e1-a254-c64d48a74602`

**This guide is for the isolated preview database only. Do not select `indiframe-helpdesk-db`.**

## 1. Apply the bootstrap SQL

1. Open Cloudflare Dashboard → Workers & Pages → D1 SQL Console.
2. Select database **indiframe-helpdesk-preview-db** and verify the database ID above.
3. Open the repository file `preview-d1-bootstrap.sql` on branch `feature/role-kpi-call-account-governance`.
4. Copy the complete SQL file into the SQL editor and run it once.

This is a self-contained bootstrap for an empty preview database. It creates core tables (`agents`, `sessions`, `weekly_kpis`, `quiz_attempts`) plus the feature tables used by attendance, quiz bank, daily KPI, audit, breaks/settings, projects and call performance.

**Do not run `005_breaks_superadmin.sql` after this file.** The bootstrap already creates `agents.is_super_admin`, `agents.must_change_password`, the Super Admin unique index, break tables and settings.

Do not run the root-level `safe-production-d1-setup.sql`, or `migrations/006-live-d1-schema-compatibility.sql`, or `migrations/007-agent-first-login-password.sql` on this empty preview database. Those are additive compatibility scripts for an existing database.

## 2. Verify tables

Run:

```sql
SELECT name
FROM sqlite_master
WHERE type = 'table'
ORDER BY name;
```

Then verify the core tables:

```sql
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('agents','sessions','weekly_kpis','quiz_attempts',
               'attendance','agent_breaks','projects',
               'call_performance_imports','call_performance_rows')
ORDER BY name;
```

## 3. Admin account provisioning is intentionally separate

The bootstrap does **not** create a default user or store a plaintext password. Login cannot succeed until an authorized preview admin account is provisioned with a Worker-compatible password hash.

Do not copy production agent records or password hashes into preview. Do not paste passwords or password hashes into chat. We will complete preview-only admin provisioning after the schema is verified.

## 4. Worker preview binding

The feature branch `wrangler.toml` binds preview D1 as `DB` using the preview database ID above, while the production binding remains `indiframe-helpdesk-db`. Deploy only a **preview Worker** after the schema and preview admin are ready. Never deploy this branch to the production Worker as part of this setup.
