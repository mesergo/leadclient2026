const express = require('express');
const bcrypt = require('bcryptjs');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth, requireRole('super_admin', 'agency_admin', 'company_admin'));

const FIELDS = `u.id, u.username, u.email, u.first_name, u.last_name, u.display_name, u.role,
  u.company_id, u.agency_id, u.phone, u.current_status, u.last_seen_at, u.is_active, u.created_at`;

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'u.company_id');
  const params = [...s.params];
  let extra = '';
  if (req.query.company_id) { extra += ' AND u.company_id = ?'; params.push(req.query.company_id); }
  if (req.query.q) { extra += ' AND (u.display_name LIKE ? OR u.email LIKE ?)'; params.push('%' + req.query.q + '%', '%' + req.query.q + '%'); }
  const rows = await query(
    `SELECT ${FIELDS}, c.name AS company_name FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE (${s.sql})${extra} ORDER BY u.created_at DESC LIMIT 500`, params);
  res.json({ users: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { username, password, email, first_name, last_name, display_name, role, company_id, phone } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'חסר שם משתמש או סיסמה' });
  if (company_id && canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const hash = await bcrypt.hash(password, 10);
  const r = await query(
    `INSERT INTO users (username, password_hash, email, first_name, last_name, display_name, role, company_id, phone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [username, hash, email || null, first_name || null, last_name || null, display_name || username, role || 'company_user', company_id || null, phone || null]);
  const rows = await query(`SELECT ${FIELDS} FROM users u WHERE u.id = ?`, [r.insertId]);
  res.status(201).json({ user: rows[0] });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM users WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'משתמש לא נמצא' });
  const editable = ['email', 'first_name', 'last_name', 'display_name', 'role', 'phone', 'is_active'];
  const sets = [], params = [];
  for (const f of editable) if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
  if (req.body.password) { sets.push('password_hash = ?'); params.push(await bcrypt.hash(req.body.password, 10)); }
  if (sets.length) { params.push(req.params.id); await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params); }
  const rows = await query(`SELECT ${FIELDS} FROM users u WHERE u.id = ?`, [req.params.id]);
  res.json({ user: rows[0] });
}));

module.exports = router;
