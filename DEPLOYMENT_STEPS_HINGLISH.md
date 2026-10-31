# IndiFrame Help Desk — Live setup checklist (Hinglish)

Ye branch development ke liye hai: `codex/agent-admin-portal`. Is branch ko abhi production mein merge/deploy nahi kiya gaya hai.

## Is update mein kya add hua

- D1-backed Employee ID login aur 12-hour server-side sessions.
- Existing `agents`, `sessions`, `weekly_kpis` aur `quiz_attempts` tables ke saath API connection.
- Admin ke liye team agents, weekly KPI aur quiz results APIs.
- Agent ke liye personal KPI aur quiz history APIs.
- Attendance check-in/check-out aur history.
- Break start/end, break duration aur Admin ka active-break monitor.
- Project create/list/update/activity APIs.
- Project database: `projects`, `project_products`, `project_activity`.
- Super Admin account-management APIs aur UI.
- Demo employee/KPI/quiz records ko Worker se hata diya gaya hai.

## Live D1 par apply karne se pehle

1. Cloudflare D1 ka backup/export zaroor lein.
2. Confirm karein ki Worker ka D1 binding naam exactly `DB` hai.
3. SQL migrations isi order mein apply karein:
   - `001_attendance.sql`
   - `002_quiz_questions.sql`
   - `003_kpi_daily.sql`
   - `004_audit_log.sql`
   - `005_breaks_superadmin.sql`
   - `006_projects.sql`
4. `005_breaks_superadmin.sql` mein `ALTER TABLE agents ADD COLUMN` hai. Is migration ko dobara run na karein.
5. Migration ke baad existing approved Admin account ko Super Admin mark karne ke liye sirf confirmed Employee ID par one-time update run hoga. Is file mein kisi account ko automatic Super Admin nahi banaya gaya.

## Super Admin account assignment — approval required

Database inspection mein existing Admin Employee ID `Hrhca27558` mila tha. Is account ko Super Admin banane se pehle account owner ki explicit confirmation zaroori hai.

Confirmation ke baad one-time SQL:

```sql
UPDATE agents
SET is_super_admin = 1
WHERE employee_id = 'Hrhca27558'
  AND role = 'admin'
  AND active = 1;
```

Unique partial index ensure karta hai ki ek hi Super Admin ho.

## Password hash compatibility check — deployment blocker

Existing Admin ka hash prefix `pbkdf2$100000$` hai. Worker ab PBKDF2 format `pbkdf2$iterations$salt$derivedKey` ko hex/base64url salt aur derived key ke saath verify karne ki koshish karta hai. Lekin live login ko replace karne se pehle actual encoding ko confirm karna zaroori hai.

Hash expose kiye bina ye query run karke sirf result share karein:

```sql
SELECT
  length(password_hash) AS hash_length,
  length(password_hash) - length(replace(password_hash, '$', '')) AS separator_count
FROM agents
WHERE employee_id = 'Hrhca27558';
```

Password ya poora password_hash kisi ke saath share na karein.

## Deployment status

- Code GitHub development branch par hai.
- Migrations abhi live D1 par execute nahi ki gayi hain.
- Worker abhi Cloudflare par deploy nahi kiya gaya hai.
- GitHub Pages production branch abhi change nahi hui.
- Existing customer/project data import nahi hua; new project tables empty rahengi jab tak verified data import nahi hota.

Live deployment tabhi karein jab backup, hash format aur Super Admin account confirmation complete ho jaaye.
