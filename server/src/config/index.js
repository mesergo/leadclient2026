require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

module.exports = {
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
  },
  // MesserGO OTP / SMS (dedicated OTP endpoint: SMS with voice failover). No creds => mock.
  messergo: {
    user: process.env.MESSERGO_USER || '',
    smsToken: process.env.MESSERGO_SMS_TOKEN || '',        // Basic auth: base64(user:token)
    sender: process.env.MESSERGO_SENDER || 'LeadClient',   // approved sender name/number
    voiceCallerId: process.env.MESSERGO_VOICE_CALLER_ID || 'PRIVATE',
    // voice-call pre-message (before reading the code). MesserGO rejects free text here,
    // so default to omitting it; set MESSERGO_VOICE_PREMSG to force a value.
    voicePreMessage: process.env.MESSERGO_VOICE_PREMSG != null ? process.env.MESSERGO_VOICE_PREMSG : '',
    otpUrl: process.env.MESSERGO_OTP_URL || 'https://cloud.mesergo.co.il/api/v2/Otp/Message/Send',
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
  // mandatory phone verification before entering the app. Set PHONE_VERIFY_REQUIRED=false to lift the gate.
  requirePhoneVerify: process.env.PHONE_VERIFY_REQUIRED !== 'false',
  appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),  // public URL, for the Maskyoo callback_url
};
