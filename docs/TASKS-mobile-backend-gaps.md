# משימות שרת — חוסרים לאפליקציית המובייל (אנדרואיד)

מסמך משימות לצוות שיטפל בחוסרי ה-API הנדרשים לאפליקציית המובייל.
האפליקציה צורכת את ה-API הקיים של **leadclient2026** כמו שהוא; כל המשימות כאן הן **צד שרת** באותו repo.

## קונבנציות עבודה (חובה)
- **קומיט נפרד לכל סעיף** (לפי בקשת המשתמש). הודעת קומיט ברורה באנגלית.
- לסיים כל הודעת קומיט ב: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (אם נעשה דרך Claude Code).
- **ה-DB החי = read-only.** לא לשנות נתוני פרודקשן.
- `db/localhost.sql` מכיל PII אמיתי — **gitignored, לא להעלות ל-GitHub**.
- מיגרציות סכימה: דרך `server/src/db/init.js` → `ensureSchema()` עם `safe()` + `ensureColumn()` (בדיקת `information_schema` לפני ALTER). להוסיף גם ל-`db/schema.sql`.
- לבדוק מקומית מול MySQL 3307 (admin/admin1234), API 4000.

---

## עדיפות גבוהה

### 1. Push כשהאפליקציה סגורה (FCM)
**מצב נוכחי:** `server/src/services/notify.js` שולח Web Push של הדפדפן בלבד (`web-push`). האפליקציה מקבלת התראות רק כשפתוחה (polling `/api/notifications` כל 30ש').
`DEFAULTS = { app, browser, sms }`; `notifyUser({...leadId})` כבר מעביר `leadId`; `payload.url = /leads/${leadId}`.

**לבצע:**
- טבלה `device_tokens`: `user_id`, `token`, `platform`, `created_at`. אילוץ **UNIQUE על token**.
- נתיבים: `POST /api/notifications/device` (רישום טוקן), `DELETE /api/notifications/device` (הסרה).
- ב-`notify.js`: הוספת שליחת FCM לצד `sendPush` הקיים. **מחיקה אוטומטית של טוקנים לא תקפים** (UNREGISTERED/InvalidRegistration).
- ב-payload לשלוח `leadId` **כמספר** (לא רק URL), כדי שלחיצה על ההתראה תפתח את הליד.
- להוסיף ערוץ העדפה **`mobile`** ב-`channelsFor`/`DEFAULTS`, בנפרד מ-`browser`.

**תלוי בך/devops:** פרויקט **Firebase** + **service account JSON** בשרת (env). בלי זה אי אפשר לסגור.
**Acceptance:** טוקן נרשם; התראה מגיעה לאפליקציה סגורה; לחיצה פותחת את הליד הנכון; טוקן פג נמחק אוטומטית.

### 2. קישור חיוג יוצא לליד קיים
**מצב נוכחי:** `POST /api/callbacks` (`server/src/routes/callbacks.js`) מקבל `from_number, via_number, target_number` בלבד — **לא** `lead_id`. לכן חיוג מכרטיס ליד קיים יוצר ליד `call_out` חדש.
> **טוב לדעת:** העמודה `callbacks.lead_id` **כבר קיימת** וה-webhook כבר קורא/כותב אותה (`server/src/routes/public.js` ~שורות 269, 289). **אין צורך ב-migration** — רק לחווט את הפרמטר ואת לוגיקת העדכון.

**לבצע:**
- ב-`callbacks.js` POST: לקבל `lead_id` אופציונלי ולשמור ב-INSERT ל-`callbacks`.
- ב-`public.js` webhook (`POST /api/public/call`): כש-`cb.lead_id` קיים — **לעדכן את הליד הזה** (recording_url, call_status, שורת היסטוריה ב-lead_info) במקום ה-INSERT של ליד `call_out` חדש (כרגע ~שורה 285).
**Acceptance:** חיוג מכרטיס ליד קיים → ההקלטה וה-call_status נרשמים על **הליד המקורי**, לא נוצר ליד כפול.

### 3. סינון "הלידים שלי"
**מצב נוכחי:** `GET /api/leads` (`routes/leads.js:31`) — אין סינון לפי נציג. יש `extra` (בניית WHERE) כנקודת הרחבה. השדה הרלוונטי: `l.current_agent_id`.
**לבצע:** פרמטר `mine=1` (→ `current_agent_id = req.user.id`), או `agent_id=<n>`, וגם `unassigned=1` (→ `current_agent_id IS NULL`).
**Acceptance:** כל אחד מהפרמטרים מצמצם נכון; בלעדיהם התנהגות כמו היום.

### 4. עימוד ברשימת הלידים
**מצב נוכחי:** `routes/leads.js:56` — `ORDER BY l.created_at DESC LIMIT 500`, בלי עימוד/total/מיון לבחירה.
**לבצע:** עימוד `limit`/`offset` (או cursor), והחזרת `total`. רצוי `updated_since` (סינון `l.updated_at > ?`) כדי שהאפליקציה תרענן רק לידים שהשתנו.
**Acceptance:** עימוד עובד, `total` נכון, `updated_since` מחזיר רק שינויים.

---

## עדיפות בינונית

### 5. הפעלת החיוג בפרודקשן *(devops — לא קוד)*
לוודא ב-Coolify: `MASKYOO_TOKEN` + `APP_URL` נכונים; לנציגים יש מספר וירטואלי משויך + נייד בפרופיל. **Redeploy** (גם כדי להעלות את מחזור הערוצים האחרון — ראו `HANDOFF-2026-10-channels-telephony.md`).

### 6. תזכורות
**מצב נוכחי:** `GET /api/reminders` מחזיר את כל תזכורות החברה (עד 200), בלי סינון. אין סימון "בוצעה" — מוחקים ב-DELETE.
**באג מאומת:** `POST /api/leads/:id/reminders` (`routes/leads.js:183`) **לא** ממלא `reminders.lead_name`, בניגוד ל-`POST /api/reminders` (`routes/reminders.js:25` שכן ממלא).
**לבצע:**
- סינון ב-GET: `mine=1` (לפי user) + טווח תאריכים.
- שדה `done_at` + `PATCH /api/reminders/:id` (סימון בוצעה, שמירת היסטוריה במקום מחיקה).
- תיקון הבאג: למלא `lead_name` גם ב-`POST /api/leads/:id/reminders`.

### 7. תוקף התחברות
**מצב נוכחי:** `services/authService.js:13` — `jwt.sign(..., { expiresIn: extra.expiresIn || config.jwt.expiresIn })` (ברירת מחדל 7 ימים). אין refresh token → אחרי שבוע הנציג נזרק.
**לבצע:** refresh token, **או** תוקף ארוך יותר לטוקנים שמונפקים למובייל (קל: להעביר `extra.expiresIn` ארוך בהנפקה למובייל).

### 8. כניסה עם Google מהמובייל
**מצב נוכחי:** `services/googleAuth.js:11` — `verifyIdToken({ audience: config.google.clientId })` — audience יחיד (client ID של הווב).
**לבצע:** לקבל **מערך** audiences כולל ה-client ID של אנדרואיד.
**תלוי בך:** ה-Android client ID.

---

## עדיפות נמוכה / לידיעה

### 9. סטטוס נציגים
`last_seen_at` / `current_status` לא מתעדכנים באף מקום בשרת → "מחוברים עכשיו"/"בשיחה" בדשבורד מציגים נתונים ישנים. אם רוצים זמינות נציגים — לעדכן שדות אלה (heartbeat מהאפליקציה + עדכון ב-webhook שיחה).

### 10. הרשאות נציגים (אכיפה בשרת)
כל `company_user` רואה/עורך את כל לידי החברה ומקבל התראה על כל ליד חדש. אם רוצים שנציג יראה רק את שלו — **האכיפה חייבת להיות בשרת** (לא רק סינון UI), כולל ב-`notifyCompany`.

### 11. שליחת הודעות (וואטסאפ / SMS)
**ממתין להחלטת מוצר.** כרגע `services/integrations` = MOCK.

---

> **הערת סיכום:** רק סעיפים **1** ו-**2** משנים את חוויית הנציג באופן מורגש. השאר שיפורים.
> תלויות חיצוניות שחוסמות: Firebase (סעיף 1), Android client ID (סעיף 8), החלטת מוצר (סעיף 11), devops+Redeploy (סעיף 5).
