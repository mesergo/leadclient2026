// Firebase Cloud Messaging for the mobile app (Android). Enabled only when
// FIREBASE_SERVICE_ACCOUNT is set (the service-account JSON, raw or base64 — base64 is
// safer in Coolify, a multi-line JSON breaks the generated .env). Without it every
// call is a no-op, so the rest of the system works the same.
const config = require('../config');
const { query } = require('../db/pool');

let messaging = null;
let initTried = false;

function init() {
  if (initTried) return messaging;
  initTried = true;
  const raw = config.firebase.serviceAccount;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const admin = require('firebase-admin');
    const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) }, 'leadclient-fcm');
    messaging = admin.messaging(app);
    console.log('[fcm] ready');
  } catch (e) {
    console.warn('[fcm] init failed:', e.message);
    messaging = null;
  }
  return messaging;
}

const isReady = () => !!init();

// Tokens FCM reports as gone — remove them so we stop sending.
const DEAD = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

// Send to every device of the user. data values must be strings (FCM rule).
// title/body -> a visible notification on the "leads" channel; omit them for a data-only message.
async function sendToUser(userId, { title, body, data = {} }) {
  const m = init();
  if (!m || !userId) return;
  const rows = await query('SELECT token FROM device_tokens WHERE user_id = ?', [userId]);
  if (!rows.length) return;
  const strData = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  const msg = {
    tokens: rows.map((r) => r.token),
    data: strData,
    android: { priority: 'high', ...(title ? { notification: { channelId: 'leads', sound: 'default' } } : {}) },
    ...(title ? { notification: { title, body: body || '' } } : {}),
  };
  try {
    const res = await m.sendEachForMulticast(msg);
    const dead = [];
    res.responses.forEach((r, i) => { if (!r.success && r.error && DEAD.has(r.error.code)) dead.push(msg.tokens[i]); });
    if (dead.length) await query(`DELETE FROM device_tokens WHERE token IN (${dead.map(() => '?').join(',')})`, dead);
  } catch (e) {
    console.warn('[fcm] send failed:', e.message);
  }
}

module.exports = { sendToUser, isReady };
