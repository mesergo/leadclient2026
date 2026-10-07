# משימות שרת — חוסרים לאפליקציית המובייל (אנדרואיד)

מסמך משימות לצוות שיטפל בחוסרי ה-API הנדרשים לאפליקציית המובייל.
האפליקציה צורכת את ה-API הקיים של **leadclient2026** כמו שהוא; כל המשימות כאן הן **צד שרת** באותו repo.

## קונבנציות עבודה (חובה)
- **קומיט נפרד לכל סעיף** (לפי בקשת המשתמש). הודעת קומיט ברורה באנגלית.
- לסיים כל הודעת קומיט ב: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (אם נעשה דרך Claude Code).
- **ה-DB החי = read-only.** לא לשנות נתוני פרודקשן.
- `db/localhost.sql` מכיל PII אמיתי — **gitignored, לא להעלות ל-GitHub**.
- מיגרציות סכימה: דרך `server/src/db/init.js` → `ensureSchema()` עם `safe()` + `ensureColumn()` (בדיקת `information_schema` לפני ALTER). להוסיף גם ל-`db/schema.sql`.
- לבדוק מקומית מול MySQL 3307 (admin/admin1234), API 4000.
- ⚠️ **אסור להריץ `db/demo-seed.js` מול ה-DB המקומי (3307)** — הסקריפט עושה TRUNCATE לכל הטבלאות. לבדיקות עם נתוני דמו: MySQL נפרד על פורט אחר (למשל 3317).
- **החוזים (שמות פרמטרים/שדות) בכל סעיף מחייבים** — האפליקציה נכתבת מולם. שינוי חוזה = לתאם קודם.

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

**חוזה:**
- `POST /api/notifications/device` — גוף `{ token: string, platform: "android" | "ios" }` → `{ ok: true }` (upsert לפי token; אם הטוקן היה של משתמש אחר — מעבירים אותו למשתמש הנוכחי).
- `DELETE /api/notifications/device` — גוף `{ token }` → `{ ok: true }` (האפליקציה קוראת בזמן יציאה מהחשבון).
- payload של ההתראה (FCM `data`, כל הערכים מחרוזות לפי דרישת FCM): `{ type: "new_lead" | "reminder_due" | "status_change" | "lead_message", leadId: "<id>" }` + `notification: { title, body }`. ערוץ Android: `leads`.

**תלוי בך/devops:** פרויקט **Firebase** + **service account JSON** בשרת (env). בלי זה אי אפשר לסגור.
**Acceptance:** טוקן נרשם; התראה מגיעה לאפליקציה סגורה; לחיצה פותחת את הליד הנכון; טוקן פג נמחק אוטומטית.

### 2. קישור חיוג יוצא לליד קיים
**מצב נוכחי:** `POST /api/callbacks` (`server/src/routes/callbacks.js`) מקבל `from_number, via_number, target_number` בלבד — **לא** `lead_id`. לכן חיוג מכרטיס ליד קיים יוצר ליד `call_out` חדש.
> **טוב לדעת:** העמודה `callbacks.lead_id` **כבר קיימת** וה-webhook כבר קורא/כותב אותה (`server/src/routes/public.js` ~שורות 269, 289). **אין צורך ב-migration** — רק לחווט את הפרמטר ואת לוגיקת העדכון.

**לבצע:**
- ב-`callbacks.js` POST: לקבל `lead_id` אופציונלי ולשמור ב-INSERT ל-`callbacks`.
- ב-`public.js` webhook (`POST /api/public/call`): כש-`cb.lead_id` קיים — **לעדכן את הליד הזה** (recording_url, call_status, שורת היסטוריה ב-lead_info) במקום ה-INSERT של ליד `call_out` חדש (כרגע ~שורה 285).
**חוזה:** `POST /api/callbacks` — גוף `{ from_number, via_number, target_number, lead_id?: number }`. אם `lead_id` נשלח — לוודא שהליד שייך לחברה של המשתמש (אחרת 403). בלי `lead_id` — התנהגות כמו היום.
**Acceptance:** חיוג מכרטיס ליד קיים → ההקלטה וה-call_status נרשמים על **הליד המקורי**, לא נוצר ליד כפול.

### 3. סינון "הלידים שלי"
**מצב נוכחי:** `GET /api/leads` (`routes/leads.js:31`) — אין סינון לפי נציג. יש `extra` (בניית WHERE) כנקודת הרחבה. השדה הרלוונטי: `l.current_agent_id`.
**לבצע (חוזה — שלושתם):** `mine=1` (→ `current_agent_id = req.user.id`), `unassigned=1` (→ `current_agent_id IS NULL`), `agent_id=<n>`.
**Acceptance:** כל אחד מהפרמטרים מצמצם נכון; בלעדיהם התנהגות כמו היום.

