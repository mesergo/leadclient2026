# פריסה ל-cPanel — LeadClient

> המערכת נפרסת כ**אפליקציית Node אחת** שמגישה גם את ה-API וגם את ה-client הבנוי (SPA).
> אין צורך ב-proxy או ב-.htaccess מורכב — אפליקציית ה-Node היא כל האתר.

## דרישות מוקדמות
- cPanel עם **"Setup Node.js App"** (Phusion Passenger) — Node 18+.
- גישה ל-**MySQL** דרך cPanel (MySQL Databases + phpMyAdmin).
- דומיין/תת-דומיין (למשל `app.yourdomain.com`).

## שלב 1 — מסד הנתונים
1. cPanel → **MySQL Databases** → צור DB (למשל `cpuser_leadclient`) + user + סיסמה, ושייך את ה-user ל-DB עם **ALL PRIVILEGES**.
2. cPanel → **phpMyAdmin** → בחר את ה-DB → לשונית **Import** → העלה את `db/schema.sql` והרץ.
3. ייבא נתונים: העלה את `db/seed.sql` (נתוני דוגמה) ואז `db/seed-admin.sql` (משתמש admin).
   - חלופה דרך SSH: `mysql -u USER -p DBNAME < db/schema.sql` וכו'.

## שלב 2 — העלאת הקוד
1. העלה את תיקיית הפרויקט (בלי `node_modules`) ל-`/home/cpuser/leadclient-app` (File Manager / Git / rsync).
2. צור קובץ `.env` בשורש לפי `.env.production.example` עם פרטי ה-DB וה-`JWT_SECRET` שלך.
   - `UPLOAD_DIR` — נתיב **מחוץ ל-public_html** (למשל `/home/cpuser/leadclient-uploads`), צור אותו.

## שלב 3 — בניית ה-client
דרך SSH (או Terminal ב-cPanel):
```bash
cd ~/leadclient-app
npm install
npm run build          # בונה client/dist (VITE_API_URL ריק = same-origin /api)
```

## שלב 4 — אפליקציית Node
cPanel → **Setup Node.js App** → **Create Application**:
- **Node version:** 18+.
- **Application mode:** Production.
- **Application root:** `leadclient-app`.
- **Application URL:** הדומיין/תת-הדומיין.
- **Application startup file:** `server/app.js`.
- **Environment variables:** הוסף את המשתנים מ-`.env` (או ודא שהאפליקציה טוענת את `.env`).
- לחץ **Create**, ואז **Run NPM Install**, ואז **Restart**.

Passenger מזריק `PORT` — האפליקציה מאזינה עליו אוטומטית (`config.port`).

## שלב 5 — HTTPS ודומיין
1. cPanel → **SSL/TLS Status** → הפעל **AutoSSL** לדומיין.
2. ודא הפניה ל-HTTPS (cPanel → Domains → Force HTTPS Redirect).

## שלב 6 — בדיקת עשן
- `https://app.yourdomain.com/api/health` → `{"ok":true}`.
- טען את הדף → מסך התחברות.
- התחבר עם `admin` / (הסיסמה מ-`db/seed-admin.sql`, ברירת מחדל `admin1234`) → **שנה מיד את הסיסמה** במסך הפרופיל.
- ודא שהדשבורד מציג נתונים.

## עדכונים עתידיים
```bash
cd ~/leadclient-app && git pull && npm install && npm run build
# cPanel → Setup Node.js App → Restart
```

## הערות אבטחה
- **שנה את `JWT_SECRET`** למחרוזת אקראית ארוכה.
- **שנה את סיסמת ה-admin** אחרי הכניסה הראשונה.
- ה-DB user לא צריך הרשאות superuser — CRUD מספיק.
- `UPLOAD_DIR` מחוץ ל-web root; קבצים מוגשים דרך `/uploads` בלבד.

## אם מפרידים client מ-API (אופציונלי)
אם בכל זאת רוצים להגיש את ה-client דרך Apache/public_html בנפרד:
- העלה את `client/dist/` ל-`public_html`.
- הוסף `public_html/.htaccess` (ראו `deploy/htaccess-spa.txt`) ל-SPA fallback + proxy של `/api` לאפליקציית ה-Node.
- בנה עם `VITE_API_URL=https://app.yourdomain.com`.
