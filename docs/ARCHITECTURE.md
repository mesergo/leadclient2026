# ארכיטקטורה — LeadClient

## סקירה
מערכת SaaS רב-דיירית. שלוש שכבות: React (client) → Express API (server) → MySQL.

```
[React/Vite] --HTTP+JWT--> [Express API] --mysql2--> [MySQL/MariaDB]
```

## היררכיית דיירות (Tenancy)
```
agency → company → { services(ערוצים), users, leads, contacts, ... }
```
כל ישות עסקית משויכת ל-company (ודרכו ל-agency).

## ⚠️ בידוד רב-דיירי — הכלל הקריטי ביותר

**ל-MySQL אין Row-Level Security כמו Postgres.** לכן הבידוד נאכף **ברמת האפליקציה**:

1. כל בקשה מאומתת מייצרת `req.user` = `{ id, role, company_id, agency_id }` מתוך ה-JWT.
2. **כל שאילתה עסקית חייבת לעבור דרך `withScope(req.user, ...)`** — helper שמזריק את תנאי הסינון המתאים לפי התפקיד:

| תפקיד | היקף נראות |
|---|---|
| `super_admin` | הכל |
| `agency_admin` | רק החברות תחת `agency_id` שלו |
| `company_admin` / `company_user` | רק `company_id` שלו |

3. **אסור** להריץ שאילתה עסקית "עירומה" בלי scope. code review + טסטים חוסמים זאת.
4. פעולות כתיבה (INSERT/UPDATE/DELETE) מאמתות שה-`company_id`/`agency_id` של היעד נמצא בהיקף המשתמש — **לפני** הכתיבה.

## שכבות הקוד (server)
```
src/
  config/       טעינת env, קבועים
  db/           pool מול MySQL + withScope helper
  middleware/   requireAuth, requireRole, error handler
  routes/       endpoint לכל דומיין
  services/     לוגיקה עסקית + adapters לאינטגרציות (mock בשלב זה)
  utils/        עזרי המרה, ולידציה
```

## אימות (Auth)
- סיסמאות: `bcrypt`. טוקנים: JWT (7 ימים; impersonation = 1 שעה).
- תפקיד נגזר מ-`users.group` (מיפוי מספרי → תפקיד).

## מונחים (מ-DB המקורי)
- "ערוץ" = טבלת `services`.
- השעיה = `banned` + `banned_time` (Unix timestamp, לא בוליאני).
- Public tokens להטמעה = `company_hash` / `services.unique_hash`.
- תאריכים במקור = Unix `int` — מומרים ל-`DATETIME` ב-ETL.

## אינטגרציות
מאחורי interface מוחלף (adapters). בשלב הנוכחי: mock/noop בלבד (שמירת הגדרות, בלי קריאות חוץ).
IVR · iCount · MesserGO(SMS) · WhatsApp · Smoove.

## פריסה
cPanel: "Setup Node.js App" (Passenger) ל-API, build של React ל-public_html, `.htaccess` proxy ל-`/api`. ראו `docs/DEPLOYMENT.md` (ייכתב בשלב 10).
