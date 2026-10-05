const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// Raw inbound webhook attempts (Maskyoo calls, widget intake, etc.).
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { source, result, limit } = req.query;
    const lim = Math.min(Number(limit) || 200, 1000);
    const where = [], params = [];
    if (req.user.role !== 'super_admin') { const s = companyScope(req.user, 'company_id'); where.push(`(${s.sql})`); params.push(...s.params); }
    if (source) { where.push('source = ?'); params.push(source); }
    if (result) { where.push('result = ?'); params.push(result); }
    const rows = await query(
      `SELECT id, source, method, path, ip, query_data, body_data, matched_number_id, company_id, lead_id, result, error, created_at
       FROM webhook_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${lim}`, params);
    res.json({ logs: rows });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return res.json({ logs: [] });
    throw e;
  }
}));

// clear the log (super admin only)
router.delete('/', requireRole('super_admin'), asyncHandler(async (req, res) => {
  await query('DELETE FROM webhook_log').catch(() => {});
  res.json({ ok: true });
}));

module.exports = router;
