const express = require('express');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { logPhone, companyChangeAction } = require('../services/phoneLog');

const router = express.Router();
router.use(requireAuth);
const who = (u) => ({ userId: u.id, userName: u.name || u.display_name || u.username || '' });
// store numbers in a uniform international format (972XXXXXXXXX)
const toIntl = (n) => { const d = String(n || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('972')) return d; if (d.startsWith('0')) return '972' + d.slice(1); return '972' + d; };
// derive a readable local display (0XX-XXXXXXX) from the international number
function toLocalDisplay(intl) {
  const d = String(intl || '').replace(/\D/g, '');
  if (!d) return '';
  const local = d.startsWith('972') ? '0' + d.slice(3) : (d.startsWith('0') ? d : '0' + d);
  const three = /^0(5\d|7\d)(\d{4,})$/.exec(local); // mobile 05x / VoIP 07x: 3-digit prefix
  if (three) return `0${three[1]}-${three[2]}`;
  const two = /^0(\d)(\d{5,})$/.exec(local);          // landline: 2-digit prefix
  if (two) return `0${two[1]}-${two[2]}`;
  return local;
}

// Virtual numbers = the pool. company_id NULL = available (offered for new channels).
router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'p.company_id');
  const { start, end, agency, company_id, available } = req.query;
  const params = [...s.params];
  let where = s.sql;
  if (available === '1') where += ' AND p.company_id IS NULL';
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

  const serviceIds = [...new Set(rows.map((r) => r.service_id).filter(Boolean))];
  const counts = {};
  if (serviceIds.length) {
    const p2 = [...serviceIds];
    let dateSql = '';
    if (start) { dateSql += ' AND created_at >= ?'; p2.push(start + ' 00:00:00'); }
    if (end) { dateSql += ' AND created_at <= ?'; p2.push(end + ' 23:59:59'); }
    const cRows = await query(
      `SELECT service_id, COUNT(*) n FROM leads WHERE service_id IN (${serviceIds.map(() => '?').join(',')})${dateSql} GROUP BY service_id`, p2);
    for (const cr of cRows) counts[cr.service_id] = Number(cr.n);
  }
  res.json({ numbers: rows.map((r) => ({ ...r, leads_count: r.service_id ? (counts[r.service_id] || 0) : 0, available: !r.company_id })) });
}));

// ---- add a number to the pool (available by default; company optional) ----
router.post('/', asyncHandler(async (req, res) => {
  const { company_id, phone_number, number_to_display, ivr_provider } = req.body || {};
  if (!phone_number) return res.status(400).json({ error: 'חסר מספר טלפון' });
  if (company_id && canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const intl = toIntl(phone_number);
  const r = await query(
    `INSERT INTO phone_numbers (company_id, ivr_provider, phone_number, number_to_display)
     VALUES (?, ?, ?, ?)`,
    [company_id || null, ivr_provider || 'maskyoo', intl, number_to_display || toLocalDisplay(intl)]);
  await logPhone(r.insertId, 'created', { ...who(req.user), toCompanyId: company_id || null, note: phone_number });
  if (company_id) await logPhone(r.insertId, 'assigned', { ...who(req.user), toCompanyId: company_id });
  res.status(201).json({ id: r.insertId });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT * FROM phone_numbers WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  const cur = owned[0];
  if (!cur) return res.status(404).json({ error: 'מספר לא נמצא' });
  if (req.body.company_id && canAccessCompany(req.user, req.body.company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  if (req.body.phone_number !== undefined && req.body.phone_number) {
    req.body.phone_number = toIntl(req.body.phone_number);
    if (!req.body.number_to_display) req.body.number_to_display = toLocalDisplay(req.body.phone_number); // auto display
  }
  const f = ['company_id', 'service_id', 'phone_number', 'number_to_display', 'redirect_to_number', 'ivr_provider', 'is_premium', 'is_visible'];
  const sets = [], params = [];
  for (const k of f) if (req.body[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k] === '' ? null : req.body[k]); }
  if (sets.length) { params.push(req.params.id); await query(`UPDATE phone_numbers SET ${sets.join(', ')} WHERE id = ?`, params); }

  // log a company change (assign / transfer / release)
  if (req.body.company_id !== undefined) {
    const newC = req.body.company_id || null;
    const act = companyChangeAction(cur.company_id, newC);
    if (act) await logPhone(cur.id, act, { ...who(req.user), fromCompanyId: cur.company_id || null, toCompanyId: newC, serviceId: req.body.service_id ?? cur.service_id });
  } else if (sets.length) {
    await logPhone(cur.id, 'updated', { ...who(req.user), toCompanyId: cur.company_id || null });
  }
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id, company_id, phone_number FROM phone_numbers WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'מספר לא נמצא' });
  await logPhone(owned[0].id, 'deleted', { ...who(req.user), fromCompanyId: owned[0].company_id || null, note: owned[0].phone_number });
  await query('DELETE FROM phone_numbers WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---- change log for one number ----
router.get('/:id/log', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM phone_numbers WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0] && req.user.role !== 'super_admin') return res.status(404).json({ error: 'מספר לא נמצא' });
  try {
    const rows = await query(
      `SELECT l.id, l.action, l.from_company_id, l.to_company_id, l.service_id, l.user_name, l.note, l.created_at,
              fc.name AS from_company, tc.name AS to_company, sv.name AS service_name
       FROM phone_number_log l
       LEFT JOIN companies fc ON fc.id = l.from_company_id
       LEFT JOIN companies tc ON tc.id = l.to_company_id
       LEFT JOIN services sv ON sv.id = l.service_id
       WHERE l.phone_number_id = ? ORDER BY l.id DESC LIMIT 200`, [req.params.id]);
    res.json({ log: rows });
  } catch (e) { if (e.code === 'ER_NO_SUCH_TABLE') return res.json({ log: [] }); throw e; }
}));

module.exports = router;
