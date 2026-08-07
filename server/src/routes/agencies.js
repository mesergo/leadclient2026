const express = require('express');
const { query, agencyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { upload, fileUrl } = require('../services/uploads');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const scope = agencyScope(req.user, 'a.id');
  const { q, status } = req.query;
  const params = [...scope.params];
  let where = scope.sql;
  if (q) { where += ' AND a.name LIKE ?'; params.push('%' + q + '%'); }
  if (status === 'active') where += ' AND a.is_active = 1';
  if (status === 'suspended') where += ' AND a.is_active = 0';

  // base + small counts via correlated subqueries (companies/users/services/phones are small)
  const rows = await query(
    `SELECT a.id, a.name, a.logo_url, a.ivr_provider, a.phone_limit, a.whatsapp_id, a.is_active, a.created_at,
            (SELECT COUNT(*) FROM companies c WHERE c.agency_id = a.id) companies_count,
            (SELECT COUNT(*) FROM users u JOIN companies c ON c.id = u.company_id WHERE c.agency_id = a.id) users_count,
            (SELECT COUNT(*) FROM services s JOIN companies c ON c.id = s.company_id WHERE c.agency_id = a.id) services_count,
            (SELECT COUNT(*) FROM phone_numbers p JOIN companies c ON c.id = p.company_id WHERE c.agency_id = a.id) phones_count
     FROM agencies a WHERE ${where} ORDER BY a.name ASC`,
    params
  );
  // leads per agency (single grouped scan, all-time)
  const leadRows = await query(
    `SELECT c.agency_id aid, COUNT(*) n FROM leads l JOIN companies c ON c.id = l.company_id GROUP BY c.agency_id`
  );
  const lm = {};
  for (const r of leadRows) lm[r.aid] = Number(r.n);
  res.json({ agencies: rows.map((a) => ({ ...a, leads_count: lm[a.id] || 0 })) });
}));;

router.post('/', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'חסר שם סוכנות' });
  const r = await query('INSERT INTO agencies (name, created_at) VALUES (?, NOW())', [name.trim()]);
  const rows = await query('SELECT id, name, logo_url, ivr_provider, phone_limit, is_active, created_at FROM agencies WHERE id = ?', [r.insertId]);
  res.status(201).json({ agency: rows[0] });
}));

router.get('/:id', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const scope = agencyScope(req.user, 'id');
  const rows = await query(
    `SELECT id, name, logo_url, ivr_provider, phone_limit, whatsapp_id, icount_cid, icount_user,
            icount_pass, allow_add_user_external, control_templates, is_active, created_at
     FROM agencies WHERE id = ? AND (${scope.sql})`, [req.params.id, ...scope.params]);
  if (!rows[0]) return res.status(404).json({ error: 'סוכנות לא נמצאה' });
  const [ph] = await query('SELECT COUNT(*) n FROM phone_numbers p JOIN companies c ON c.id = p.company_id WHERE c.agency_id = ?', [req.params.id]);
  res.json({ agency: { ...rows[0], phones_in_use: ph.n } });
}));

router.patch('/:id', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { name, is_active, phone_limit, ivr_provider, whatsapp_id, icount_cid, icount_user, icount_pass, allow_add_user_external, control_templates } = req.body || {};
  await query(
    `UPDATE agencies SET
       name = COALESCE(?, name), is_active = COALESCE(?, is_active),
       phone_limit = COALESCE(?, phone_limit), ivr_provider = COALESCE(?, ivr_provider),
       whatsapp_id = COALESCE(?, whatsapp_id), icount_cid = COALESCE(?, icount_cid),
       icount_user = COALESCE(?, icount_user), icount_pass = COALESCE(?, icount_pass),
       allow_add_user_external = COALESCE(?, allow_add_user_external), control_templates = COALESCE(?, control_templates)
     WHERE id = ?`,
    [name ?? null, is_active ?? null, phone_limit ?? null, ivr_provider ?? null, whatsapp_id ?? null,
     icount_cid ?? null, icount_user ?? null, icount_pass ?? null, allow_add_user_external ?? null, control_templates ?? null, req.params.id]
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
