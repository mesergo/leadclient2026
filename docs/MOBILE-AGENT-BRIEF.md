# תדריך לסוכן אפליקציית המובייל — מצב השרת והשינויים האחרונים

**עדכון: 11.10.2026.** מסמך זה משלים את `docs/TASKS-mobile-backend-gaps.md` (מקור האמת למשימות).
כאן: מה השתנה בשרת מאז שהמסמך נכתב (`84d26c7`), מה מזה **משנה חוזה** שהאפליקציה צריכה לכבד, ואיך זה נוגע בסעיפים הפתוחים.

> **תיאום:** אין ערוץ ישיר בין הסשנים. מתאמים דרך ה-repo: `git pull` לפני כל סעיף, קומיט נפרד לכל סעיף, ועדכון הסטטוס ב-TASKS. אם שינוי שלך נוגע בקובץ מהרשימה בסעיף ד' — למשוך קודם, הקבצים האלה השתנו הרבה.
> ⚠️ כל מה שכאן ב-`main`, אבל **בפרודקשן רק אחרי Redeploy**.

---

## א. שינויי חוזה שהאפליקציה חייבת לכבד

### 1. שעון ישראל בכל התאריכים (`d6cc602`)
- כל התאריכים ב-API חוזרים כמחרוזת **`YYYY-MM-DD HH:mm:ss` בשעון ישראל, בלי אזור זמן** (`dateStrings`).
- **באפליקציה:** לפרש כ-`Asia/Jerusalem` — לא כ-UTC ולא לפי שעון המכשיר (מכשיר בחו״ל יציג שעה שגויה אחרת).
- **לשלוח באותו פורמט ובשעון ישראל:** `reminder_at`, ובעתיד `updated_since` (סעיף 4), `from`/`to` בתזכורות (סעיף 6).
- לפני התיקון ה-DB בפרודקשן רץ על UTC: רשומות שנוצרו בפרודקשן **לפני ה-Redeploy** עלולות להיות ~3 שעות מוקדם. לא לנסות לתקן בצד האפליקציה.
- בדיקה: `GET /api/health` מחזיר `time.server_now` ו-`time.db_now` (שניהם בשעון ישראל).

### 2. נציג מוגבל ללידים שלו (`d82fc3f`) — **סעיף 10 בוצע**
- מנהל מסמן למשתמש `company_user` את `users.restrict_own_leads`.
- בשרת: `leadScope()` (`db/scope.js`) + middleware `loadLeadRestriction` (`middleware/auth.js`), נקרא בכל בקשה (שינוי חל מיד, בלי התחברות מחדש).
- **השלכות לאפליקציה:**
  - `GET /api/leads` מחזיר רק לידים עם `current_agent_id = הנציג`.
  - ליד של מישהו אחר: `GET/PATCH /api/leads/:id`, `/notes`, `/treatment`, `/message`, `/reminders`, `/tags`, `/recording` → **404** (לא 403). להציג "אין גישה לליד" ולהסיר מהמטמון המקומי.
  - מסוננים גם: `/api/reminders`, `/api/dashboard/*`, `/api/reports`, רשימת הלידים ב-`/api/contacts/:id`.
  - ליד שהנציג המוגבל יוצר (`POST /api/leads`) משויך אליו אוטומטית.
  - התראות: נציג מוגבל מקבל התראות רק על לידים ששויכו אליו.
  - **אין צורך בסינון צד-לקוח** — אבל גם אין להניח שהרשימה מכילה את כל לידי החברה.

### 3. הקצאת לידים אוטומטית בסבב (`0779d6b`)
- כשבחברה `leads_distribution_enabled=1` ובערוץ נבחרו נציגים (`services.distribute_leads`): ליד חדש מקבל `current_agent_id` לפי התור; פונה חוזר חוזר לאותו נציג; שיחה יוצאת מהחייגן משויכת לנציג שחייג.
- התראה לנציג שקיבל: `new_lead` עם הכותרת **"ליד חדש שויך אליך"**; מנהלי החברה מקבלים `new_lead` רגיל; שאר הנציגים לא מקבלים.
- לכן `mine=1` (סעיף 3) הוא הסינון המרכזי באפליקציה.

### 4. שער חיוב לחברות שנרשמו בעצמן (`8a2ddf9`, `28c79b6` ואילך)
- חברה שנרשמה בהרשמה העצמית מקבלת `companies.billing_status='pending'` וחייבת להגדיר הוראת קבע (iCount) לפני כניסה. **נאכף כרגע רק בממשק הווב** (`BillingGate` ב-`client/src/App.jsx`), לא בשרת.
- **באפליקציה:** אחרי כניסה של `company_admin`/`company_user` — `GET /api/subscription`:
  - `required: true` → לא להיכנס; מסך "יש להשלים הגדרת חיוב באתר" עם קישור ל-`https://app26.leadclient.net` (מנהל החשבון, `can_pay: true`, משלים שם; לנציג: "ממתין למנהל החשבון").
  - `required: false` → כרגיל.
- חברות ותיקות/שנוצרו ע״י אדמין: `billing_status` הוא `NULL` → אף פעם לא חסומות.

### 5. מדיניות סיסמאות, החלפה מאולצת, remember-me (`3c48f98` — שלך)
ללא שינוי מצדי. רק לוודא שזרימת "החלפת סיסמה מאולצת" קיימת גם באפליקציה.

