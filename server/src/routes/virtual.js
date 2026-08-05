const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'p.company_id');
  const rows = await query(
    `SELECT p.id, p.company_id, p.service_id, p.ivr_provider, p.phone_number, p.number_to_display,
            p.redirect_to_number, p.is_premium, p.is_visible, c.name AS company_name
     FROM phone_numbers p LEFT JOIN companies c ON c.id = p.company_id
     WHERE (${s.sql}) ORDER BY p.phone_number LIMIT 500`, s.params);
  res.json({ numbers: rows });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM phone_numbers WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'מספר לא נמצא' });
  await query('UPDATE phone_numbers SET redirect_to_number = COALESCE(?, redirect_to_number) WHERE id = ?',
    [req.body.redirect_to_number ?? null, req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
