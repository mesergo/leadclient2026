# Backlog אינטגרציות אמת (Go-Live)

הבנייה הנוכחית שומרת הגדרות אינטגרציה אך **לא מבצעת קריאות חוץ** (adapters מסוג mock ב-`server/src/services/integrations/`). כדי לחבר ספק אמת, החלף את המימוש ה-mock וספק את הפרטים הבאים:

| אינטגרציה | ספק | נדרש מהלקוח | קובץ להחלפה |
|---|---|---|---|
| טלפוניה / IVR | Native / MicroPay / PayCall / Maskyoo | חשבון ספק + API keys + מספרי מקור | `integrations/index.js` > `ivr` |
| SMS | MesserGO | username + token + sender ID | `integrations/index.js` > `sms` |
| WhatsApp | dialog360 | App ID + token + מספר מאושר + תבניות מאושרות | `integrations/index.js` > `whatsapp` |
| חיוב/חשבוניות | iCount | cid + user + pass/token סליקה | `integrations/index.js` > `billing` |
| דיוור | Smoove | API token | `integrations/index.js` > `emailMarketing` |
| נתוני קמפיינים | Google / Facebook Ads | חיבור OAuth / ייצוא CSV | `routes/reports.js` + `monthly_reports` |

**עיקרון:** כל adapter מאחורי interface אחיד — החלפת ה-mock ב-HTTP client אמיתי לא נוגעת בשאר הקוד.

## מחוץ להיקף (backlog עתידי)
- מערכת **שיחות WhatsApp** מלאה (`/chats`) — הוחרגה במפורש. טבלת `wa_messages` במקור.
- `blocked_emails` (anti-spam), לוגי `contacts_logs`/`leads_logs` נפרדים.
