const express = require('express');
const crypto = require('crypto');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const messergo = require('../services/messergo');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e || '');

// Does this email/phone already belong to a user? Returns null, 'same' or 'other'.
async function existingUser(companyId, email, phoneE164) {
  const parts = [], params = [];
  if (email) { parts.push('email = ?'); params.push(email); }
  if (phoneE164) { parts.push("REGEXP_REPLACE(phone,'[^0-9]','') LIKE CONCAT('%', ?)"); params.push(messergo.digits(phoneE164).slice(-9)); }
  if (!parts.length) return null;
  const rows = await query(`SELECT company_id FROM users WHERE is_active = 1 AND (${parts.join(' OR ')}) LIMIT 1`, params);
  if (!rows[0]) return null;
  return String(rows[0].company_id) === String(companyId) ? 'same' : 'other';
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
  const link = `${config.appUrl || ''}/invite/${token}`;

  // best-effort SMS of the link (if a phone was given and it is not a duplicate)
  if (phoneE164 && dup !== 'other') messergo.sendSms({ phone: phoneE164, text: `הוזמנת להצטרף ל-${ok[0].name} בלידקליינט: ${link}` }).catch(() => {});

  res.status(201).json({ ok: true, link, token, warning: dup });
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
