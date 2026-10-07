require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

// The whole system runs on Israel time: Node's local time here, and every DB
// session (see db/pool.js) — so NOW(), stored datetimes and "today" all match
// what users see, and match the legacy data (stored in Israel wall time).
const APP_TZ = process.env.APP_TZ || 'Asia/Jerusalem';
process.env.TZ = APP_TZ;

module.exports = {
  timezone: APP_TZ,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_insecure_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  uploadDir: process.env.UPLOAD_DIR || require('path').resolve(__dirname, '../../public/uploads'),
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@leadclient.net',
  },
  maskyoo: {
    token: process.env.MASKYOO_TOKEN || '',               // Bearer token for the Maskyoo API
    apiUrl: process.env.MASKYOO_API_URL || 'https://www.maskyoo.com/leadclient/api/',
    // where Maskyoo reports calls (sent on EVERY number update, with callback_url_option=3)
    callbackUrl: process.env.MASKYOO_CALLBACK_URL
      || `${(process.env.APP_URL || 'https://app26.leadclient.net').replace(/\/$/, '')}/api/public/call`,
  },
  // MesserGO OTP / SMS (dedicated OTP endpoint: SMS with voice failover). No creds => mock.
  messergo: {
    user: process.env.MESSERGO_USER || '',
    smsToken: process.env.MESSERGO_SMS_TOKEN || '',        // Basic auth: base64(user:token)
    sender: process.env.MESSERGO_SENDER || 'LeadClient',   // approved sender name/number
    voiceCallerId: process.env.MESSERGO_VOICE_CALLER_ID || 'PRIVATE',
    // voice-call pre-message. With RequireDigitPress it must reference {Digit}.
    voicePreMessage: process.env.MESSERGO_VOICE_PREMSG != null ? process.env.MESSERGO_VOICE_PREMSG : 'לקבלת קוד האימות לחץ {Digit}',
    otpUrl: process.env.MESSERGO_OTP_URL || 'https://cloud.mesergo.co.il/api/v2/Otp/Message/Send',
    smsUrl: process.env.MESSERGO_SMS_URL || 'https://capi.mesergo.co.il/api/v2/SMS/SendSms',
  },
  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES || 5),
    length: 6,
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    resendSeconds: Number(process.env.OTP_RESEND_SECONDS || 30),  // min gap between sends
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',          // for verifying Google id_token (aud)
  },
  // iCount billing (standing orders via a hosted PayPage). No token => mock mode (non-production only).
  icount: {
    token: process.env.ICOUNT_TOKEN || '',                 // API token (Bearer), from iCount > API Tokens
    apiUrl: (process.env.ICOUNT_API_URL || 'https://api.icount.co.il/api/v3.php').replace(/\/$/, ''),
    paypageId: Number(process.env.ICOUNT_PAYPAGE_ID || 0) || null, // optional; auto-created & stored if empty
  },
  billing: {
    trialDays: Number(process.env.BILLING_TRIAL_DAYS || 14),
    trialMinuteRate: Number(process.env.BILLING_TRIAL_MINUTE_RATE || 0.25), // ILS per call minute during trial, incl. VAT
  },
  // mandatory phone verification before entering the app. Set PHONE_VERIFY_REQUIRED=false to lift the gate.
  requirePhoneVerify: process.env.PHONE_VERIFY_REQUIRED !== 'false',
  appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),  // public URL as configured (may be empty)
  // public URL for links that leave the system (recording links, iCount return/IPN,
  // invitations) — never empty, so links are never silently dropped
  publicUrl: (process.env.APP_URL || 'https://app26.leadclient.net').replace(/\/$/, ''),
};
