# Onboarding — LeadClient (למפתחים)

## הרצה מקומית
```bash
cp .env.example .env      # ערוך פרטי MySQL
npm install
npm run db:migrate        # יוצר סכימה (דורש MySQL)
npm run db:seed           # טוען נתוני דוגמה
# צור admin: node db/etl/make-admin.js  → הרץ db/seed-admin.sql
npm run dev               # server:4000 + client:5173
```

## מבנה
- `server/` — Express API. הליבה: `db/scope.js` (בידוד רב-דיירי), `db/pool.js`, `routes/*`.
- `client/` — React (Vite). `App.jsx` router, `components/Layout.jsx`, `pages/*`, `api.js`.
- `db/` — `schema.sql`, `etl/` (ETL מהדאמפ), `seed.sql`.
- `docs/` — ARCHITECTURE, DEPLOYMENT, OPERATIONS, INTEGRATIONS-BACKLOG.

## כללי זהב
1. **כל query עסקי עובר דרך scope** (`companyScope`/`agencyScope`/`canAccessCompany`). ראו `docs/ARCHITECTURE.md`.
2. router חדש? הוסף ל-`routes/index.js` + ודא scope + `requireAuth` (טסט `isolation-guard` יאכוף).
3. `npm --workspace server run test` ו-`npm run build` חייבים לעבור לפני commit.

## בדיקות
- `npm --workspace server run test` — scope + isolation-guard + integrations (15 טסטים).
- `npx eslint .` — 0 errors.