### 6. שדות ליד שהשתנו / נוספו
| שדה | משמעות |
|---|---|
| `call_status` | `active` (בזמן שיחה) / `answered` / `missed`. מ-7.10: שיחה שלא נענתה מסומנת `missed` נכון (קודם סומנו גם הן כ-answered). |
| `call_duration_sec` | **חדש** — משך שיחה בשניות (מ-7.10 והלאה; רשומות ישנות `NULL`). |
| `recording_url` | פנימי. **לא להשתמש בו ישירות.** ההקלטה: `GET /api/leads/:id/recording?token=` (ללא שינוי). לשיחה שלא נענתה אין יותר הקלטה. |
| `call_uuid` | פנימי (התאמת אירועי שיחה). לא להציג. |

### 7. התראות — סמנטיקה
סוגי האירועים לא השתנו (`new_lead`, `status_change`, `reminder_due`, `lead_message`). השתנה **מי מקבל** (סעיפים 2–3 למעלה). חשוב לסעיף 1 (FCM).

---

## ב. השפעה על הסעיפים הפתוחים ב-TASKS

| סעיף | מה לשים לב |
|---|---|
| **1 FCM** | לשלוח FCM **מתוך `notifyUser`** — כל הנתיבים עוברים דרכו, כולל `notifyCompany`. ל-`notifyCompany` נוספו `roles` וסינון נציגים מוגבלים — לא לעקוף אותם. |
| **2 callbacks + `lead_id`** | ענף ה-callback ב-`routes/public.js` השתנה: יצירת `call_out` קוראת ל-`distribution.assignLead({..., agentId: cb.user_id})`, שומרת `call_duration_sec` ו-`call_uuid`, ושולחת webhook יוצא (`channelWebhook.sendCallEnded`). כשמחברים לליד קיים: **לא לדרוס `current_agent_id` קיים**; לעדכן `recording_url`/`call_status`/`call_duration_sec`/`call_uuid`; לבדוק שייכות עם **`leadScope`** (נציג מוגבל לא יחייג ל"ליד" שאינו שלו → 404). |
| **3 "הלידים שלי"** | `GET /api/leads` כבר משתמש ב-`leadScope(req.user, 'l')` — להוסיף `mine`/`unassigned`/`agent_id` **מעליו**, לא לחזור ל-`companyScope`. אצל נציג מוגבל `unassigned=1` תמיד ריק — תקין. |
| **4 עימוד** | `total` חייב לכבד את אותו `leadScope` + סינונים. `updated_since` בשעון ישראל (א.1). |
| **6 תזכורות** | `routes/reminders.js` עבר ל-`leadScope` + `loadLeadRestriction` — לשמור על זה כשמוסיפים `mine`/`done_at`. |
| **10 הרשאות** | ✅ בוצע (`d82fc3f`) — ראו א.2. |
| **12 `last_interaction_*`** | `routes/public.js` נכתב מחדש: התאמת אירועי שיחה לפי `call_uuid`, מסלול "שיחה שדווחה רק בסיומה" שיוצר ליד, ענף callback, webhook יוצא. לעדכן `last_interaction_*` בכל הנקודות האלה (ענף callback, עדכון ליד בסיום שיחה) + `notes`/`treatment`/`message` ב-`routes/leads.js`. |

---

## ג. מה עוד נבנה בשרת לאחרונה (לידיעה — לא נדרש באפליקציה)
- **חיוב iCount:** הוראות קבע, 14 ימי ניסיון עם חיוב 25 אג׳/דקה, קישורי תשלום ששולחים מנהלים, מספר לקוח iCount, סטטוס חי ומסמכים — הכל בווב/אדמין.
- **Webhook יוצא לערוץ:** נשלח לכל ליד (`call_ended` אחרי שההקלטה מוכנה / `lead_created`), לוג משלוחים, "שלח בדיקה", שליחה מחדש לאדמין-על.
- **מסקיו:** callback תמיד `callback_url_option=3`, IVR (`dial_option=3`), הגדרות ערוץ מתקדמות, שם הספק מוסתר מהלקוחות (גם באפליקציה — **אסור להציג "Maskyoo"** בשום מקום).
- **כפולים בשיחות:** תוקן (התאמה לפי UUID) + כלי שחזור.
- **הזמנת עובד:** הקישור תמיד מלא (גם ב-SMS).

---

## ד. קבצים שהשתנו הרבה לאחרונה (למשוך לפני שנוגעים)
`server/src/routes/public.js`, `routes/leads.js`, `routes/services.js`, `routes/companies.js`, `routes/reminders.js`, `routes/dashboard.js`, `routes/reports.js`, `routes/contacts.js`, `routes/users.js`, `services/notify.js`, `services/channelWebhook.js` (חדש), `services/leadDistribution.js` (חדש), `services/billing.js`/`icount.js` (חדשים), `db/pool.js` (אזור זמן), `db/scope.js` (`leadScope`), `middleware/auth.js` (`loadLeadRestriction`), `db/init.js`.

## ה. סביבה מקומית
- MySQL 8.4 על **3307** (`D:\leadclient-db`), API על 4000, Vite על 5180; admin/admin1234.
- מקומית אין טוקנים של מסקיו/iCount/מסר-גו → מצבי MOCK. קוד ה-OTP מודפס בלוג של ה-API.
- ⚠️ עדיין: **אסור** להריץ `db/demo-seed.js` מול 3307 (TRUNCATE).
