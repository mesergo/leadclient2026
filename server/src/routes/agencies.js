const express = require('express');
const { query, agencyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { upload, fileUrl } = require('../services/uploads');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const s = agencyScope(req.user, 'a.id');
  const { q } = req.query;
  const params = [...s.params];
  let nameFilter = '';
  if (q) { nameFilter = ' AND a.name LIKE ?'; params.push('%' + q + '%'); }
  const rows = await query(
    `SELECT a.id, a.name, a.logo_url, a.ivr_provider, a.phone_limit, a.whatsapp_id, a.is_active, a.created_at,
            COUNT(DISTINCT c.id) AS companies_count
     FROM agencies a
     LEFT JOIN companies c ON c.agency_id = a.id
     WHERE (${s.sql})${nameFilter}
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    params
  );
  res.json({ agencies: rows });
}));

router.post('/', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'חסר שם סוכנות' });
  const r = await query('INSERT INTO agencies (name, created_at) VALUES (?, NOW())', [name.trim()]);
  const rows = await query('SELECT id, name, logo_url, ivr_provider, phone_limit, is_active, created_at FROM agencies WHERE id = ?', [r.insertId]);
  res.status(201).json({ agency: rows[0] });
}));

router.patch('/:id', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { name, is_active, phone_limit, ivr_provider, whatsapp_id } = req.body || {};
  await query(
    `UPDATE agencies SET
       name = COALESCE(?, name), is_active = COALESCE(?, is_active),
       phone_limit = COALESCE(?, phone_limit), ivr_provider = COALESCE(?, ivr_provider),
       whatsapp_id = COALESCE(?, whatsapp_id)
     WHERE id = ?`,
    [name ?? null, is_active ?? null, phone_limit ?? null, ivr_provider ?? null, whatsapp_id ?? null, req.params.id]
  );
  const rows = await query('SELECT id, name, logo_url, ivr_provider, phone_limit, whatsapp_id, is_active, created_at FROM agencies WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'סוכנות לא נמצאה' });
  res.json({ agency: rows[0] });
}));

router.post('/:id/logo', requireRole('super_admin'), upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'חסר קובץ' });
  const url = fileUrl(req.file.filename);
  await query('UPDATE agencies SET logo_url = ? WHERE id = ?', [url, req.params.id]);
  res.json({ agency: { id: Number(req.params.id), logo_url: url } });
}));

module.exports = router;
