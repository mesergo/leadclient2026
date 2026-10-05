# התקנת LeadClient על שרת Contabo עם Coolify

מדריך למתקין. הפרויקט נפרס כ**אפליקציית Docker אחת** (שרת Node שמגיש גם את ה-API וגם את ה-client) + **MySQL** מנוהל ב-Coolify. SSL, reverse-proxy ושמירת-חיים — אוטומטי דרך Coolify.

---

## 0. מה צריך לקבל מהלקוח (לפני שמתחילים)

| פריט | פירוט |
|---|---|
| **גישת root לשרת** | IP של ה-Contabo + משתמש root (סיסמה או SSH key) |
| **דומיין / תת-דומיין** | למשל `app.example.com` — עם גישה לניהול ה-DNS שלו |
| **גישה ל-GitHub** | הריפו `https://github.com/mesergo/leadclient2026` (deploy key / הזמנה / טוקן) |
| **קובץ הנתונים** | `localhost.mysql.sql` (ייצוא ה-DB האמיתי, ~620MB, **מכיל מידע אישי — להעביר מאובטח**) |

> אם אין קובץ נתונים — אפשר להעלות מערכת ריקה עם סכמה בלבד (סעיף 5, שלב "ללא נתונים").

---

## 1. דרישות השרת (Contabo)

- Ubuntu 22.04 / 24.04, לפחות **2 vCPU · 4GB RAM · 40GB דיסק**.
- פתוח בחומת האש: פורטים **22** (SSH), **80** + **443** (HTTP/S), **8000** (ממשק Coolify בהתקנה).

## 2. הפניית הדומיין

ב-DNS של הדומיין: רשומת **A** של `app.example.com` → ל-IP של השרת. (לפני המשך — לוודא שה-DNS התעדכן.)

## 3. התקנת Coolify

SSH לשרת כ-root והרץ:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

בסיום: היכנס ל-`http://SERVER_IP:8000`, צור משתמש אדמין ל-Coolify, והגדר את השרת עצמו כ-"localhost server" (ברירת המחדל).

## 4. יצירת מסד MySQL ב-Coolify

1. ב-Coolify: **New Resource → Database → MySQL** (בחר MySQL 8.4).
2. תן שם (למשל `leadclient-db`), והגדר סיסמת root/משתמש. **שמור את הפרטים.**
3. אחרי היצירה, Coolify מציג חיבור פנימי: `host` (שם פנימי כמו `mysql-xxxx`), `port` 3306, user, password.
4. (רשות אך מומלץ) הפעל **Public Port** זמנית כדי לייבא נתונים מרחוק, או ייבא דרך ה-terminal של הקונטיינר (סעיף 5).

## 5. ייבוא הנתונים ל-MySQL

העלה לשרת את 3 הקבצים: `localhost.mysql.sql` (מהלקוח), ו-`db/schema.sql` + `db/etl/prod-migrate.mysql.sql` (מהריפו). נניח שהם ב-`/root/lc/`.

מצא את מזהה קונטיינר ה-MySQL: `docker ps | grep mysql`. ואז:

```bash
# משתנים — התאם לפרטי ה-DB מ-Coolify
DBC=<mysql_container_id>
DBUSER=root
DBPASS=<mysql_root_password>

# 5.1 מסד המקור (לגאסי) — לייבוא ולטרנספורמציה בלבד
docker exec -i $DBC mysql -u$DBUSER -p$DBPASS -e "CREATE DATABASE IF NOT EXISTS app_leadclient_net CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
docker exec -i $DBC mysql -u$DBUSER -p$DBPASS --max_allowed_packet=1G app_leadclient_net < /root/lc/localhost.mysql.sql

# 5.2 מסד האפליקציה + הסכמה
docker exec -i $DBC mysql -u$DBUSER -p$DBPASS -e "CREATE DATABASE IF NOT EXISTS leadclient CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
docker exec -i $DBC mysql -u$DBUSER -p$DBPASS leadclient < /root/lc/schema.sql

# 5.3 טרנספורמציה (ETL) — בונה את leadclient מתוך app_leadclient_net
docker exec -i $DBC mysql -u$DBUSER -p$DBPASS < /root/lc/prod-migrate.mysql.sql

# 5.4 משתמש אדמין לכניסה (admin / admin1234 — יש לשנות אחרי הכניסה הראשונה)
docker exec -i $DBC mysql -u$DBUSER -p$DBPASS leadclient < /root/lc/seed-admin.sql

# 5.5 (רשות) לנקות את מסד המקור אחרי שהטרנספורמציה הצליחה
docker exec -i $DBC mysql -u$DBUSER -p$DBPASS -e "DROP DATABASE app_leadclient_net;"
```

