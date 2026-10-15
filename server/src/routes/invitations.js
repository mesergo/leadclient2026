const express = require('express');
const crypto = require('crypto');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole, forgetUser } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const messergo = require('../services/messergo');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e || '');

// Does this email/phone already belong to a user? Returns null, 'same' (already in this company),
// 'existing' (a company user elsewhere — accepting adds this company to their account, with a
// "connected to" switcher) or 'other' (an admin account that cannot join a company this way).
const MEMBER_ROLES = ['company_admin', 'company_user'];
async function findExisting(email, phoneE164) {
  const parts = [], params = [];
  if (email) { parts.push('email = ?'); params.push(email); }
  if (phoneE164) { parts.push("REGEXP_REPLACE(phone,'[^0-9]','') LIKE CONCAT('%', ?)"); params.push(messergo.digits(phoneE164).slice(-9)); }
  if (!parts.length) return null;
  return (await query(`SELECT id, company_id, role FROM users WHERE is_active = 1 AND (${parts.join(' OR ')}) ORDER BY id LIMIT 1`, params))[0] || null;
}
async function existingKind(companyId, u) {
  if (!u) return null;
  if (String(u.company_id) === String(companyId)) return 'same';
  const m = await query('SELECT 1 FROM user_companies WHERE user_id = ? AND company_id = ?', [u.id, companyId]);
  if (m.length) return 'same';
  return MEMBER_ROLES.includes(u.role) ? 'existing' : 'other';
}
async function existingUser(companyId, email, phoneE164) {
  return existingKind(companyId, await findExisting(email, phoneE164));
}

// Create an invitation. company_admin invites into their own company; managers
// pass company_id (within their scope).
router.post('/', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const { email, phone, role } = req.body || {};
  let companyId = (req.user.role === 'company_admin') ? req.user.company_id : req.body.company_id;
  if (!companyId) return res.status(400).json({ error: 'חסרה חברה' });
  const s = companyScope(req.user, 'id');
  const ok = await query(`SELECT id, name FROM companies WHERE id = ? AND (${s.sql})`, [companyId, ...s.params]);
  if (!ok[0]) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  if (!email && !phone) return res.status(400).json({ error: 'יש להזין אימייל או נייד' });
  if (email && !emailOk(email)) return res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
  const phoneE164 = phone ? messergo.toE164(phone) : null;
  if (phone && !/^972\d{8,9}$/.test(messergo.digits(phoneE164))) return res.status(400).json({ error: 'מספר נייד לא תקין' });

  const dup = await existingUser(companyId, email || null, phoneE164);
  const token = crypto.randomUUID();
  await query(
    `INSERT INTO employee_invites (company_id, invited_by, email, phone, token, role, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, (NOW() + INTERVAL 14 DAY))`,
    [companyId, req.user.id, email || null, phoneE164, token, role === 'company_admin' ? 'company_admin' : 'company_user']);
  // always an absolute link (it is also sent by SMS): APP_URL, else the local dev
  // origin the request came from, else the production public URL
  const origin = String(req.get('origin') || '');
  const base = config.appUrl || (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : config.publicUrl);
  const link = `${base}/invite/${token}`;

  // best-effort SMS of the link (if a phone was given and the invite can be used)
  if (phoneE164 && !dup) messergo.sendSms({ phone: phoneE164, text: `הוזמנת להצטרף ל-${ok[0].name} בלידקליינט: ${link}` }).catch(() => {});
  if (phoneE164 && dup === 'existing') messergo.sendSms({ phone: phoneE164, text: `הוזמנת להצטרף גם ל-${ok[0].name} בלידקליינט. אישור עם החשבון הקיים שלך: ${link}` }).catch(() => {});

  res.status(201).json({ ok: true, link, token, warning: dup });
}));

// An employee who already has an account accepts an invite to another company: signed in (as
// proof of identity), the invite's email/phone must be theirs. The company is added to their
// account (user_companies) — they then switch between companies ("connected to") or see all.
router.post('/:token/join', asyncHandler(async (req, res) => {
  const inv = (await query(
    `SELECT i.id, i.company_id, i.email, i.phone, i.role, i.status, i.expires_at, c.name AS company_name
       FROM employee_invites i JOIN companies c ON c.id = i.company_id WHERE i.token = ? LIMIT 1`, [req.params.token]))[0];
  if (!inv || inv.status !== 'pending' || (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now())) {
    return res.status(404).json({ error: 'קישור הזמנה לא תקין או שפג תוקפו' });
  }
  const me = (await query('SELECT id, company_id, role, email, phone FROM users WHERE id = ? AND is_active = 1', [req.user.id]))[0];
  if (!me) return res.status(401).json({ error: 'לא מחובר' });
  const k9 = (p) => messergo.digits(p || '').slice(-9);
  const emailMatch = inv.email && me.email && String(inv.email).toLowerCase() === String(me.email).toLowerCase();
  const phoneMatch = inv.phone && me.phone && k9(inv.phone).length >= 9 && k9(inv.phone) === k9(me.phone);
  if (!emailMatch && !phoneMatch) return res.status(403).json({ error: 'ההזמנה נשלחה לאימייל/נייד אחר — התחברו עם החשבון שאליו נשלחה', code: 'not_yours' });
  const kind = await existingKind(inv.company_id, me);
  if (kind === 'other') return res.status(400).json({ error: 'חשבון ניהול אינו יכול להצטרף לחברה דרך הזמנה. פנו לתמיכה.' });
  if (kind !== 'same') {
    await query('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
      [me.id, inv.company_id, inv.role === 'company_admin' ? 'company_admin' : 'company_user']);
  }
  await query("UPDATE employee_invites SET status = 'accepted', accepted_user_id = ? WHERE id = ?", [me.id, inv.id]);
  forgetUser(me.id);
  res.json({ ok: true, company: { id: inv.company_id, name: inv.company_name }, already: kind === 'same' });
}));

// List pending invites for the manager's scope.
router.get('/', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const rows = await query(
    `SELECT id, company_id, email, phone, status, created_at, expires_at FROM employee_invites
       WHERE (${s.sql}) AND status = 'pending' ORDER BY id DESC LIMIT 200`, s.params);
  res.json({ invitations: rows });
}));

router.delete('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  await query(`UPDATE employee_invites SET status = 'revoked' WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  res.json({ ok: true });
}));

module.exports = router;
module.exports.findExisting = findExisting;
module.exports.existingKind = existingKind;
