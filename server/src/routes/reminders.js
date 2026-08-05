const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// reminders scoped through their lead's company
router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'l.company_id');
  const rows = await query(
    `SELECT r.id, r.lead_id, r.lead_name, r.reminder_at, r.comment, r.user_id
     FROM reminders r JOIN leads l ON l.id = r.lead_id
     WHERE (${s.sql}) ORDER BY r.reminder_at ASC LIMIT 200`, s.params);
  res.json({ reminders: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { lead_id, reminder_at, comment } = req.body || {};
  if (!lead_id || !reminder_at) return res.status(400).json({ error: 'חסרים שדות חובה' });
  const s = companyScope(req.user, 'company_id');
  const lead = await query(`SELECT id, lead_name FROM leads WHERE id = ? AND (${s.sql})`, [lead_id, ...s.params]);
  if (!lead[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  const r = await query('INSERT INTO reminders (lead_id, user_id, lead_name, reminder_at, comment) VALUES (?, ?, ?, ?, ?)',
    [lead_id, req.user.id, lead[0].lead_name, reminder_at, comment || null]);
  res.status(201).json({ reminder: { id: r.insertId } });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'l.company_id');
  const owned = await query(`SELECT r.id FROM reminders r JOIN leads l ON l.id = r.lead_id WHERE r.id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'תזכורת לא נמצאה' });
  await query('DELETE FROM reminders WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
