const express = require('express');
const { query, agencyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// templates are per-agency
router.get('/', asyncHandler(async (req, res) => {
  const s = agencyScope(req.user, 'agency_id');
  const params = [...s.params];
  let extra = '';
  if (req.query.agency_id) { extra = ' AND agency_id = ?'; params.push(req.query.agency_id); }
  const rows = await query(
    `SELECT id, agency_id, name, type, body, for_whatsapp, for_sms, is_template
     FROM message_templates WHERE (${s.sql})${extra} ORDER BY id DESC`, params);
  res.json({ templates: rows });
}));

router.post('/', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const { agency_id, name, body, type, for_whatsapp, for_sms } = req.body || {};
  if (!name || !body) return res.status(400).json({ error: 'חסרים שדות חובה' });
  const r = await query('INSERT INTO message_templates (agency_id, name, body, type, for_whatsapp, for_sms) VALUES (?, ?, ?, ?, ?, ?)',
    [agency_id || req.user.agency_id || null, name, body, type || 'manual', for_whatsapp ? 1 : 0, for_sms ? 1 : 0]);
  res.status(201).json({ template: { id: r.insertId } });
}));

router.delete('/:id', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const s = agencyScope(req.user, 'agency_id');
  const r = await query(`DELETE FROM message_templates WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!r.affectedRows) return res.status(404).json({ error: 'תבנית לא נמצאה' });
  res.json({ ok: true });
}));

module.exports = router;
