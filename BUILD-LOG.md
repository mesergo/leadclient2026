# יומן בנייה — LeadClient

מעקב אוטונומי אחר ביצוע `PROJECT-ROADMAP.md`. כל שלב: מה בוצע · מה אומת · ממצאים.

## סביבה
- Node.js v24 · npm workspaces (server+client).
- **אין MySQL/Docker מקומי** → אימות DB בשלב זה: parser סטטי (MySQL dialect) + בדיקות לוגיקה ב-Node. הרצה מול MySQL אמיתי תתבצע בשרת היעד (cPanel) — מתועד בשלב 10.

---

## שלב 1 — יסודות ✅
**בוצע:** monorepo (server/client/db/docs), package.json workspaces, .env.example, .gitignore, eslint/prettier/editorconfig, שלד Express + /api/health, שלד React+Vite (RTL), docs/ARCHITECTURE.md (כלל הבידוד).
**אומת:** `npm install` תקין (296 חבילות, multer 2.x); server מחזיר `{"ok":true,"service":"leadclient-api"}` על פורט 4000; client build נקי; git aותחל.
**ממצאים:** פורט 4000 היה תפוס ע"י שרת ישן — נסגר, החדש רץ עליו.

## שלב 2 — סכימת MySQL ✅
**בוצע:** `db/schema.sql` — **30 טבלאות** (InnoDB, utf8mb4) מקובצות לדומיינים: tenancy (agencies/companies/services), טלפוניה (phone_numbers מאוחד + special_redirects), users/invitations/user_restrictions, lead_statuses, tags, contacts (+conversations+tags), leads (+lead_tags+conversations+reminders), message_templates, billing (payment_packages/plans/billing_defaults/bills/payments/package_history/sms_records), monthly_reports+action_log, notifications, languages+translation_strings. כל טבלה עם `legacy_id` לגישור ETL. `db/migrate.js` runner מול mysql2. `db/verify-schema.js` verifier.

**אומת (סטטי — אין MySQL מקומי):**
- `node db/verify-schema.js` → 30 טבלאות parse נקי (node-sql-parser, MySQL dialect), אפס כפילויות טבלה/עמודה, **כל 28 ה-FK targets נפתרים**.
- **הצלבת כיסוי מול 40 טבלאות legacy:** 36 ממופות, 4 נזרקו בכוונה (blocked_emails, contacts_logs, leads_logs → action_log; wa_messages → מחוץ להיקף), **0 לא-ממופות**.

**החלטות עיצוב:** DATETIME במקום Unix int · איחוד 4 טבלאות IVR ל-`phone_numbers` עם `ivr_provider` · `group`→`role` enum · public tokens כ-`public_token`/`public_hash` · תגיות מאוחדות לטבלת `tags` אחת (לידים+אנשי קשר).

**ממצאים:** heredoc גדול נכשל (מגבלת אורך) — פוצל לחלקים; באג ב-verifier (השמטת chunks שמתחילים בהערה) — תוקן. אין בעיות סכימה בפועל.

## שלב 3 — ETL מהדאמפ ✅
**בוצע:** `db/etl/parse-dump.js` (parser ל-mysqldump מבוסס char-codes), `db/etl/etl.js` (ETL config-driven ל-29 טבלאות יעד), `db/etl/verify-seed.js` (בודק כפילויות PK + שלמות התייחסותית), `db/seed.js` runner, ו-`db/seed.sql` (673KB, 4273 שורות).
**אסטרטגיה:** שימור מזהי legacy כ-PK → כל ה-FK נשמרים בלי remapping. המרות: Unix→DATETIME, `group`→`role` enum, `use_ivr`→`ivr_provider`, איחוד 4 טבלאות IVR ל-`phone_numbers`, `banned`→`is_active`/`suspended_at`.

**נתונים שהופקו (אחרי ניקוי):** agencies 5 · companies 53 · services 25 · users 25 · lead_statuses 349 · tags 27 · leads 972 · lead_conversations 407 · contacts 139 · message_templates 164 · action_log 1733 · ועוד. סה"כ ~5,900 שורות.

**אומת:**
- `node db/etl/verify-seed.js` → **0 כפילויות PK, 0 orphan FK** על פני כל 16 יחסי ה-FK שנבדקו.
- הדאמפ הוא **חלקי** (dev) → הרצה ראשונה חשפה 11 בעיות שלמות: תוקנו ע"י pass ניקוי — null ל-FK אופציונליים יתומים, drop לשורות NOT-NULL/junction יתומות (בסדר תלויות). דוגמאות: nulled 948 leads.current_agent_id, dropped 276 lead_tags (tag יתום), fixed billing_defaults dup-PK.

**ממצאים:** heredoc נכשל על קובץ JS גדול → אימצתי דפוס: כתיבה ל-scratchpad (ASCII) ב-Write ואז `cp` לפרויקט (עוקף מגבלת אורך + סיכון נתיב עברי). escaping ב-charCodes למניעת בעיות backslash ב-heredoc.
**פתוח לשלב 4:** סיסמאות legacy הן MD5-crypt (`$1$…`) — לא תואמות bcrypt. יווצר משתמש admin עם bcrypt ב-seed נפרד בשלב האימות.

