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
    'common.search': 'חיפוש', 'common.add': 'הוספה', 'common.save': 'שמירה', 'common.back': 'חזרה',
    'common.loading': 'טוען...', 'common.none': 'אין נתונים.', 'common.active': 'פעילה', 'common.suspended': 'מושעית',
    'common.yes': 'כן', 'common.no': 'לא', 'common.phone': 'טלפון', 'common.email': 'אימייל', 'common.company': 'חברה',
    'common.agency': 'סוכנות', 'common.status': 'סטטוס', 'common.name': 'שם', 'common.amount': 'כמות', 'common.date': 'תאריך',
    // agencies
    'ag.newName': 'שם סוכנות חדשה', 'ag.addBtn': 'הוספת סוכנות', 'ag.companies': 'חברות', 'ag.none': 'אין סוכנויות.',
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
    'common.search': 'Search', 'common.add': 'Add', 'common.save': 'Save', 'common.back': 'Back',
    'common.loading': 'Loading...', 'common.none': 'No data.', 'common.active': 'Active', 'common.suspended': 'Suspended',
    'common.yes': 'Yes', 'common.no': 'No', 'common.phone': 'Phone', 'common.email': 'Email', 'common.company': 'Company',
    'common.agency': 'Agency', 'common.status': 'Status', 'common.name': 'Name', 'common.amount': 'Count', 'common.date': 'Date',
    'ag.newName': 'New agency name', 'ag.addBtn': 'Add agency', 'ag.companies': 'Companies', 'ag.none': 'No agencies.',
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
