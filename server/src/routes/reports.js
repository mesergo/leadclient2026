const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'l.company_id');
  const params = [...s.params];
  let extra = '';
  const { company_id, start, end } = req.query;
  if (company_id) { extra += ' AND l.company_id = ?'; params.push(company_id); }
  if (start) { extra += ' AND l.created_at >= ?'; params.push(start); }
  if (end) { extra += ' AND l.created_at <= ?'; params.push(end); }
  const byStatus = await query(
    `SELECT st.text AS status, COUNT(*) AS n FROM leads l
     LEFT JOIN lead_statuses st ON st.id = l.status_id
     WHERE (${s.sql})${extra} GROUP BY l.status_id ORDER BY n DESC`, params);
  const byService = await query(
    `SELECT sv.name AS service, COUNT(*) AS n FROM leads l
     LEFT JOIN services sv ON sv.id = l.service_id
     WHERE (${s.sql})${extra} GROUP BY l.service_id ORDER BY n DESC`, params);
  res.json({ byStatus, byService });
}));

module.exports = router;
