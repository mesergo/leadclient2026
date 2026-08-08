const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// Virtual numbers, scoped by role (super=all, agency=own agency, company=own).
// Each number carries its channel's lead count within an optional date range.
router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'p.company_id');
  const { start, end } = req.query;
  const rows = await query(
    `SELECT p.id, p.company_id, p.service_id, p.ivr_provider, p.phone_number, p.number_to_display,
            p.redirect_to_number, p.is_premium, p.is_visible,
            c.name AS company_name, c.agency_id, a.name AS agency_name, sv.name AS service_name
     FROM phone_numbers p
     LEFT JOIN companies c ON c.id = p.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.id = p.service_id
     WHERE (${s.sql})
     ORDER BY a.name, c.name, p.phone_number
     LIMIT 1000`, s.params);

  // lead counts per channel (service) within date range
  const serviceIds = [...new Set(rows.map((r) => r.service_id).filter(Boolean))];
  const counts = {};
  if (serviceIds.length) {
    const params = [...serviceIds];
    let dateSql = '';
    if (start) { dateSql += ' AND created_at >= ?'; params.push(start + ' 00:00:00'); }
    if (end) { dateSql += ' AND created_at <= ?'; params.push(end + ' 23:59:59'); }
    const cRows = await query(
      `SELECT service_id, COUNT(*) n FROM leads WHERE service_id IN (${serviceIds.map(() => '?').join(',')})${dateSql} GROUP BY service_id`,
      params
    );
    for (const cr of cRows) counts[cr.service_id] = Number(cr.n);
  }
  res.json({ numbers: rows.map((r) => ({ ...r, leads_count: r.service_id ? (counts[r.service_id] || 0) : 0 })) });
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
