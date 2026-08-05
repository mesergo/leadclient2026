const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const params = [...s.params];
  let extra = '';
  if (req.query.company_id) { extra = ' AND company_id = ?'; params.push(req.query.company_id); }
  const rows = await query(
    `SELECT id, company_id, text, color, sort_order, is_static, is_waiting, is_finished, for_notification
     FROM lead_statuses WHERE (${s.sql})${extra} ORDER BY sort_order ASC`, params);
  res.json({ statuses: rows });
}));

router.post('/', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const { company_id, text, color, sort_order } = req.body || {};
  if (!company_id || !text) return res.status(400).json({ error: 'חסרים שדות חובה' });
  const r = await query('INSERT INTO lead_statuses (company_id, text, color, sort_order) VALUES (?, ?, ?, ?)',
    [company_id, text, color || '#888888', sort_order || 0]);
  const rows = await query('SELECT id, company_id, text, color, sort_order FROM lead_statuses WHERE id = ?', [r.insertId]);
  res.status(201).json({ status: rows[0] });
}));

router.patch('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM lead_statuses WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'סטטוס לא נמצא' });
  const { text, color, sort_order } = req.body || {};
  await query('UPDATE lead_statuses SET text = COALESCE(?, text), color = COALESCE(?, color), sort_order = COALESCE(?, sort_order) WHERE id = ?',
    [text ?? null, color ?? null, sort_order ?? null, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const r = await query(`DELETE FROM lead_statuses WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!r.affectedRows) return res.status(404).json({ error: 'סטטוס לא נמצא' });
  res.json({ ok: true });
}));

module.exports = router;
