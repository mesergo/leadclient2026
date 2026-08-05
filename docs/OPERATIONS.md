# תפעול — LeadClient (אחרי עלייה)

## גיבויי DB אוטומטיים
cPanel → **Cron Jobs**, גיבוי יומי (03:00):
```bash
mysqldump -u DB_USER -p'DB_PASS' DB_NAME | gzip > /home/cpuser/backups/leadclient-$(date +\%F).sql.gz
```
- שמור 14 יום אחורה; מחק ישנים:
```bash
find /home/cpuser/backups -name 'leadclient-*.sql.gz' -mtime +14 -delete
```
- **בדוק שחזור** אחת לרבעון: `gunzip < backup.sql.gz | mysql -u USER -p DBNAME_test`.

## ניטור
- **בריאות:** בדיקת uptime חיצונית מול `/api/health` (UptimeRobot וכו').
- **לוגים:** cPanel → Setup Node.js App → לוגי האפליקציה; שגיאות שרת נרשמות ל-stderr.
- **דיסק:** עקוב אחרי `UPLOAD_DIR` (קבצים) ותיקיית הגיבויים.

## שחזור אחרי תקלה
1. cPanel → Setup Node.js App → Restart.
2. אם ה-DB נפגע: שחזר מהגיבוי האחרון (phpMyAdmin Import או `mysql < backup`).
3. ודא `/api/health` ואז בדיקת עשן (התחברות + דשבורד).

## תחזוקה שוטפת
- עדכוני תלויות: `npm audit` תקופתי; עדכן חבילות עם CVE.
- רוטציית `JWT_SECRET` רק בתחזוקה מתוכננת (מנתקת את כל המשתמשים).
