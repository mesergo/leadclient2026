const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

const FIELDS = `id, name, monthly_price, quota_users, quota_numbers, quota_leads, quota_channels,
  overage_users, overage_numbers, overage_leads, overage_channels, is_trial_default, created_at`;

const num = (v) => (v === '' || v == null ? null : Number(v));

// anyone signed in can read packages (needed to show plan info); only super_admin writes
router.get('/', asyncHandler(async (req, res) => {
  const rows = await query(`SELECT ${FIELDS} FROM packages ORDER BY monthly_price, id`);
  res.json({ packages: rows });
}));

router.post('/', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.name.trim()) return res.status(400).json({ error: 'חסר שם חבילה' });
  const r = await query(
    `INSERT INTO packages (name, monthly_price, quota_users, quota_numbers, quota_leads, quota_channels,
       overage_users, overage_numbers, overage_leads, overage_channels, is_trial_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.name.trim(), num(b.monthly_price) || 0, num(b.quota_users), num(b.quota_numbers), num(b.quota_leads), num(b.quota_channels),
     num(b.overage_users), num(b.overage_numbers), num(b.overage_leads), num(b.overage_channels), b.is_trial_default ? 1 : 0]);
  if (b.is_trial_default) await query('UPDATE packages SET is_trial_default = 0 WHERE id <> ?', [r.insertId]);
  const rows = await query(`SELECT ${FIELDS} FROM packages WHERE id = ?`, [r.insertId]);
  res.status(201).json({ package: rows[0] });
}));

router.patch('/:id', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const cols = ['name', 'monthly_price', 'quota_users', 'quota_numbers', 'quota_leads', 'quota_channels',
    'overage_users', 'overage_numbers', 'overage_leads', 'overage_channels'];
  const sets = [], params = [];
  for (const c of cols) if (b[c] !== undefined) { sets.push(`${c} = ?`); params.push(c === 'name' ? b[c] : num(b[c])); }
  if (b.is_trial_default !== undefined) { sets.push('is_trial_default = ?'); params.push(b.is_trial_default ? 1 : 0); }
  if (sets.length) { params.push(req.params.id); await query(`UPDATE packages SET ${sets.join(', ')} WHERE id = ?`, params); }
  if (b.is_trial_default) await query('UPDATE packages SET is_trial_default = 0 WHERE id <> ?', [req.params.id]);
  const rows = await query(`SELECT ${FIELDS} FROM packages WHERE id = ?`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'חבילה לא נמצאה' });
  res.json({ package: rows[0] });
}));

router.delete('/:id', requireRole('super_admin'), asyncHandler(async (req, res) => {
  await query('UPDATE companies SET package_id = NULL WHERE package_id = ?', [req.params.id]);
  await query('DELETE FROM packages WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
