const express = require('express');
const crypto = require('crypto');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'sv.company_id');
  const params = [...s.params];
  let extra = '';
  if (req.query.company_id) { extra = ' AND sv.company_id = ?'; params.push(req.query.company_id); }
  const rows = await query(
    `SELECT sv.id, sv.company_id, sv.name, sv.service_type, sv.public_hash, sv.phone_service_number,
            sv.site_url, sv.is_import_service, sv.is_whatsapp_service, sv.is_active, sv.created_at, c.name AS company_name
     FROM services sv LEFT JOIN companies c ON c.id = sv.company_id
     WHERE (${s.sql})${extra} ORDER BY sv.created_at DESC`,
    params
  );
  res.json({ services: rows });
}));

router.post('/', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const { company_id, name, service_type } = req.body || {};
  if (!company_id || !name) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const r = await query(
    'INSERT INTO services (company_id, name, service_type, public_hash, created_at) VALUES (?, ?, ?, ?, NOW())',
    [company_id, name, service_type || null, crypto.randomUUID()]);
  const rows = await query('SELECT id, company_id, name, service_type, public_hash, created_at FROM services WHERE id = ?', [r.insertId]);
  res.status(201).json({ service: rows[0] });
}));

router.patch('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM services WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'ערוץ לא נמצא' });
  const { name, service_type, site_url, is_active } = req.body || {};
  await query('UPDATE services SET name = COALESCE(?, name), service_type = COALESCE(?, service_type), site_url = COALESCE(?, site_url), is_active = COALESCE(?, is_active) WHERE id = ?',
    [name ?? null, service_type ?? null, site_url ?? null, is_active ?? null, req.params.id]);
  const rows = await query('SELECT id, company_id, name, service_type, public_hash, site_url FROM services WHERE id = ?', [req.params.id]);
  res.json({ service: rows[0] });
}));

router.delete('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const sc = companyScope(req.user, 'company_id');
  const r = await query(`DELETE FROM services WHERE id = ? AND (${sc.sql})`, [req.params.id, ...sc.params]);
  if (!r.affectedRows) return res.status(404).json({ error: 'ערוץ לא נמצא' });
  res.json({ ok: true });
}));

module.exports = router;
