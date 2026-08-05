const express = require('express');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const params = [...s.params];
  let extra = '';
  if (req.query.q) { extra += ' AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const v = '%' + req.query.q + '%'; params.push(v, v, v, v); }
  if (req.query.active_only === '1') extra += ' AND is_active = 1';
  const rows = await query(
    `SELECT id, company_id, first_name, last_name, phone, phone2, email, img, is_active, created_at
     FROM contacts WHERE (${s.sql})${extra} ORDER BY created_at DESC LIMIT 500`, params);
  res.json({ contacts: rows });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const rows = await query(`SELECT * FROM contacts WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!rows[0]) return res.status(404).json({ error: 'איש קשר לא נמצא' });
  const convos = await query('SELECT id, user_id, content, send_by, from_me, created_at FROM contact_conversations WHERE contact_id = ? ORDER BY created_at DESC', [req.params.id]);
  res.json({ contact: rows[0], conversations: convos });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { company_id, first_name, last_name, phone, email } = req.body || {};
  if (!company_id || (!phone && !email)) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const r = await query('INSERT INTO contacts (company_id, first_name, last_name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [company_id, first_name || null, last_name || null, phone || null, email || null]);
  res.status(201).json({ contact: { id: r.insertId } });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM contacts WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'איש קשר לא נמצא' });
  const editable = ['first_name', 'last_name', 'phone', 'phone2', 'email', 'info', 'is_active'];
  const sets = [], params = [];
  for (const f of editable) if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
  if (sets.length) { params.push(req.params.id); await query(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`, params); }
  res.json({ ok: true });
}));

module.exports = router;
