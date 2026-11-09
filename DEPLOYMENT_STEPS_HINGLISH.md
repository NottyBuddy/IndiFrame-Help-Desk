# IndiFrame Help Desk — Live setup checklist (Hinglish)

Ye document deployment checklist hai, live environment status ka source of truth nahi. Git branch, Cloudflare Worker deployment aur D1 migration history ko deployment se pehle independently verify karein.

## Is update mein kya add hua

- D1-backed Employee ID login aur 12-hour server-side sessions.
- Existing `agents`, `sessions`, `weekly_kpis` aur `quiz_attempts` tables ke saath API connection.
- Admin ke liye team agents, weekly KPI aur quiz results APIs.
- Agent ke liye personal KPI aur quiz history APIs.
- Attendance check-in/check-out aur history.
- Break start/end, break duration aur Admin ka active-break monitor.
- Separate Call Performance import, date-wise, agent-wise aur disposition-wise report APIs/UI.
- Call Performance ke liye `call_performance_imports` aur `call_performance_rows` tables; existing KPI tables aur APIs untouched.
- Super Admin account-management APIs aur UI.
- Demo employee/KPI/quiz records ko Worker se hata diya gaya hai.

## Live D1 par apply karne se pehle

1. Cloudflare D1 ka backup/export zaroor lein.
2. Confirm karein ki Worker ka D1 binding naam exactly `DB` hai.
3. Repository mein root-level SQL files aur `migrations/` folder dono hain. Inmein overlapping numeric prefixes (jaise `008_*`) bhi hain; filename ke basis par inhe ek single ordered migration sequence na samjhein.
4. D1 ki applied-migration history aur current schema inspect karke har SQL file ki applicability confirm karein. Kisi `ALTER TABLE ... ADD COLUMN` statement ko existing column par dobara run na karein.
5. `005_breaks_superadmin.sql` mein `agents` table par schema change aur single-Super-Admin unique index hai. Isse pehle current schema, existing Super Admin state aur rollback/backup plan verify karein.
6. Call Performance, weekly source data, quiz seed, projects aur ACW ke SQL files alag features ke liye hain. Sirf wahi statements apply karein jo deployed Worker code aur target environment ke schema se match karte hon.
7. Migration ke baad Super Admin assignment sirf owner-approved, independently verified account par karein. Employee IDs ya credentials ko documentation, chat ya public logs mein hardcode na karein.

## Super Admin account assignment — approval required

Kisi account ko Super Admin banane se pehle owner ki explicit approval, Employee ID ki independent verification, aur existing Super Admin uniqueness check zaroori hai. Account identifier ko is document ya shared logs mein hardcode na karein.

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

- Is checklist se current production deployment status establish nahi hota.
- GitHub merge status, Cloudflare Worker version, Pages deployment aur D1 applied-migration history ko deployment ke waqt verify karein.

Live deployment tabhi karein jab backup, hash format aur Super Admin account confirmation complete ho jaaye.


## Weekly Data Upload — Super Admin only

- Admin Workspace ke Super Admin view mein `Weekly Data Upload` entry point hai.
- Attendance aur Disposition ke liye separate dataset selection, workbook preview, validation, import history aur import-level delete controls hain.
- Source column labels aur displayed cell values JSON rows mein preserve kiye jaate hain; source workbooks ko modify nahi kiya jaata.
- Exact same workbook fingerprint dobara import nahi hota. Disposition rows ka category sum `Total Calls` se match hona zaroori hai.
- Upload, list, rows aur delete endpoints server-side `is_super_admin` check enforce karte hain. Admin/Agent roles cannot upload or delete.
- `008_weekly_source_data.sql` sirf `weekly_source_imports` aur `weekly_source_rows` create karta hai. Existing Attendance, KPI aur Call Performance tables untouched hain.
- Live deployment se pehle D1 backup lein, migration 008 apply karein, Worker deploy karein, phir Pages branch publish karein. Ye steps abhi perform nahi kiye gaye.
