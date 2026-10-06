const express = require('express');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const messergo = require('../services/messergo');

const router = express.Router();
router.use(requireAuth);

// Options for the dialer dropdowns, scoped to the signed-in user's company:
// the agents' mobiles, the channels' forwarding targets, and the virtual numbers.
router.get('/options', asyncHandler(async (req, res) => {
  const cid = req.user.company_id;
  if (!cid) return res.json({ mobiles: [], targets: [], virtuals: [] });
  const mobiles = await query(
    `SELECT COALESCE(NULLIF(display_name,''), NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)),''), username) AS name, phone
       FROM users WHERE company_id = ? AND is_active = 1 AND phone IS NOT NULL AND phone <> '' ORDER BY name`, [cid]);
  const t = await query(
    `SELECT DISTINCT redirect_to_number AS n FROM phone_numbers
       WHERE company_id = ? AND redirect_to_number IS NOT NULL AND redirect_to_number <> ''`, [cid]);
  const virtuals = await query(
    'SELECT id, phone_number, number_to_display FROM phone_numbers WHERE company_id = ? ORDER BY phone_number', [cid]);
  res.json({ mobiles, targets: t.map((x) => x.n), virtuals });
}));

// Register a pending callback: when `from_number` next calls in, the system routes
// that call to `target_number` (logged as an outgoing call). Supersedes any prior pending one.
router.post('/', asyncHandler(async (req, res) => {
  const { from_number, via_number, target_number } = req.body || {};
  if (!from_number || !target_number) return res.status(400).json({ error: 'חסר מספר מוצא או יעד' });
  const from = messergo.toE164(from_number);
  const target = messergo.toE164(target_number);
  const via = via_number ? messergo.toE164(via_number) : null;
  await query("UPDATE callbacks SET status = 'expired' WHERE from_number = ? AND status = 'pending'", [from]);
  const r = await query(
    'INSERT INTO callbacks (company_id, user_id, from_number, via_number, target_number) VALUES (?, ?, ?, ?, ?)',
    [req.user.company_id || null, req.user.id, from, via, target]);
  res.status(201).json({ ok: true, id: r.insertId });
}));

module.exports = router;