### 4. עימוד ברשימת הלידים
**מצב נוכחי:** `routes/leads.js:56` — `ORDER BY l.created_at DESC LIMIT 500`, בלי עימוד/total/מיון לבחירה.
**לבצע (חוזה):**
- `limit` (ברירת מחדל 500, מקסימום 500) + `offset` (ברירת מחדל 0).
- תשובה: `{ leads, total }` — `total` = מספר כל הלידים שעונים לסינון (בלי limit). **לא לשבור את הווב:** `leads` נשאר באותו מבנה.
- `updated_since=YYYY-MM-DD HH:MM:SS` → `l.updated_at > ?` (לוודא ש-`updated_at` מתעדכן בכל PATCH/הערה/תגית/תזכורת על הליד).
**Acceptance:** עימוד עובד, `total` נכון, `updated_since` מחזיר רק שינויים.

---

## עדיפות בינונית

### 5. הפעלת החיוג בפרודקשן *(devops — לא קוד)*
לוודא ב-Coolify: `MASKYOO_TOKEN` + `APP_URL` נכונים; לנציגים יש מספר וירטואלי משויך + נייד בפרופיל. **Redeploy** (גם כדי להעלות את מחזור הערוצים האחרון — ראו `HANDOFF-2026-10-channels-telephony.md`).

### 6. תזכורות
**מצב נוכחי:** `GET /api/reminders` מחזיר את כל תזכורות החברה (עד 200), בלי סינון. אין סימון "בוצעה" — מוחקים ב-DELETE.
**באג מאומת:** `POST /api/leads/:id/reminders` (`routes/leads.js:183`) **לא** ממלא `reminders.lead_name`, בניגוד ל-`POST /api/reminders` (`routes/reminders.js:25` שכן ממלא).
**לבצע:**
- סינון ב-GET (חוזה): `GET /api/reminders?mine=1&from=YYYY-MM-DD&to=YYYY-MM-DD`. ברירת מחדל: **לא מחזיר תזכורות שבוצעו**, אלא אם `include_done=1`.
- שדה `done_at` (DATETIME NULL) + `PATCH /api/reminders/:id` עם `{ done: true }` (או `false` לביטול) → `{ ok: true }`. להחזיר `done_at` בתשובות ה-GET. DELETE נשאר.
- תזכורת שסומנה כבוצעה לא נשלחת ע"י `reminderPoller`.
- תיקון הבאג: למלא `lead_name` גם ב-`POST /api/leads/:id/reminders`.

### 7. תוקף התחברות
**מצב נוכחי:** `services/authService.js:13` — `jwt.sign(..., { expiresIn: extra.expiresIn || config.jwt.expiresIn })` (ברירת מחדל 7 ימים). אין refresh token → אחרי שבוע הנציג נזרק.
**לבצע (חוזה):** האפליקציה שולחת `client: "mobile"` בגוף הבקשה בכל נתיבי הכניסה: `POST /api/auth/login`, `/api/auth/phone/verify`, `/api/auth/google`. רק כשהשדה הזה קיים — להנפיק טוקן ארוך (90 יום, `MOBILE_JWT_EXPIRES_IN` ב-env). בלעדיו — כמו היום.
> **שים לב:** `issueToken(user, extra)` פורס את `extra` לתוך ה-payload — אם מעבירים `expiresIn` דרך `extra` הוא ייכנס גם לתוכן הטוקן. עדיף פרמטר שלישי נפרד: `issueToken(user, extra, { expiresIn })`.

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

### 12. עדכון `last_interaction_at` / `last_interaction_type`
**מצב נוכחי (מאומת):** השרת החדש **אף פעם לא כותב** את השדות האלה — הם מתמלאים רק ב-ETL מהמערכת הישנה. לכן ליד שטופל (הערה/טיפול/הודעה/שיחה) נראה "לא טופל", ו-`last_interaction_*` ברשימה תקוע על ערכי המיגרציה.
**לבצע:** לעדכן `last_interaction_at = NOW()` + `last_interaction_type` (`note` / `treatment` / `sms` / `whatsapp` / `email` / `call` / `call_out`) ב:
`POST /api/leads/:id/notes`, `/treatment`, `/message` (`routes/leads.js`), וב-webhook השיחה (`routes/public.js`) כשמתקבלת שיחה על ליד קיים.
**Acceptance:** אחרי הערה/טיפול/שיחה — `GET /api/leads` מחזיר `last_interaction_at` עדכני והסוג הנכון.
> האפליקציה משתמשת בזה לסינון "לא טופלו" (אין נציג + אין אינטראקציה).

### 11. שליחת הודעות (וואטסאפ / SMS)
**ממתין להחלטת מוצר.** כרגע `services/integrations` = MOCK.

---

> **הערת סיכום:** רק סעיפים **1** ו-**2** משנים את חוויית הנציג באופן מורגש. השאר שיפורים.
> תלויות חיצוניות שחוסמות: Firebase (סעיף 1), Android client ID (סעיף 8), החלטת מוצר (סעיף 11), devops+Redeploy (סעיף 5).
