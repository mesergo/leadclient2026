const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth, requireRole('super_admin', 'agency_admin', 'company_admin'));

// Per-company usage summary for a month: numbers, calls, minutes, SMS, leads.
router.get('/', asyncHandler(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const start = `${month}-01 00:00:00`;

  const extraFor = (col) => {
    let sql = '', params = [];
    if (req.query.agency) { sql += ` AND ${col} IN (SELECT id FROM companies WHERE agency_id = ?)`; params.push(req.query.agency); }
    if (req.query.company_id) { sql += ` AND ${col} = ?`; params.push(req.query.company_id); }
    return { sql, params };
  };

  // leads / calls / minutes
  const ls = companyScope(req.user, 'l.company_id');
  const le = extraFor('l.company_id');
  const leadRows = await query(
    `SELECT l.company_id,
            COUNT(*) leads,
            SUM(JSON_VALID(l.lead_info) AND JSON_EXTRACT(l.lead_info,'$.duration') IS NOT NULL) calls,
            ROUND(COALESCE(SUM(CASE WHEN JSON_VALID(l.lead_info)
              THEN CAST(JSON_EXTRACT(l.lead_info,'$.duration') AS UNSIGNED) ELSE 0 END), 0) / 60) minutes
     FROM leads l
     WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 MONTH) AND (${ls.sql})${le.sql}
     GROUP BY l.company_id`,
    [start, start, ...ls.params, ...le.params]);

  // virtual numbers (current count)
  const ps = companyScope(req.user, 'p.company_id');
  const pe = extraFor('p.company_id');
  const phoneRows = await query(
    `SELECT p.company_id, COUNT(*) numbers, COALESCE(SUM(p.is_premium), 0) premium
     FROM phone_numbers p WHERE (${ps.sql})${pe.sql} GROUP BY p.company_id`,
    [...ps.params, ...pe.params]);

  // SMS for the month
  const ss = companyScope(req.user, 'company_id');
  const se = extraFor('company_id');
  const smsRows = await query(
    `SELECT company_id, COALESCE(SUM(sms_count), 0) sms FROM sms_records
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH) AND (${ss.sql})${se.sql}
     GROUP BY company_id`,
    [start, start, ...ss.params, ...se.params]).catch(() => []);

  const map = new Map();
  const row = (id) => { if (!map.has(id)) map.set(id, { company_id: id, numbers: 0, premium: 0, calls: 0, minutes: 0, sms: 0, leads: 0 }); return map.get(id); };
  for (const r of phoneRows) { const x = row(r.company_id); x.numbers = Number(r.numbers); x.premium = Number(r.premium); }
  for (const r of leadRows) { const x = row(r.company_id); x.leads = Number(r.leads); x.calls = Number(r.calls); x.minutes = Number(r.minutes); }
  for (const r of smsRows) { const x = row(r.company_id); x.sms = Number(r.sms); }

  const ids = [...map.keys()];
  if (ids.length) {
    const names = await query(
      `SELECT c.id, c.name, a.name AS agency_name FROM companies c LEFT JOIN agencies a ON a.id = c.agency_id
       WHERE c.id IN (${ids.map(() => '?').join(',')})`, ids);
    const nm = new Map(names.map((n) => [String(n.id), n]));
    for (const [id, x] of map) { const n = nm.get(String(id)); x.company_name = n?.name || '—'; x.agency_name = n?.agency_name || '—'; }
  }
  const rows = [...map.values()].sort((a, b) => b.leads - a.leads);
  const prices = (await query('SELECT * FROM billing_defaults LIMIT 1'))[0] || null;
  res.json({ month, rows, prices });
}));

module.exports = router;
