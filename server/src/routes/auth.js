const express = require('express');
const crypto = require('crypto');
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
    user: {
      id: user.id, name: user.display_name || user.username, role: user.role,
      company_id: user.company_id, agency_id: user.agency_id, phone_verified_at: user.phone_verified_at || null,
    },
  };
}

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'חסר שם משתמש או סיסמה' });
    const cols = 'id, username, display_name, role, company_id, agency_id, password_hash, is_active, phone_verified_at';
    let rows = await query(`SELECT ${cols} FROM users WHERE username = ? LIMIT 1`, [username]);
    let user = rows[0];
    // fall back to email — but only when it resolves to exactly one active, password user
    if (!user && String(username).includes('@')) {
      const byEmail = await query(`SELECT ${cols} FROM users WHERE email = ? AND is_active = 1 AND password_hash IS NOT NULL`, [username]);
      if (byEmail.length === 1) user = byEmail[0];
    }
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
    res.json(sessionPayload(user));
  } catch (e) {
    next(e);
  }
});

// --- Public self-registration (trial account) -------------------------------
// With a :token the agency is taken from its public_token; without one it falls
// back to the agency flagged is_default_signup. Creates a company (trial, no
// virtual number) + a company_admin user, then signs them in. No packages/payment.
// Phone gets verified at first entry via the usual gate. Google signup supported.
async function resolveSignupAgency(token) {
  if (token) {
    const r = await query('SELECT id, name FROM agencies WHERE public_token = ? AND is_active = 1 LIMIT 1', [token]);
    return r[0] || null;
  }
  const r = await query('SELECT id, name FROM agencies WHERE is_default_signup = 1 AND is_active = 1 LIMIT 1');
  return r[0] || null;
}

const httpErr = (status, message) => Object.assign(new Error(message), { status });

// Create a trial company + company_admin user under `agency`. For Google signup
// pass google_id (and no password/company_name/phone are required).
async function createTrialAccount(agency, { company_name, full_name, email, phone, password, google_id }) {
  if (!full_name || !email) throw httpErr(400, 'חסרים שדות חובה');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpErr(400, 'כתובת אימייל לא תקינה');
  if (!google_id) {
    if (!company_name || !phone || !password) throw httpErr(400, 'חסרים שדות חובה');
    if (String(password).length < 6) throw httpErr(400, 'הסיסמה חייבת לפחות 6 תווים');
  }
  const exists = await query('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1', [email, email]);
  if (exists[0]) throw httpErr(409, 'כבר קיים משתמש עם אימייל זה');

  const compName = (company_name && company_name.trim()) || String(full_name).trim();
  const comp = await query(
    'INSERT INTO companies (name, agency_id, public_token, is_trial, created_at) VALUES (?, ?, ?, 1, NOW())',
    [compName, agency.id, crypto.randomUUID()]);
  await query(
    `INSERT INTO lead_statuses (company_id, text, color, sort_order, is_waiting, is_finished) VALUES
     (?, 'חדש', '#4f46e5', 1, 1, 0), (?, 'טופל', '#16a34a', 2, 0, 1), (?, 'בוטל', '#dc2626', 3, 0, 1)`,
    [comp.insertId, comp.insertId, comp.insertId]);
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const u = await query(
    `INSERT INTO users (company_id, agency_id, role, username, email, display_name, phone, password_hash, google_id, language, is_active, created_at)
     VALUES (?, ?, 'company_admin', ?, ?, ?, ?, ?, ?, 'he', 1, NOW())`,
    [comp.insertId, agency.id, email, email, String(full_name).trim(), phone ? messergo.toE164(phone) : null, hash, google_id || null]);
  return sessionPayload({
    id: u.insertId, username: email, display_name: full_name, role: 'company_admin',
    company_id: comp.insertId, agency_id: agency.id, phone_verified_at: null,
  });
}

async function infoHandler(req, res, next) {
  try {
    const agency = await resolveSignupAgency(req.params.token);
    if (!agency) return res.status(404).json({ error: req.params.token ? 'קישור הרשמה לא תקין' : 'הרשמה אינה זמינה כרגע' });
    res.json({ agency: { name: agency.name } });
  } catch (e) { next(e); }
}

async function registerHandler(req, res, next) {
  try {
    const agency = await resolveSignupAgency(req.params.token);
    if (!agency) return res.status(404).json({ error: req.params.token ? 'קישור הרשמה לא תקין' : 'הרשמה אינה זמינה כרגע' });
    res.status(201).json(await createTrialAccount(agency, req.body || {}));
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
}

// Google signup: existing Google/email user -> just sign in; otherwise create a trial.
async function googleRegisterHandler(req, res, next) {
  try {
    const token = req.params.token || (req.body && req.body.token);
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
      if (user) await query('UPDATE users SET google_id = ? WHERE id = ?', [p.sub, user.id]);
    }
    if (user) { // already registered -> sign in
      if (user.role === 'agency_admin' && !user.agency_id && user.company_id) {
        const c = await query('SELECT agency_id FROM companies WHERE id = ?', [user.company_id]);
        if (c[0]) user.agency_id = c[0].agency_id;
      }
      return res.json(sessionPayload(user));
    }
    const agency = await resolveSignupAgency(token);
    if (!agency) return res.status(404).json({ error: token ? 'קישור הרשמה לא תקין' : 'הרשמה אינה זמינה כרגע' });
    res.status(201).json(await createTrialAccount(agency, { full_name: p.name || p.email, email: p.email, google_id: p.sub }));
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
}

// more specific routes first so "google" is not captured as :token
router.post('/register/google', googleRegisterHandler);
router.post('/register/:token/google', googleRegisterHandler);
router.get('/register', infoHandler);
router.get('/register/:token', infoHandler);
router.post('/register', registerHandler);
router.post('/register/:token', registerHandler);

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
    if (!r.ok) return res.status(502).json({ error: 'שליחת הקוד נכשלה' + (r.error && r.error !== 'send_failed' ? `: ${r.error}` : '') });
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
