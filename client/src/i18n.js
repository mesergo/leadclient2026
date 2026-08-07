// UI translations + direction. RTL languages listed explicitly.
const RTL_LANGS = new Set(['he', 'ar', 'fa', 'ur', 'yi']);
export const dirFor = (lang) => (RTL_LANGS.has((lang || '').slice(0, 2)) ? 'rtl' : 'ltr');

export const LANGS = [
  { code: 'he', label: 'עברית' },
  { code: 'en', label: 'English' },
];

const DICT = {
  he: {
    brand: 'LeadClient',
    'nav.dashboard': 'מרכז שליטה', 'nav.agencies': 'סוכנויות', 'nav.companies': 'חברות',
    'nav.leads': 'לידים', 'nav.import': 'ייבוא לידים', 'nav.virtual': 'מספרים וירטואליים',
    'nav.reports': 'דוחות', 'nav.contacts': 'אנשי קשר', 'nav.users': 'משתמשים',
    'nav.billing': 'מרכז החיובים', 'nav.language': 'תרגומי מערכת', 'nav.profile': 'פרופיל',
    'nav.developers': 'מפתחים',
    'header.welcome': 'ברוך הבא', 'header.logout': 'התנתקות',
    'login.username': 'שם משתמש', 'login.password': 'סיסמה', 'login.signin': 'התחברות', 'login.signing': 'מתחבר...',
    'dash.greeting': 'שלום! ברוכים הבאים למערכת ניהול הלידים',
    'dash.leads': 'לידים', 'dash.users': 'משתמשים', 'dash.companies': 'חברות', 'dash.agencies': 'סוכנויות', 'dash.conversion': 'המרות',
    'dash.recent': 'פעולות אחרונות', 'dash.action': 'פעולה', 'dash.user': 'משתמש', 'dash.date': 'תאריך', 'dash.empty': 'אין פעילות להצגה.',
    'dash.selectAgency': 'בחר סוכנות', 'dash.company': 'חברה', 'dash.channel': 'ערוץ',
    'dash.allAgencies': 'כל הסוכנויות', 'dash.allCompanies': 'כל החברות', 'dash.allChannels': 'כל הערוצים',
    'dash.show': 'הצגה', 'dash.generalInfo': 'מידע כללי',
    'dash.tblAgency': 'סוכנות', 'dash.tblCompanies': 'חברות', 'dash.tblUsers': 'משתמשים', 'dash.tblLeads': 'לידים', 'dash.tblConv': 'אחוז המרה',
    'dash.online': 'משתמשים מחוברים', 'dash.inCall': 'משתמשים בשיחה', 'dash.noOnline': 'אין משתמשים מחוברים', 'dash.allActions': 'כל הפעולות',
    'dp.today': 'היום', 'dp.yesterday': 'אתמול', 'dp.last2': 'היומיים האחרונים', 'dp.thisWeek': 'השבוע (יום ראשון - היום)', 'dp.last7': '7 הימים האחרונים', 'dp.prevWeek': 'השבוע הקודם', 'dp.last14': '14 הימים האחרונים', 'dp.thisMonth': 'החודש', 'dp.last30': '30 הימים האחרונים', 'dp.prevMonth': 'החודש הקודם',
    'common.search': 'חיפוש', 'common.add': 'הוספה', 'common.save': 'שמירה', 'common.back': 'חזרה',
    'common.loading': 'טוען...', 'common.none': 'אין נתונים.', 'common.active': 'פעילה', 'common.suspended': 'מושעית',
    'common.yes': 'כן', 'common.no': 'לא', 'common.phone': 'טלפון', 'common.email': 'אימייל', 'common.company': 'חברה',
    'common.agency': 'סוכנות', 'common.status': 'סטטוס', 'common.name': 'שם', 'common.amount': 'כמות', 'common.date': 'תאריך',
    // agencies
    'ag.newName': 'שם סוכנות חדשה', 'ag.addBtn': 'הוספת סוכנות', 'ag.companies': 'חברות', 'ag.none': 'אין סוכנויות.', 'ag.searchPh': 'חפש סוכנות...', 'ag.channels': 'ערוצים', 'ag.users': 'משתמשים', 'ag.leads': 'לידים', 'ag.phones': 'טלפונים', 'ag.filterAll': 'כל הסוכנויות', 'ag.filterActive': 'פעילות בלבד', 'ag.filterSuspended': 'מושעות בלבד', 'ag.toCompanies': 'חברות הסוכנות', 'ag.addCompany': 'הוסף חברה', 'ag.edit': 'עריכה', 'ag.suspend': 'השעיה', 'ag.activate': 'הפעלה', 'agedit.title': 'עריכת סוכנות', 'agedit.name': 'שם הסוכנות', 'agedit.logo': 'לוגו הסוכנות', 'agedit.ivr': 'מערכת IVR', 'agedit.phoneLimit': 'הגבלת טלפונים', 'agedit.phonesInUse': 'טלפונים בשימוש כרגע', 'agedit.icount': 'הפעל מנוי לסליקת חברות אוטומטית ב-Icount', 'agedit.icountCid': 'מזהה חברה', 'agedit.icountUser': 'שם משתמש', 'agedit.icountPass': 'סיסמא', 'agedit.externalUser': 'האם ניתן להוסיף משתמש מכתובת חיצונית?', 'agedit.templates': 'אפשר ניהול הודעות טמפלט', 'agedit.whatsappId': 'Whatsapp ID', 'agedit.chooseFile': 'בחר קובץ...', 'agedit.uploadLogo': 'העלאת לוגו', 'agedit.editTemplates': 'ערוך הודעות טמפלט',
    // companies
    'co.newName': 'שם חברה חדשה', 'co.addBtn': 'הוספת חברה', 'co.channels': 'ערוצים', 'co.none': 'אין חברות.',
    'co.impersonateConfirm': 'להתחבר כמנהל',
    'cod.saved': 'נשמר.', 'cod.name': 'שם החברה', 'cod.phone': 'טלפון', 'cod.fax': 'פקס', 'cod.address': 'כתובת',
    'cod.zip': 'מיקוד', 'cod.industry': 'ענף',
    // leads
    'lead.searchPh': 'חיפוש שם/טלפון/אימייל', 'lead.show': 'הצגה', 'lead.num': "מס'", 'lead.name': 'שם הפונה',
    'lead.channel': 'ערוץ', 'lead.agent': 'נציג', 'lead.received': 'התקבל', 'lead.none': 'אין לידים.',
    'lead.na': 'לא זמין', 'lead.general': 'כללי',
    'leadd.title': 'ליד', 'leadd.rating': 'דירוג', 'leadd.convos': 'שיחות והערות', 'leadd.addNote': 'הוספת הערה...',
    'leadd.content': 'תוכן', 'leadd.type': 'סוג',
    // contacts
    'con.searchPh': 'חיפוש שם/טלפון/אימייל', 'con.fullName': 'שם מלא', 'con.created': 'תאריך יצירה', 'con.none': 'אין אנשי קשר.',
    // users
    'usr.searchPh': 'חיפוש שם/אימייל', 'usr.username': 'שם משתמש', 'usr.role': 'תפקיד', 'usr.lastSeen': 'נראה לאחרונה', 'usr.none': 'אין משתמשים.',
    // import
    'imp.pickCompany': 'בחר חברה', 'imp.single': 'הוספת ליד בודד', 'imp.imported': 'יובאו',
    // virtual
    'vir.number': 'מספר וירטואלי', 'vir.target': 'יעד', 'vir.provider': 'ספק IVR', 'vir.premium': 'פרימיום', 'vir.none': 'אין מספרים.',
    // reports
    'rep.byStatus': 'לידים לפי סטטוס', 'rep.byChannel': 'לידים לפי ערוץ', 'rep.channel': 'ערוץ',
    // billing
    'bil.packages': 'חבילות', 'bil.package': 'חבילה', 'bil.price': 'מחיר', 'bil.users': 'משתמשים', 'bil.phones': 'טלפונים',
    'bil.leads': 'לידים', 'bil.invoices': 'חשבוניות', 'bil.type': 'סוג', 'bil.month': 'חודש',
    // language
    'lng.language': 'שפה', 'lng.english': 'אנגלית', 'lng.dir': 'כיוון', 'lng.active': 'פעיל',
    // profile
    'prof.details': 'פרטים', 'prof.role': 'תפקיד', 'prof.changePw': 'שינוי סיסמה', 'prof.currentPw': 'סיסמה נוכחית',
    'prof.newPw': 'סיסמה חדשה', 'prof.updatePw': 'עדכון סיסמה', 'prof.pwUpdated': 'הסיסמה עודכנה.',
    // developers
    'dev.embed': 'הטמעת LeadClient', 'dev.pick': 'בחר ערוץ לחיבור:', 'dev.pickPh': 'בחר ערוץ...',
    'dev.code': 'קוד הטמעה:', 'dev.errCodes': 'קודי שגיאה', 'dev.errCode': 'קוד', 'dev.errDesc': 'תיאור',
    'dev.err.noChannel': 'לא התקבל קוד ערוץ תקין', 'dev.err.noPhone': 'חסר מספר טלפון בפנייה',
  },
  en: {
    brand: 'LeadClient',
    'nav.dashboard': 'Dashboard', 'nav.agencies': 'Agencies', 'nav.companies': 'Companies',
    'nav.leads': 'Leads', 'nav.import': 'Import Leads', 'nav.virtual': 'Virtual Numbers',
    'nav.reports': 'Reports', 'nav.contacts': 'Contacts', 'nav.users': 'Users',
    'nav.billing': 'Billing', 'nav.language': 'Translations', 'nav.profile': 'Profile',
    'nav.developers': 'Developers',
    'header.welcome': 'Welcome', 'header.logout': 'Log out',
    'login.username': 'Username', 'login.password': 'Password', 'login.signin': 'Sign in', 'login.signing': 'Signing in...',
    'dash.greeting': 'Welcome to the lead management system',
    'dash.leads': 'Leads', 'dash.users': 'Users', 'dash.companies': 'Companies', 'dash.agencies': 'Agencies', 'dash.conversion': 'Conversion',
    'dash.recent': 'Recent activity', 'dash.action': 'Action', 'dash.user': 'User', 'dash.date': 'Date', 'dash.empty': 'No activity to show.',
    'dash.selectAgency': 'Select agency', 'dash.company': 'Company', 'dash.channel': 'Channel',
    'dash.allAgencies': 'All agencies', 'dash.allCompanies': 'All companies', 'dash.allChannels': 'All channels',
    'dash.show': 'Show', 'dash.generalInfo': 'General info',
    'dash.tblAgency': 'Agency', 'dash.tblCompanies': 'Companies', 'dash.tblUsers': 'Users', 'dash.tblLeads': 'Leads', 'dash.tblConv': 'Conversion',
    'dash.online': 'Connected users', 'dash.inCall': 'Users in call', 'dash.noOnline': 'No connected users', 'dash.allActions': 'All actions',
    'dp.today': 'Today', 'dp.yesterday': 'Yesterday', 'dp.last2': 'Last 2 days', 'dp.thisWeek': 'This week (Sun-today)', 'dp.last7': 'Last 7 days', 'dp.prevWeek': 'Previous week', 'dp.last14': 'Last 14 days', 'dp.thisMonth': 'This month', 'dp.last30': 'Last 30 days', 'dp.prevMonth': 'Previous month',
    'common.search': 'Search', 'common.add': 'Add', 'common.save': 'Save', 'common.back': 'Back',
    'common.loading': 'Loading...', 'common.none': 'No data.', 'common.active': 'Active', 'common.suspended': 'Suspended',
    'common.yes': 'Yes', 'common.no': 'No', 'common.phone': 'Phone', 'common.email': 'Email', 'common.company': 'Company',
    'common.agency': 'Agency', 'common.status': 'Status', 'common.name': 'Name', 'common.amount': 'Count', 'common.date': 'Date',
    'ag.newName': 'New agency name', 'ag.addBtn': 'Add agency', 'ag.companies': 'Companies', 'ag.none': 'No agencies.', 'ag.searchPh': 'Search agency...', 'ag.channels': 'Channels', 'ag.users': 'Users', 'ag.leads': 'Leads', 'ag.phones': 'Phones', 'ag.filterAll': 'All agencies', 'ag.filterActive': 'Active only', 'ag.filterSuspended': 'Suspended only', 'ag.toCompanies': 'Agency companies', 'ag.addCompany': 'Add company', 'ag.edit': 'Edit', 'ag.suspend': 'Suspend', 'ag.activate': 'Activate', 'agedit.title': 'Edit agency', 'agedit.name': 'Agency name', 'agedit.logo': 'Agency logo', 'agedit.ivr': 'IVR System', 'agedit.phoneLimit': 'Phone limit', 'agedit.phonesInUse': 'Phones in use', 'agedit.icount': 'Enable automatic iCount billing', 'agedit.icountCid': 'Company ID', 'agedit.icountUser': 'Username', 'agedit.icountPass': 'Password', 'agedit.externalUser': 'Allow adding user from external address?', 'agedit.templates': 'Enable template message management', 'agedit.whatsappId': 'Whatsapp ID', 'agedit.chooseFile': 'Choose file...', 'agedit.uploadLogo': 'Upload logo', 'agedit.editTemplates': 'Edit templates',
    'co.newName': 'New company name', 'co.addBtn': 'Add company', 'co.channels': 'Channels', 'co.none': 'No companies.',
    'co.impersonateConfirm': 'Log in as admin of',
    'cod.saved': 'Saved.', 'cod.name': 'Company name', 'cod.phone': 'Phone', 'cod.fax': 'Fax', 'cod.address': 'Address',
    'cod.zip': 'Zip code', 'cod.industry': 'Industry',
    'lead.searchPh': 'Search name/phone/email', 'lead.show': 'Show', 'lead.num': '#', 'lead.name': 'Lead name',
    'lead.channel': 'Channel', 'lead.agent': 'Agent', 'lead.received': 'Received', 'lead.none': 'No leads.',
    'lead.na': 'N/A', 'lead.general': 'General',
    'leadd.title': 'Lead', 'leadd.rating': 'Rating', 'leadd.convos': 'Conversations & notes', 'leadd.addNote': 'Add a note...',
    'leadd.content': 'Content', 'leadd.type': 'Type',
    'con.searchPh': 'Search name/phone/email', 'con.fullName': 'Full name', 'con.created': 'Created', 'con.none': 'No contacts.',
    'usr.searchPh': 'Search name/email', 'usr.username': 'Username', 'usr.role': 'Role', 'usr.lastSeen': 'Last seen', 'usr.none': 'No users.',
    'imp.pickCompany': 'Select company', 'imp.single': 'Add a single lead', 'imp.imported': 'Imported',
    'vir.number': 'Virtual number', 'vir.target': 'Target', 'vir.provider': 'IVR provider', 'vir.premium': 'Premium', 'vir.none': 'No numbers.',
    'rep.byStatus': 'Leads by status', 'rep.byChannel': 'Leads by channel', 'rep.channel': 'Channel',
    'bil.packages': 'Packages', 'bil.package': 'Package', 'bil.price': 'Price', 'bil.users': 'Users', 'bil.phones': 'Phones',
    'bil.leads': 'Leads', 'bil.invoices': 'Invoices', 'bil.type': 'Type', 'bil.month': 'Month',
    'lng.language': 'Language', 'lng.english': 'English', 'lng.dir': 'Direction', 'lng.active': 'Active',
    'prof.details': 'Details', 'prof.role': 'Role', 'prof.changePw': 'Change password', 'prof.currentPw': 'Current password',
    'prof.newPw': 'New password', 'prof.updatePw': 'Update password', 'prof.pwUpdated': 'Password updated.',
    'dev.embed': 'Embed LeadClient', 'dev.pick': 'Select a channel to connect:', 'dev.pickPh': 'Select channel...',
    'dev.code': 'Embed code:', 'dev.errCodes': 'Error codes', 'dev.errCode': 'Code', 'dev.errDesc': 'Description',
    'dev.err.noChannel': 'No valid channel code received', 'dev.err.noPhone': 'Missing phone number in the request',
  },
};

export function translate(lang, key) {
  const l = DICT[lang] ? lang : 'he';
  return DICT[l][key] || DICT.he[key] || key;
}