## שלב 4 — ליבת Backend ✅
**בוצע:** `config/index.js` (env), `db/scope.js` (**לוגיקת בידוד טהורה**: companyScope/agencyScope/canAccessCompany), `db/pool.js` (mysql2 pool + query + scoped helper), `middleware/auth.js` (requireAuth/requireRole, JWT), `middleware/error.js` (notFound/errorHandler שלא מדליף), `services/uploads.js` (multer), `services/authService.js` (issueToken), `routes/auth.js` (login bcrypt + /me), `index.js` מחווט (cors, rate-limit על login, static uploads, health, error handlers), `server/test/scope.test.js`, `db/etl/make-admin.js` → `db/seed-admin.sql` (משתמש bcrypt: admin/admin1234, כי סיסמאות legacy הן MD5).

**אומת:**
- **טסטי בידוד: 7/7 עוברים** (`npm --workspace server run test`) — super_admin רואה הכל; company_user מוגבל לחברה שלו; agency_admin דרך subquery; role לא מוכר → `0=1`; cross-tenant: חברה A לא יכולה לכוון לחברה B, params לעולם לא מדליפים id של חברה אחרת.
- בדיקות endpoint חיות: health→200, `/auth/me` בלי טוקן→**401**, login ריק→**400**, route API לא מוכר→**404**, login עם פרטים→500 (ECONNREFUSED:3306, **צפוי** — אין MySQL מקומי; נתיב ה-DB תקין ומטופל נקי בלי הדלפה).

**ממצאים:** bcryptjs מורם ל-root node_modules (workspaces) — תוקן require. `node --test` על תיקייה נכשל; glob `test/*.test.js` עובד.

## שלב 5 — Backend דומיינים ✅
**בוצע:** 20 routers תחת `server/src/routes/` + `routes/index.js` (registry): agencies, companies, services(ערוצים), statuses, tags, users, leads, contacts, reminders, templates, files, dashboard, reports, billing, virtual, profile, notifications, languages, import, public(widget). `utils/http.js` (asyncHandler). כל router צמוד ל-`companyScope`/`agencyScope`/`canAccessCompany` — אין query עסקי בלי scope. הוספה `company_files` לסכימה (31 טבלאות).

**נקודות מפתח:** leads (רשימה מסוננת + כרטיס + הערות + תגיות), companies (CRUD+לוגו+impersonate), reminders (scope דרך ה-lead), templates (פר-סוכנות), public (קליטת ליד ל-widget לפי service hash / company token), dashboard (KPIs + action_log), reports (פילוח ערוץ×סטטוס).

**אומת:**
- **טעינת האפליקציה המלאה** (`require index.js`) — כל 20 ה-routers נטענים נקי, אפס שגיאות תחביר/חיווט.
- **13 endpoints מאומתים → 401** (routing + אכיפת auth תקינים, לא 404).
- `verify-schema.js` → 31 טבלאות, כל 29 FK נפתרים.
- קליטת ליד public → מגיעה לשכבת ה-DB (500 = אין MySQL, צפוי).

**ממצא:** files.js הפנה ל-`company_files` שלא היה בסכימה — נוסף.

## שלב 6 — אינטגרציות (mock) ✅
**בוצע:** `server/src/services/integrations/index.js` — adapters ל-SMS(MesserGO), WhatsApp(dialog360), IVR(native/micropay/paycall/maskyoo), Billing(iCount), Email(Smoove). כולם **mock/noop** — מחזירים `{ok:true, mocked:true}`, שומרים intent, **בלי קריאות חוץ**. נקודת החלפה מתועדת ל-go-live.
**אומת:** `integrations.test.js` 2/2 עוברים — כל adapter מחזיר mocked; `billing.charge` לא מדליף את הטוקן הגולמי.

