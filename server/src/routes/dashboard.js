const express = require('express');
const { query, companyScope, agencyScope } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// build a leads WHERE fragment from filters (date + agency/company/service) within scope
function leadFilter(req) {
  const s = companyScope(req.user, 'l.company_id');
  const params = [...s.params];
  let sql = s.sql;
  const { start, end, agency, company, service } = req.query;
  if (agency) { sql += ' AND l.company_id IN (SELECT id FROM companies WHERE agency_id = ?)'; params.push(agency); }
  if (company) { sql += ' AND l.company_id = ?'; params.push(company); }
  if (service) { sql += ' AND l.service_id = ?'; params.push(service); }
  if (start) { sql += ' AND l.created_at >= ?'; params.push(start + ' 00:00:00'); }
  if (end) { sql += ' AND l.created_at <= ?'; params.push(end + ' 23:59:59'); }
  return { sql, params };
}

router.get('/summary', asyncHandler(async (req, res) => {
  const { agency, company } = req.query;
  // totals (respect scope + agency/company selection, NOT date)
  const as = agencyScope(req.user, 'id');
  const aParams = [...as.params];
  let aSql = as.sql;
  if (agency) { aSql += ' AND id = ?'; aParams.push(agency); }
  const [ag] = await query(`SELECT COUNT(*) n FROM agencies WHERE ${aSql}`, aParams);

  const cScope = companyScope(req.user, 'id');
  const cParams = [...cScope.params]; let cSql = cScope.sql;
  if (agency) { cSql += ' AND agency_id = ?'; cParams.push(agency); }
  if (company) { cSql += ' AND id = ?'; cParams.push(company); }
  const [co] = await query(`SELECT COUNT(*) n FROM companies WHERE ${cSql}`, cParams);

  const uScope = companyScope(req.user, 'company_id');
  const uParams = [...uScope.params]; let uSql = uScope.sql;
  if (agency) { uSql += ' AND company_id IN (SELECT id FROM companies WHERE agency_id = ?)'; uParams.push(agency); }
  if (company) { uSql += ' AND company_id = ?'; uParams.push(company); }
  const [us] = await query(`SELECT COUNT(*) n FROM users WHERE ${uSql}`, uParams);

  // leads + conversion in date range
  const lf = leadFilter(req);
  const [le] = await query(`SELECT COUNT(*) n, SUM(is_converted) conv FROM leads l WHERE ${lf.sql}`, lf.params);
  const leads = le.n || 0;
  const conversion = leads ? (((le.conv || 0) / leads) * 100).toFixed(2) : '0.00';
  res.json({ agencies: ag.n, companies: co.n, users: us.n, leads, conversion });
}));

// agency breakdown table (leads filtered by date) — split queries to avoid cartesian blowup
router.get('/by-agency', asyncHandler(async (req, res) => {
  const { start, end } = req.query;
  const as = agencyScope(req.user, 'a.id');

  // 1) structure: companies + users per agency (cheap)
  const struct = await query(
    `SELECT a.id, a.name,
            COUNT(DISTINCT c.id) companies_count,
            COUNT(DISTINCT u.id) users_count
     FROM agencies a
     LEFT JOIN companies c ON c.agency_id = a.id
     LEFT JOIN users u ON u.company_id = c.id
     WHERE ${as.sql}
     GROUP BY a.id, a.name`,
    as.params
  );

  // 2) leads per agency in date range (single indexed scan, grouped)
  const cs = companyScope(req.user, 'l.company_id');
  const lParams = [...cs.params];
  let lWhere = cs.sql;
  if (start) { lWhere += ' AND l.created_at >= ?'; lParams.push(start + ' 00:00:00'); }
  if (end) { lWhere += ' AND l.created_at <= ?'; lParams.push(end + ' 23:59:59'); }
  const leadRows = await query(
    `SELECT c.agency_id aid, COUNT(*) leads_count, SUM(l.is_converted) conv
     FROM leads l JOIN companies c ON c.id = l.company_id
     WHERE ${lWhere}
     GROUP BY c.agency_id`,
    lParams
  );
  const leadMap = {};
  for (const r of leadRows) leadMap[r.aid] = r;

  const agencies = struct.map((a) => {
    const lr = leadMap[a.id];
    const leads = lr ? Number(lr.leads_count) : 0;
    const conv = lr ? Number(lr.conv || 0) : 0;
    return {
      id: a.id, name: a.name,
      companies_count: a.companies_count, users_count: a.users_count,
      leads_count: leads,
      conversion: leads ? ((conv / leads) * 100).toFixed(2) : '0.00',
    };
  }).sort((x, y) => y.leads_count - x.leads_count || x.name.localeCompare(y.name));

  res.json({ agencies });
}));

router.get('/online-users', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'u.company_id');
  const online = await query(
    `SELECT u.id, u.display_name FROM users u
     WHERE u.last_seen_at > (NOW() - INTERVAL 10 MINUTE) AND (${s.sql}) LIMIT 100`, s.params);
  const inCall = await query(
    `SELECT u.id, u.display_name FROM users u
     WHERE u.current_status IN ('inCall','onCall','busy') AND (${s.sql}) LIMIT 100`, s.params);
  res.json({ online, inCall });
}));

router.get('/recent', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const rows = await query(
    `SELECT id, content, icon, user_name, created_at FROM action_log
     WHERE (${s.sql}) ORDER BY created_at DESC LIMIT 10`, s.params);
  res.json({ actions: rows });
}));

// full activity feed (paginated)
router.get('/actions', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = await query(
    `SELECT id, content, icon, user_name, created_at FROM action_log
     WHERE (${s.sql}) ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, s.params);
  res.json({ actions: rows });
}));

module.exports = router;