**ללא נתונים (מערכת ריקה):** בצע רק 5.2 + 5.4 (סכמה + אדמין).

> הערה: ה-dump המקורי מ-MariaDB. הגרסה `localhost.mysql.sql` כבר מותאמת ל-MySQL (הוסרו DEFAULT מעמודות TEXT). ה-ETL כאן משתמש ב-`INSERT IGNORE` ובמילים השמורות ``lead``/``user`` עם backticks.

## 6. יצירת האפליקציה ב-Coolify

1. **New Resource → Application → Public/Private Repository** → חבר את הריפו `mesergo/leadclient2026`, ענף `main`.
2. **Build Pack: Dockerfile** (הריפו כולל `Dockerfile` בשורש).
3. **Port:** `4000` (Ports Exposes = 4000).
4. **Domain:** הגדר `https://app.example.com` — Coolify יוציא SSL (Let's Encrypt) אוטומטית.

### משתני סביבה (Environment Variables)

```
NODE_ENV=production
PORT=4000
DB_HOST=<mysql_internal_host_from_coolify>
DB_PORT=3306
DB_USER=<mysql_user>
DB_PASSWORD=<mysql_password>
DB_NAME=leadclient
JWT_SECRET=<מחרוזת אקראית ארוכה — ראה למטה>
UPLOAD_DIR=/app/uploads
VITE_API_URL=
VAPID_PUBLIC_KEY=<ראה למטה>
VAPID_PRIVATE_KEY=<ראה למטה>
VAPID_SUBJECT=mailto:admin@example.com
```

**יצירת JWT_SECRET:** `openssl rand -hex 32`
**יצירת מפתחות VAPID** (פעם אחת): בטרמינל עם node —
```bash
npx -y web-push generate-vapid-keys
```
(מעתיק את ה-public ל-`VAPID_PUBLIC_KEY` ואת ה-private ל-`VAPID_PRIVATE_KEY`.)

### נפח קבוע לקבצים

הוסף **Persistent Storage**: mount ל-`/app/uploads` (כדי שקבצים שהועלו ישרדו דיפלוי מחדש).

## 7. דיפלוי

לחץ **Deploy**. Coolify יבנה את ה-Docker image, יריץ את הקונטיינר, ויחבר דומיין+SSL.

## 8. בדיקת עשן

- `https://app.example.com/api/health` → `{"ok":true}`
- טען את הדף → מסך כניסה → התחבר `admin` / `admin1234`
- **שנה מיד את סיסמת ה-admin** (פרופיל → סיסמה)
- ודא שהדשבורד/לידים מציגים נתונים

## 9. עדכונים עתידיים

push ל-`main` ב-GitHub → ב-Coolify **Deploy** (או הפעל Auto-Deploy / webhook). Coolify בונה מחדש ומחליף בלי downtime.

---

## הערות חשובות

- **התראות דפדפן (Web Push)** עובדות רק עם HTTPS — מסודר אוטומטית ע"י Coolify.
- **SMS** כרגע במצב mock (לא נשלח באמת). חיבור ספק אמיתי (MesserGO) — שלב עתידי.
- **גיבוי DB:** הפעל ב-Coolify גיבוי אוטומטי למסד ה-MySQL (Database → Backups), יומי.
- קובץ הנתונים `localhost.mysql.sql` מכיל מידע אישי — למחוק מהשרת אחרי הייבוא (`rm /root/lc/localhost.mysql.sql`).
