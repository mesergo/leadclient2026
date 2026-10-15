// Super admin: push messages to the mobile app's users, and the "new version in the store" notice.
// The app reads the version notice from the public GET /api/public/app-version.
const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const fcm = require('../services/fcm');

const router = express.Router();
router.use(requireAuth, requireRole('super_admin'));

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.leadclient.crm';
const VERSION_KEYS = { latest: 'app_latest_version', min: 'app_min_version', url: 'app_store_url', message: 'app_update_message' };

async function getSetting(k) { return ((await query('SELECT v FROM app_settings WHERE k = ?', [k]))[0] || {}).v ?? null; }
async function setSetting(k, v) {
  await query('INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, v == null ? null : String(v)]);
}
async function versionInfo() {
  return {
    latest: await getSetting(VERSION_KEYS.latest),
    min: await getSetting(VERSION_KEYS.min),
    url: (await getSetting(VERSION_KEYS.url)) || PLAY_URL,
    message: await getSetting(VERSION_KEYS.message),
  };
}

// users with the app installed (a push token), narrowed to a company / one user
async function targetUsers({ target, company_id, user_id }) {
  let where = '1=1';
  const params = [];
  if (target === 'company') { where = 'u.company_id = ?'; params.push(Number(company_id) || 0); }
  if (target === 'user') { where = 'u.id = ?'; params.push(Number(user_id) || 0); }
  return query(
    `SELECT u.id, u.company_id, COUNT(d.id) AS devices FROM users u JOIN device_tokens d ON d.user_id = u.id
      WHERE u.is_active = 1 AND ${where} GROUP BY u.id, u.company_id`, params);
}

async function sendPush({ title, body, url, kind, targetSpec, req }) {
  const users = await targetUsers(targetSpec);
  const content = body ? `${title} — ${body}` : title;
  for (const u of users) {
    await query('INSERT INTO notifications (user_id, company_id, content) VALUES (?, ?, ?)', [u.id, u.company_id || null, content]).catch(() => {});
    await fcm.sendToUser(u.id, { title, body: body || '', data: { type: kind, url: url || null } }).catch(() => {});
  }
  const devices = users.reduce((n, u) => n + Number(u.devices), 0);
  await query(
    `INSERT INTO app_push_log (user_id, user_name, kind, target, company_id, target_user_id, title, body, url, users_count, devices_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, req.user.name || null, kind, targetSpec.target, targetSpec.company_id || null, targetSpec.user_id || null,
      title, body || null, url || null, users.length, devices]).catch(() => {});
  return { users: users.length, devices };
}

// how many app users / devices there are (overall and per company), for the screen header
router.get('/stats', asyncHandler(async (req, res) => {
  const total = (await query(
    'SELECT COUNT(DISTINCT u.id) AS users, COUNT(d.id) AS devices FROM users u JOIN device_tokens d ON d.user_id = u.id WHERE u.is_active = 1'))[0];
  const companies = await query(
    `SELECT c.id, c.name, COUNT(DISTINCT u.id) AS users FROM companies c
       JOIN users u ON u.company_id = c.id AND u.is_active = 1 JOIN device_tokens d ON d.user_id = u.id
      GROUP BY c.id, c.name ORDER BY c.name`);
  const users = await query(
    `SELECT u.id, COALESCE(NULLIF(u.display_name,''), u.username) AS name, c.name AS company_name, COUNT(d.id) AS devices
       FROM users u JOIN device_tokens d ON d.user_id = u.id LEFT JOIN companies c ON c.id = u.company_id
      WHERE u.is_active = 1 GROUP BY u.id, name, company_name ORDER BY name LIMIT 500`);
  res.json({ users: Number(total.users) || 0, devices: Number(total.devices) || 0, companies, app_users: users, push_ready: fcm.isReady() });
}));

// POST { title, body?, url?, target: 'all'|'company'|'user', company_id?, user_id? }
router.post('/push', asyncHandler(async (req, res) => {
  const title = String((req.body && req.body.title) || '').trim().slice(0, 100);
  const body = String((req.body && req.body.body) || '').trim().slice(0, 500);
  const url = String((req.body && req.body.url) || '').trim().slice(0, 500);
  const target = ['company', 'user'].includes(req.body && req.body.target) ? req.body.target : 'all';
  if (!title) return res.status(400).json({ error: 'חסרה כותרת' });
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'הקישור חייב להתחיל ב-https://' });
  if (target === 'company' && !req.body.company_id) return res.status(400).json({ error: 'לא נבחרה חברה' });
  if (target === 'user' && !req.body.user_id) return res.status(400).json({ error: 'לא נבחר משתמש' });
  if (!fcm.isReady()) return res.status(503).json({ error: 'שליחת פוש לא מוגדרת בשרת' });
  const r = await sendPush({ title, body, url, kind: 'broadcast', targetSpec: { target, company_id: req.body.company_id, user_id: req.body.user_id }, req });
  res.json({ ok: true, ...r });
}));

router.get('/push-log', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT l.id, l.created_at, l.user_name, l.kind, l.target, c.name AS company_name, l.title, l.body, l.url, l.users_count, l.devices_count
       FROM app_push_log l LEFT JOIN companies c ON c.id = l.company_id ORDER BY l.id DESC LIMIT 50`);
  res.json({ log: rows });
}));

router.get('/version', asyncHandler(async (req, res) => res.json(await versionInfo())));

// PUT { latest, min?, url?, message?, notify? } — notify: push "a new version is available" to all app users
router.put('/version', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const ver = (v) => { const s = String(v || '').trim(); return /^\d+(\.\d+){0,3}$/.test(s) ? s : (s ? undefined : null); };
  const latest = ver(b.latest), min = ver(b.min);
  if (latest === undefined || min === undefined) return res.status(400).json({ error: 'מספר גרסה לא תקין (למשל 1.1.6)' });
  const url = String(b.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'הקישור חייב להתחיל ב-https://' });
  await setSetting(VERSION_KEYS.latest, latest);
  await setSetting(VERSION_KEYS.min, min);
  await setSetting(VERSION_KEYS.url, url || null);
  await setSetting(VERSION_KEYS.message, String(b.message || '').trim().slice(0, 300) || null);
  const info = await versionInfo();
  let pushed = null;
  if (b.notify && info.latest) {
    if (!fcm.isReady()) return res.status(503).json({ error: 'הגרסה נשמרה, אבל שליחת פוש לא מוגדרת בשרת' });
    pushed = await sendPush({
      title: 'גרסה חדשה של LeadClient זמינה',
      body: info.message || `גרסה ${info.latest} זמינה בחנות — לחצו לעדכון`,
      url: info.url, kind: 'app_update', targetSpec: { target: 'all' }, req,
    });
  }
  res.json({ ok: true, ...info, pushed });
}));

router.versionInfo = versionInfo;
module.exports = router;
