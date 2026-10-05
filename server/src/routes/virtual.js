const express = require('express');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// Virtual numbers, scoped by role (super=all, agency=own agency, company=own).
// Each number carries its channel's lead count within an optional date range.
router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'p.company_id');
  const { start, end, agency, company_id } = req.query;
  const params = [...s.params];
  let where = s.sql;
  if (agency === 'none') { where += ' AND (p.company_id IS NULL OR c.agency_id IS NULL)'; }
  else if (agency) { where += ' AND c.agency_id = ?'; params.push(agency); }
  if (company_id) { where += ' AND p.company_id = ?'; params.push(company_id); }
  const rows = await query(
    `SELECT p.id, p.company_id, p.service_id, p.ivr_provider, p.phone_number, p.number_to_display,
            p.redirect_to_number, p.is_premium, p.is_visible,
            c.name AS company_name, c.agency_id, a.name AS agency_name, sv.name AS service_name
     FROM phone_numbers p
     LEFT JOIN companies c ON c.id = p.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.id = p.service_id
     WHERE (${where})
     ORDER BY a.name, c.name, p.phone_number
     LIMIT 1000`, params);

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

// ---- add a virtual number manually ----
router.post('/', asyncHandler(async (req, res) => {
  const { company_id, service_id, phone_number, number_to_display, redirect_to_number, ivr_provider } = req.body || {};
  if (!phone_number) return res.status(400).json({ error: 'חסר מספר טלפון' });
  if (company_id && canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const r = await query(
    `INSERT INTO phone_numbers (company_id, service_id, ivr_provider, phone_number, number_to_display, redirect_to_number)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [company_id || null, service_id || null, ivr_provider || 'maskyoo', phone_number,
      number_to_display || phone_number, redirect_to_number || null]);
  res.status(201).json({ id: r.insertId });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM phone_numbers WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'מספר לא נמצא' });
  const f = ['company_id', 'service_id', 'phone_number', 'number_to_display', 'redirect_to_number', 'ivr_provider', 'is_premium', 'is_visible'];
  const sets = [], params = [];
  for (const k of f) if (req.body[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k]); }
  if (sets.length) { params.push(req.params.id); await query(`UPDATE phone_numbers SET ${sets.join(', ')} WHERE id = ?`, params); }
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM phone_numbers WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'מספר לא נמצא' });
  await query('DELETE FROM phone_numbers WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
