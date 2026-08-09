const express = require('express');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const config = require('../config');
const notify = require('../services/notify');

const router = express.Router();
router.use(requireAuth);

// in-app list + unread count
router.get('/', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT id, content, lead_id, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
    [req.user.id]);
  const [unread] = await query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ notifications: rows, unread: unread.n });
}));

// mark all (or a single id) read
router.post('/read', asyncHandler(async (req, res) => {
  const { id } = req.body || {};
  if (id) await query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?', [req.user.id, id]);
  else await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
}));

// --- Web Push ---
// public VAPID key the browser uses to build a subscription
router.get('/vapid-public-key', (req, res) => res.json({ key: config.vapid.publicKey || null }));

// save (or refresh) this browser's push subscription
router.post('/subscribe', asyncHandler(async (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint || !sub.keys) return res.status(400).json({ error: 'מנוי לא תקין' });
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [req.user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth]);
  res.json({ ok: true });
}));

router.post('/unsubscribe', asyncHandler(async (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint) await query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [req.user.id, endpoint]);
  res.json({ ok: true });
}));

// send myself a test notification across my enabled channels
router.post('/test', asyncHandler(async (req, res) => {
  await notify.notifyUser({ userId: req.user.id, event: 'new_lead', title: 'התראת בדיקה', body: 'זו התראת בדיקה מהמערכת' });
  res.json({ ok: true, pushReady: notify.isPushReady() });
}));

module.exports = router;
