const express = require('express');
const { query, companyScope, leadScope } = require('../db/pool');
const { requireAuth, loadLeadRestriction } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth, loadLeadRestriction);

// reminders scoped through their lead's company
// ?mine=1 (own reminders) &from=&to=YYYY-MM-DD (Israel dates) &include_done=1 (done are hidden by default)
router.get('/', asyncHandler(async (req, res) => {
  const s = leadScope(req.user, 'l');
  const params = [...s.params];
  let extra = '';
  const { mine, from, to, include_done } = req.query;
  if (mine === '1' || mine === 'true') { extra += ' AND r.user_id = ?'; params.push(req.user.id); }
  if (from) { extra += ' AND r.reminder_at >= ?'; params.push(from + ' 00:00:00'); }
  if (to) { extra += ' AND r.reminder_at <= ?'; params.push(to + ' 23:59:59'); }
  if (!(include_done === '1' || include_done === 'true')) extra += ' AND r.done_at IS NULL';
  const rows = await query(
    `SELECT r.id, r.lead_id, r.lead_name, r.reminder_at, r.comment, r.user_id, r.done_at
     FROM reminders r JOIN leads l ON l.id = r.lead_id
     WHERE (${s.sql})${extra} ORDER BY r.reminder_at ASC LIMIT 200`, params);
  res.json({ reminders: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { lead_id, reminder_at, comment } = req.body || {};
  if (!lead_id || !reminder_at) return res.status(400).json({ error: 'חסרים שדות חובה' });
  const s = leadScope(req.user);
  const lead = await query(`SELECT id, lead_name FROM leads WHERE id = ? AND (${s.sql})`, [lead_id, ...s.params]);
  if (!lead[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  const r = await query('INSERT INTO reminders (lead_id, user_id, lead_name, reminder_at, comment) VALUES (?, ?, ?, ?, ?)',
    [lead_id, req.user.id, lead[0].lead_name, reminder_at, comment || null]);
  await query('UPDATE leads SET updated_at = NOW() WHERE id = ?', [lead_id]);
  res.status(201).json({ reminder: { id: r.insertId } });
}));

// mark done / undone: { done: true | false }
router.patch('/:id', asyncHandler(async (req, res) => {
  const s = leadScope(req.user, 'l');
  const owned = await query(`SELECT r.id, r.lead_id FROM reminders r JOIN leads l ON l.id = r.lead_id WHERE r.id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'תזכורת לא נמצאה' });
  if (typeof (req.body || {}).done !== 'boolean') return res.status(400).json({ error: 'חסר done' });
  await query('UPDATE reminders SET done_at = IF(?, NOW(), NULL) WHERE id = ?', [req.body.done ? 1 : 0, req.params.id]);
  await query('UPDATE leads SET updated_at = NOW() WHERE id = ?', [owned[0].lead_id]);
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const s = leadScope(req.user, 'l');
  const owned = await query(`SELECT r.id FROM reminders r JOIN leads l ON l.id = r.lead_id WHERE r.id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'תזכורת לא נמצאה' });
  await query('DELETE FROM reminders WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
