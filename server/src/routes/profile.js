const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

const parse = (v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };

// Current user's full profile for the self-edit page.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.display_name, u.role, u.phone,
            u.language, u.notifications, u.email_notifications, u.phone_notifications,
            c.name AS company_name, a.name AS agency_name
     FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     WHERE u.id = ?`, [req.user.id]);
  const u = rows[0];
  if (!u) return res.status(404).json({ error: 'משתמש לא נמצא' });
  u.notifications = parse(u.notifications);
  u.email_notifications = parse(u.email_notifications);
  u.phone_notifications = parse(u.phone_notifications);
  res.json({ user: u });
}));

router.patch('/', asyncHandler(async (req, res) => {
  const { username, first_name, last_name, display_name, language, email, phone } = req.body || {};
  await query(
    `UPDATE users SET username = COALESCE(?, username), first_name = COALESCE(?, first_name),
       last_name = COALESCE(?, last_name), display_name = COALESCE(?, display_name),
       language = COALESCE(?, language), email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE id = ?`,
    [username ?? null, first_name ?? null, last_name ?? null, display_name ?? null, language ?? null, email ?? null, phone ?? null, req.user.id]);
  res.json({ ok: true });
}));

router.patch('/password', asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password) return res.status(400).json({ error: 'חסרה סיסמה חדשה' });
  const rows = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (rows[0] && rows[0].password_hash) {
    const ok = await bcrypt.compare(current_password || '', rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'סיסמה נוכחית שגויה' });
  }
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(new_password, 10), req.user.id]);
  res.json({ ok: true });
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  const rows = await query('SELECT notifications, email_notifications, phone_notifications FROM users WHERE id = ?', [req.user.id]);
  res.json({ settings: rows[0] || {} });
}));

router.patch('/notifications', asyncHandler(async (req, res) => {
  const { notifications, email_notifications, phone_notifications } = req.body || {};
  await query('UPDATE users SET notifications = ?, email_notifications = ?, phone_notifications = ? WHERE id = ?',
    [JSON.stringify(notifications || {}), JSON.stringify(email_notifications || {}), JSON.stringify(phone_notifications || {}), req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