## שלב 7 — ליבת Frontend + Design System ✅
**בוצע:** `client/src/api.js` (client + uploadForm), `context/AuthContext.jsx` (login/logout/impersonate + localStorage), `App.css` (**design system נאמן**: טורקיז #00838F, 5 צבעי stat-tile ציאן/ירוק/ענבר/ורוד/זהב, טיפוגרפיה Helvetica/Arial 14px, סיידבר RTL מימין, header, breadcrumb, card-grid, טבלאות, טפסים, כפתורים מעוגלים, responsive hamburger <860px), `icons.jsx` (22 אייקוני SVG), `components/Layout.jsx` (ניווט role-based, breadcrumb אוטומטי, mobile nav), `pages/LoginPage.jsx`, `pages/DashboardPage.jsx` (stat tiles + action_log), `App.jsx` (router עם routes מוגנים + role gating), `pages/Placeholder.jsx`.

**אומת:**
- `npm run build` → נקי (38 מודולים, CSS 7.6KB, JS 180KB).
- **צילום מסך של דף ההתחברות** (vite preview + playwright) → RTL תקין, מיתוג טורקיז, כרטיס נקי, עברית — תואם לשפת העיצוב של המקור.

## שלב 8 — Frontend מסכים ✅
**בוצע:** 15 עמודים אמיתיים מחוברים ל-API: Dashboard (stat tiles+פעילות), Agencies (card-grid+CRUD+לוגו), Companies (card-grid+impersonate), CompanyDetail (עריכת פרטים), Leads (טבלה+מסננים), LeadDetail (דירוג כוכבים+הערות+שיחות), Contacts, Users (טבלה+חיפוש), Import (הוספה ידנית), Virtual, Reports (ערוץ×סטטוס), Billing (חבילות+חשבוניות), Language, Profile (שינוי סיסמה), Developers (widget snippet+קודי שגיאה). `App.jsx` מחווט לכל העמודים עם role gating, Placeholder הוסר מהשימוש.
**אומת:** `npm run build` נקי (51 מודולים, JS 203KB). כל 15 קבצי העמודים קיימים ומיובאים.
**ממצא:** שורת no-op שנשארה ב-ImportPage — נוקתה.

## שלב 9 — QA / טסטים ✅
**בוצע:** `isolation-guard.test.js` (**שומר בטיחות סטטי**: כל router עסקי חייב להשתמש ב-companyScope/agencyScope/canAccessCompany + requireAuth; profile/notifications מוגבלים ל-req.user.id), הרחבת `scope.test.js` (edge cases), תיקון קונפיג ESLint (globals ל-node/browser), ניקוי imports לא בשימוש.
**אומת:**
- **15/15 טסטים עוברים** (7 scope + 3 edge + 2 integrations + 3 isolation-guard).
- **ESLint: 0 errors** (אזהרה קוסמטית אחת — זיהוי שימוש ברכיב JSX דורש plugin react).
- `npm run build` (client) נקי.
- שומר הבטיחות עבר → כל 15 ה-routers העסקיים אוכפים scope + auth.
**מגבלה מתועדת:** טסטי אינטגרציה מול DB חי (isolation end-to-end על נתונים אמיתיים) יורצו מול MySQL בשרת היעד — אין MySQL מקומי. לוגיקת הבידוד מכוסה ע"י unit tests + שומר סטטי.

## שלב 10 — ארטיפקטים לפריסה (cPanel) ✅
**בוצע:** עדכון `server/src/index.js` להגשת ה-client הבנוי + SPA fallback (אפליקציית Node אחת = כל האתר, בלי proxy). `server/app.js` (startup file ל-Passenger). `.env.production.example`. `docs/DEPLOYMENT.md` (מדריך מלא: MySQL→schema/seed, העלאת קוד, build, Setup Node.js App, SSL, בדיקת עשן, אבטחה). `deploy/htaccess-spa.txt` (אופציונלי — הפרדת client/API).
**אומת (מקומי):**
- `/api/health` → JSON · `/` → SPA HTML · `/leads` → 200 (SPA fallback עובד ברענון) · `/api/leads` → 401 (ה-API עדיין מוגן, לא נבלע ע"י ה-fallback).
**לא בוצע (במכוון):** פריסה בפועל לשרת — דורשת הרשאות cPanel/MySQL שלך. כל הארטיפקטים מוכנים; עקוב אחרי `docs/DEPLOYMENT.md`.

## שלב 11 — תיעוד ו-Post-Launch ✅
**בוצע:** `server/public/leadclient.js` (widget הטמעה אמיתי — קליטת ליד לפי CH/CO, תואם למסך המפתחים), `docs/OPERATIONS.md` (גיבויי cron, ניטור, שחזור), `docs/INTEGRATIONS-BACKLOG.md` (מה נדרש לכל ספק אמת), `docs/ONBOARDING.md`, עדכון README עם מפת תיעוד.
**אומת:** widget — syntax OK; eslint 0 errors (אחרי החרגת server/public שהוא קוד דפדפן).

---

# ✅ סיכום — כל 11 השלבים הושלמו ואומתו

| שלב | תוצאה |
|---|---|
| 1 יסודות | monorepo, health, build ✓ |
| 2 סכימה | 30+1 טבלאות, כל FK נפתר ✓ |
| 3 ETL | ~5,900 שורות, 0 orphan/dup ✓ |
| 4 ליבת Backend | בידוד + auth, 7 טסטים ✓ |
| 5 דומיינים | 20 routers, כולם scoped ✓ |
| 6 אינטגרציות | 5 mock adapters ✓ |
| 7 ליבת Frontend | design system + login מאומת ✓ |
| 8 מסכים | 15 עמודים, build ✓ |
| 9 QA | 15 טסטים, 0 lint errors ✓ |
| 10 פריסה | אפליקציה אחת מגישה SPA+API ✓ |
| 11 תיעוד | widget + 5 מסמכי docs ✓ |

**בדיקת שער סופית:** tests 15/15 · eslint 0 errors · client build נקי · app load OK · schema valid · seed 0 orphan/dup.
**נותר למשתמש:** הרצה מול MySQL אמיתי + פריסה ל-cPanel לפי `docs/DEPLOYMENT.md` (login: admin/admin1234 — לשנות מיד).
