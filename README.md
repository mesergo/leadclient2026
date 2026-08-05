# LeadClient — מערכת ניהול לידים (בנייה מחדש)

מערכת SaaS רב-דיירית לניהול לידים/פניות. בנייה מחדש נאמנה למערכת המקורית (app.leadclient.net).

## Stack
- **Backend:** Node.js + Express + MySQL/MariaDB (`mysql2`)
- **Frontend:** React + Vite
- **Auth:** JWT + bcrypt
- **בידוד רב-דיירי:** ברמת האפליקציה (ראו `docs/ARCHITECTURE.md`)

## מבנה
```
server/   API (Express)
client/   React (Vite)
db/       סכימה, מיגרציות, ETL, seed
docs/     תיעוד ארכיטקטורה + פריסה
```

## פיתוח מקומי
```bash
cp .env.example .env      # ערוך פרטי DB
npm install
npm run db:migrate
npm run db:seed
npm run dev               # server:4000 + client:5173
```

## מסמכי בסיס
- `../2026cloud/LEGACY-SYSTEM-MAP.md` — מיפוי המערכת המקורית (מבנה+עיצוב+DB)
- `../2026cloud/PROJECT-ROADMAP.md` — תכנית העבודה המלאה

## תיעוד
- `docs/ARCHITECTURE.md` — ארכיטקטורה + כלל הבידוד הרב-דיירי
- `docs/ONBOARDING.md` — התחלה מהירה למפתחים
- `docs/DEPLOYMENT.md` — פריסה ל-cPanel
- `docs/OPERATIONS.md` — גיבויים, ניטור, שחזור
- `docs/INTEGRATIONS-BACKLOG.md` — חיבור ספקי אמת
- `BUILD-LOG.md` — יומן הבנייה (מה בוצע ואומת בכל שלב)
