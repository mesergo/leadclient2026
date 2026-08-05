const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { upload, fileUrl } = require('../services/uploads');

const router = express.Router();
router.use(requireAuth);

const FIELDS = `c.id, c.agency_id, c.name, c.logo_url, c.phone, c.fax, c.address, c.zip_code, c.industry,
  c.public_token, c.contacts_access, c.is_donation_center, c.payment_package, c.is_active, c.created_at`;

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'c.id');
  const rows = await query(
    `SELECT ${FIELDS}, a.name AS agency_name, COUNT(DISTINCT sv.id) AS services_count
     FROM companies c
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.company_id = c.id
     WHERE (${s.sql})
     GROUP BY c.id ORDER BY c.created_at DESC`,
    s.params
  );
  res.json({ companies: rows });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'c.id');
  const rows = await query(
    `SELECT ${FIELDS}, a.name AS agency_name FROM companies c
     LEFT JOIN agencies a ON a.id = c.agency_id
     WHERE c.id = ? AND (${s.sql})`,
    [req.params.id, ...s.params]
  );
  if (!rows[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  res.json({ company: rows[0] });
}));

router.post('/', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const { name, agency_id } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'חסר שם חברה' });
  if (req.user.role === 'agency_admin' && String(agency_id) !== String(req.user.agency_id)) {
    return res.status(403).json({ error: 'ניתן ליצור חברה רק תחת הסוכנות שלך' });
  }
  const token = require('crypto').randomUUID();
  const r = await query('INSERT INTO companies (name, agency_id, public_token, created_at) VALUES (?, ?, ?, NOW())',
    [name.trim(), agency_id || null, token]);
  await query(
    `INSERT INTO lead_statuses (company_id, text, color, sort_order, is_waiting, is_finished) VALUES
     (?, 'חדש', '#4f46e5', 1, 1, 0), (?, 'טופל', '#16a34a', 2, 0, 1), (?, 'בוטל', '#dc2626', 3, 0, 1)`,
    [r.insertId, r.insertId, r.insertId]);
  const rows = await query(`SELECT ${FIELDS} FROM companies c WHERE c.id = ?`, [r.insertId]);
  res.status(201).json({ company: rows[0] });
}));

const EDITABLE = ['name', 'phone', 'fax', 'address', 'zip_code', 'industry', 'is_active',
  'contacts_access', 'is_donation_center', 'payment_package'];

router.patch('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'id');
  const owned = await query(`SELECT id FROM companies WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const sets = [], params = [];
  for (const f of EDITABLE) if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
  if (sets.length) { params.push(req.params.id); await query(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, params); }
  const rows = await query(`SELECT ${FIELDS} FROM companies c WHERE c.id = ?`, [req.params.id]);
  res.json({ company: rows[0] });
}));

router.post('/:id/logo', requireRole('super_admin', 'agency_admin', 'company_admin'), upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'חסר קובץ' });
  const s = companyScope(req.user, 'id');
  const owned = await query(`SELECT id FROM companies WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const url = fileUrl(req.file.filename);
  await query('UPDATE companies SET logo_url = ? WHERE id = ?', [url, req.params.id]);
  res.json({ company: { id: Number(req.params.id), logo_url: url } });
}));

router.post('/:id/impersonate', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'id');
  const owned = await query(`SELECT id FROM companies WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const admins = await query(
    `SELECT id, role, company_id, agency_id, display_name, username FROM users
     WHERE company_id = ? AND role = 'company_admin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1`,
    [req.params.id]);
  if (!admins[0]) return res.status(404).json({ error: 'אין מנהל פעיל בחברה זו' });
  const t = admins[0];
  const token = jwt.sign(
    { sub: t.id, role: t.role, company_id: t.company_id, agency_id: t.agency_id, name: t.display_name || t.username, impersonated_by: req.user.id },
    config.jwt.secret, { expiresIn: '1h' });
  res.json({ token, user: { id: t.id, name: t.display_name || t.username, role: t.role } });
}));

module.exports = router;
