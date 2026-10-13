// Public account / data deletion requests (the URL Google Play requires: /delete-account).
// No login needed: the request is stored and every super admin gets an in-app + push notification;
// the team verifies the requester against the account and handles it manually.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../db/pool');
const fcm = require('../services/fcm');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }));

const clean = (v, max) => String(v || '').trim().slice(0, max);

router.post('/', async (req, res, next) => {
  try {
    const name = clean(req.body.name, 120);
    const email = clean(req.body.email, 190);
    const phone = clean(req.body.phone, 30).replace(/[^\d+\-\s]/g, '');
    const company = clean(req.body.company, 190);
    const scope = req.body.scope === 'data' ? 'data' : 'account';
    const details = clean(req.body.details, 2000);
    if (!name) return res.status(400).json({ error: 'נא למלא שם' });
    if (!email && phone.replace(/\D/g, '').length < 9) return res.status(400).json({ error: 'נא למלא אימייל או טלפון של החשבון' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'כתובת האימייל לא תקינה' });

    const r = await query(
      `INSERT INTO deletion_requests (name, email, phone, company, scope, details, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email || null, phone || null, company || null, scope, details || null, clean(req.ip, 64)]);

    const what = scope === 'account' ? 'מחיקת חשבון' : 'מחיקת נתונים';
    const content = `בקשת ${what} #${r.insertId}: ${name}` +
      `${company ? ` (${company})` : ''} · ${[email, phone].filter(Boolean).join(' · ')}${details ? ` — ${details}` : ''}`;
    const admins = await query("SELECT id FROM users WHERE role = 'super_admin' AND is_active = 1").catch(() => []);
    await Promise.all(admins.map(async (a) => {
      await query('INSERT INTO notifications (user_id, content) VALUES (?, ?)', [a.id, content]).catch(() => {});
      await fcm.sendToUser(a.id, { title: `בקשת ${what}`, body: content, data: { type: 'deletion_request' } }).catch(() => {});
    }));
    console.log(`[deletion-request] #${r.insertId} ${scope} from ${email || phone}`);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { next(e); }
});

module.exports = router;
