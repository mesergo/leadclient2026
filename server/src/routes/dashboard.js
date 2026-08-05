const express = require('express');
const { query, companyScope, agencyScope } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/summary', asyncHandler(async (req, res) => {
  const cs = companyScope(req.user, 'company_id');
  const as = agencyScope(req.user, 'id');
  const [agencies] = await query(`SELECT COUNT(*) AS n FROM agencies WHERE (${as.sql})`, as.params);
  const [companies] = await query(`SELECT COUNT(*) AS n FROM companies c WHERE (${companyScope(req.user, 'c.id').sql})`, companyScope(req.user, 'c.id').params);
  const [leads] = await query(`SELECT COUNT(*) AS n FROM leads WHERE (${cs.sql})`, cs.params);
  const [converted] = await query(`SELECT COUNT(*) AS n FROM leads WHERE is_converted = 1 AND (${cs.sql})`, cs.params);
  const [users] = await query(`SELECT COUNT(*) AS n FROM users u WHERE (${companyScope(req.user, 'u.company_id').sql})`, companyScope(req.user, 'u.company_id').params);
  const conv = leads.n ? ((converted.n / leads.n) * 100).toFixed(2) : '0.00';
  res.json({ agencies: agencies.n, companies: companies.n, users: users.n, leads: leads.n, conversion: conv });
}));

router.get('/recent', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const rows = await query(
    `SELECT id, content, icon, user_name, created_at FROM action_log WHERE (${s.sql}) ORDER BY created_at DESC LIMIT 20`, s.params);
  res.json({ actions: rows });
}));

router.get('/online-users', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'u.company_id');
  const rows = await query(
    `SELECT u.id, u.display_name, u.current_status FROM users u
     WHERE u.last_seen_at > (NOW() - INTERVAL 5 MINUTE) AND (${s.sql}) LIMIT 100`, s.params);
  res.json({ online: rows });
}));

module.exports = router;
