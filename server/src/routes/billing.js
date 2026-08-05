const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth, requireRole('super_admin', 'agency_admin'));

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'b.company_id');
  const params = [...s.params];
  let extra = '';
  if (req.query.month) { extra = ' AND b.billing_month = ?'; params.push(req.query.month); }
  const rows = await query(
    `SELECT b.id, b.company_id, b.agency_id, b.type, b.billing_month, b.bill_date, c.name AS company_name
     FROM bills b LEFT JOIN companies c ON c.id = b.company_id
     WHERE (${s.sql})${extra} ORDER BY b.bill_date DESC LIMIT 500`, params);
  const packages = await query('SELECT id, price, users, phones, leads FROM payment_packages ORDER BY price ASC');
  res.json({ bills: rows, packages });
}));

module.exports = router;
