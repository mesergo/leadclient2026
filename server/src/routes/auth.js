const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { issueToken } = require('../services/authService');
const otp = require('../services/otp');
const messergo = require('../services/messergo');
const googleAuth = require('../services/googleAuth');
const config = require('../config');

const router = express.Router();
const USER_COLS = 'id, username, display_name, role, company_id, agency_id, is_active, phone, phone_verified_at';

// Find an active user by phone (format-agnostic: match on the last 9 digits).
async function findUserByPhone(phone) {
  const key = messergo.digits(phone).slice(-9);
  if (key.length < 9) return null;
  const rows = await query(
    `SELECT id, username, display_name, role, company_id, agency_id, is_active, phone, phone_verified_at
       FROM users WHERE is_active = 1 AND phone IS NOT NULL
         AND REGEXP_REPLACE(phone, '[^0-9]', '') LIKE CONCAT('%', ?) LIMIT 1`, [key]);
  return rows[0] || null;
}

function sessionPayload(user) {
  return {
    token: issueToken(user),
    user: { id: user.id, name: user.display_name || user.username, role: user.role, company_id: user.company_id, agency_id: user.agency_id },
  };
}

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'חסר שם משתמש או סיסמה' });
    const rows = await query(
      'SELECT id, username, display_name, role, company_id, agency_id, password_hash, is_active FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    const user = rows[0];
    if (!user || !user.is_active || !user.password_hash) {
      return res.status(401).json({ error: 'פרטי התחברות שגויים' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'פרטי התחברות שגויים' });
    // agency_admin scope needs agency_id; legacy users often have it blank — derive from their company.
    if (user.role === 'agency_admin' && !user.agency_id && user.company_id) {
      const c = await query('SELECT agency_id FROM companies WHERE id = ?', [user.company_id]);
      if (c[0]) user.agency_id = c[0].agency_id;
    }
    const token = issueToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.display_name || user.username, role: user.role, company_id: user.company_id, agency_id: user.agency_id },
    });
  } catch (e) {
    next(e);
  }
});

// --- Google sign-in --------------------------------------------------------
// Verify the Google credential, then sign in a matching EXISTING user (by
// google_id, else by verified email — linking google_id on first use).
// Public self-signup is a separate flow; unknown Google emails are rejected.
router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'חסר אישור גוגל' });
    if (!googleAuth.configured()) return res.status(503).json({ error: 'התחברות גוגל אינה מוגדרת בשרת' });
    let p;
    try { p = await googleAuth.verify(credential); } catch (e) { return res.status(401).json({ error: 'אימות גוגל נכשל' }); }
    if (!p || !p.email || !p.email_verified) return res.status(401).json({ error: 'כתובת הגוגל אינה מאומתת' });

    let rows = await query(`SELECT ${USER_COLS} FROM users WHERE google_id = ? AND is_active = 1 LIMIT 1`, [p.sub]);
    let user = rows[0];
    if (!user) {
      rows = await query(`SELECT ${USER_COLS} FROM users WHERE email = ? AND is_active = 1 LIMIT 1`, [p.email]);
      user = rows[0];
      if (user) await query('UPDATE users SET google_id = ? WHERE id = ?', [p.sub, user.id]); // link on first use
    }
    if (!user) return res.status(404).json({ error: 'לא נמצא חשבון המשויך לכתובת גוגל זו' });
    if (user.role === 'agency_admin' && !user.agency_id && user.company_id) {
      const c = await query('SELECT agency_id FROM companies WHERE id = ?', [user.company_id]);
      if (c[0]) user.agency_id = c[0].agency_id;
    }
    res.json(sessionPayload(user));
  } catch (e) { next(e); }
});

// --- Phone OTP login -------------------------------------------------------
// Step 1: request a code. Only sent to a user whose phone is verified (prevents
// enumeration & wasted SMS). Always returns {ok:true} so callers can't probe.
router.post('/phone/request', async (req, res, next) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'חסר מספר טלפון' });
    const user = await findUserByPhone(phone);
    if (!user || !user.phone_verified_at) return res.json({ ok: true }); // silent: no such verified user
    const r = await otp.requestOtp({ phone, purpose: 'login' });
    if (!r.ok && r.error === 'too_soon') return res.status(429).json({ error: 'נשלח קוד לאחרונה, נסה שוב בעוד רגע' });
    return res.json({ ok: true, mocked: r.mocked, devCode: r.devCode });
  } catch (e) { next(e); }
});

// Step 2: verify the code -> issue a session.
router.post('/phone/verify', async (req, res, next) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) return res.status(400).json({ error: 'חסר מספר טלפון או קוד' });
    const v = await otp.verifyOtp({ phone, code, purpose: 'login' });
    if (!v.ok) return res.status(401).json({ error: 'קוד שגוי או שפג תוקפו' });
    const user = await findUserByPhone(phone);
    if (!user || !user.phone_verified_at) return res.status(401).json({ error: 'פרטי התחברות שגויים' });
    if (user.role === 'agency_admin' && !user.agency_id && user.company_id) {
      const c = await query('SELECT agency_id FROM companies WHERE id = ?', [user.company_id]);
      if (c[0]) user.agency_id = c[0].agency_id;
    }
    res.json(sessionPayload(user));
  } catch (e) { next(e); }
});

// --- Verify the logged-in user's own phone (enables phone login later) ------
router.post('/phone/verify-request', requireAuth, async (req, res, next) => {
  try {
    const phone = (req.body && req.body.phone) || null;
    if (phone) await query('UPDATE users SET phone = ? WHERE id = ?', [messergo.toE164(phone), req.user.id]);
    const rows = await query('SELECT phone FROM users WHERE id = ?', [req.user.id]);
    const target = rows[0] && rows[0].phone;
    if (!target) return res.status(400).json({ error: 'אין מספר טלפון לאימות' });
    const r = await otp.requestOtp({ phone: target, purpose: 'verify' });
    if (!r.ok && r.error === 'too_soon') return res.status(429).json({ error: 'נשלח קוד לאחרונה, נסה שוב בעוד רגע' });
    if (!r.ok) return res.status(502).json({ error: 'שליחת הקוד נכשלה' });
    res.json({ ok: true, mocked: r.mocked, devCode: r.devCode });
  } catch (e) { next(e); }
});

router.post('/phone/verify-confirm', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const rows = await query('SELECT phone FROM users WHERE id = ?', [req.user.id]);
    const target = rows[0] && rows[0].phone;
    if (!target || !code) return res.status(400).json({ error: 'חסר קוד' });
    const v = await otp.verifyOtp({ phone: target, code, purpose: 'verify' });
    if (!v.ok) return res.status(401).json({ error: 'קוד שגוי או שפג תוקפו' });
    await query('UPDATE users SET phone_verified_at = NOW() WHERE id = ?', [req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id, username, display_name, first_name, last_name, email, phone, phone_verified_at, role, company_id, agency_id, language FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'משתמש לא נמצא' });
    const u = rows[0];
    const name = u.display_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username;
    res.json({ user: { ...rows[0], name, impersonated_by: req.user.impersonated_by } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
