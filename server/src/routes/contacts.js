const express = require('express');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

const digits9 = (s) => String(s ?? '').replace(/\D/g, '').slice(-9);

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'c.company_id');
  const params = [...s.params];
  let extra = '';
  if (req.query.agency) { extra += ' AND co.agency_id = ?'; params.push(req.query.agency); }
  if (req.query.company_id) { extra += ' AND c.company_id = ?'; params.push(req.query.company_id); }
  if (req.query.q) {
    extra += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';
    const v = '%' + req.query.q + '%'; params.push(v, v, v, v);
  }
  if (req.query.active_only === '1') extra += ' AND c.is_active = 1';
  const rows = await query(
    `SELECT c.id, c.company_id, c.first_name, c.last_name, c.phone, c.phone2, c.email, c.is_active, c.created_at,
            co.name AS company_name
     FROM contacts c LEFT JOIN companies co ON co.id = c.company_id
     WHERE (${s.sql})${extra} ORDER BY c.created_at DESC LIMIT 300`, params);
  res.json({ contacts: rows });
}));

// Contact + the leads they submitted (matched by phone/email within the company).
router.get('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const rows = await query(`SELECT * FROM contacts WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  const contact = rows[0];
  if (!contact) return res.status(404).json({ error: 'איש קשר לא נמצא' });
  const co = await query('SELECT co.name, a.name AS agency_name FROM companies co LEFT JOIN agencies a ON a.id = co.agency_id WHERE co.id = ?', [contact.company_id]);
  contact.company_name = co[0]?.name || null;
  contact.agency_name = co[0]?.agency_name || null;

  const ph = digits9(contact.phone), ph2 = digits9(contact.phone2), em = contact.email || '';
  const leads = await query(
    `SELECT l.id, l.lead_name, l.lead_phone, l.lead_email, l.created_at, l.status_id,
            st.text AS status_text, sv.name AS service_name
     FROM leads l
     LEFT JOIN lead_statuses st ON st.id = l.status_id
     LEFT JOIN services sv ON sv.id = l.service_id
     WHERE l.company_id = ?
       AND ( (? <> '' AND RIGHT(REGEXP_REPLACE(l.lead_phone, '[^0-9]', ''), 9) = ?)
          OR (? <> '' AND RIGHT(REGEXP_REPLACE(l.lead_phone, '[^0-9]', ''), 9) = ?)
          OR (? <> '' AND l.lead_email = ?) )
     ORDER BY l.created_at DESC LIMIT 500`,
    [contact.company_id, ph, ph, ph2, ph2, em, em]);
  res.json({ contact, leads });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { company_id, first_name, last_name, phone, email } = req.body || {};
  if (!company_id || (!phone && !email)) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const r = await query('INSERT INTO contacts (company_id, first_name, last_name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [company_id, first_name || null, last_name || null, phone || null, email || null]);
  res.status(201).json({ contact: { id: r.insertId } });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM contacts WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'איש קשר לא נמצא' });
  const editable = ['first_name', 'last_name', 'phone', 'phone2', 'email', 'info', 'status', 'is_active'];
  const sets = [], params = [];
  for (const f of editable) if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
  if (sets.length) { params.push(req.params.id); await query(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`, params); }
  res.json({ ok: true });
}));

module.exports = router;
