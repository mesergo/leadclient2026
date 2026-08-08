const express = require('express');
const crypto = require('crypto');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { upload, fileUrl } = require('../services/uploads');

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

// Context for the new-channel form: company users + that company's unassigned numbers.
router.get('/new-context', asyncHandler(async (req, res) => {
  const companyId = req.query.company_id;
  if (!companyId) return res.status(400).json({ error: 'חסר מזהה חברה' });
  if (canAccessCompany(req.user, companyId) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const users = await query(
    `SELECT id, COALESCE(NULLIF(display_name,''), NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)),''), username) AS name
     FROM users WHERE company_id = ? AND is_active = 1 ORDER BY name`, [companyId]);
  const numbers = await query(
    `SELECT id, phone_number, number_to_display FROM phone_numbers
     WHERE service_id IS NULL AND company_id = ? ORDER BY phone_number`, [companyId]);
  const company = await query('SELECT c.id, c.name, c.agency_id, a.name AS agency_name FROM companies c LEFT JOIN agencies a ON a.id = c.agency_id WHERE c.id = ?', [companyId]);
  res.json({ company: company[0] || null, users, numbers });
}));

// Full detail for the channel-edit page: service row + linked virtual numbers + company users.
router.get('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'sv.company_id');
  const rows = await query(
    `SELECT sv.*, c.name AS company_name, c.agency_id, a.name AS agency_name
     FROM services sv
     LEFT JOIN companies c ON c.id = sv.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     WHERE sv.id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  const service = rows[0];
  if (!service) return res.status(404).json({ error: 'ערוץ לא נמצא' });
  let assigned = [];
  try { assigned = JSON.parse(service.distribute_leads || '[]'); } catch { assigned = []; }
  service.distribute_leads = Array.isArray(assigned) ? assigned.map(String) : [];
  const phones = await query(
    `SELECT id, phone_number, number_to_display, redirect_to_number, ivr_provider
     FROM phone_numbers WHERE service_id = ? ORDER BY id`, [req.params.id]);
  const users = await query(
    `SELECT id, COALESCE(NULLIF(display_name,''), NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)),''), username) AS name
     FROM users WHERE company_id = ? AND is_active = 1 ORDER BY name`, [service.company_id]);
  res.json({ service, phones, users });
}));

router.post('/', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const { company_id, name, service_type } = b;
  if (!company_id || !name) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const distribute = JSON.stringify((Array.isArray(b.distribute_leads) ? b.distribute_leads : []).map(String));
  const r = await query(
    `INSERT INTO services
       (company_id, name, service_type, public_hash, description, site_url, line_type,
        phone_service_number, is_whatsapp_service, returning_sms_from, returning_sms_text,
        distribute_leads, service_ref, export_webhook_url, open_hours, close_hours_phone, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
    [company_id, name, service_type || null, crypto.randomUUID(),
     b.description ?? null, service_type === 'website' ? (b.site_url ?? null) : null,
     service_type === 'phone' ? (b.line_type ?? null) : null,
     service_type === 'phone' ? (b.phone_service_number ?? null) : null,
     service_type === 'whatsapp' ? 1 : 0,
     b.returning_sms_from ?? null, b.returning_sms_text ?? null,
     distribute, b.service_ref ?? null, b.export_webhook_url ?? null, b.open_hours ?? '', b.close_hours_phone ?? null]);
  // Optionally claim one of the company's unassigned numbers for this channel.
  if (b.phone_number_id) {
    await query('UPDATE phone_numbers SET service_id = ?, redirect_to_number = COALESCE(?, redirect_to_number) WHERE id = ? AND company_id = ? AND service_id IS NULL',
      [r.insertId, b.redirect_to_number ?? null, b.phone_number_id, company_id]);
    await query('UPDATE services SET phone_service_number = (SELECT phone_number FROM phone_numbers WHERE id = ?) WHERE id = ?', [b.phone_number_id, r.insertId]);
  }
  const rows = await query('SELECT id, company_id, name, service_type, public_hash, created_at FROM services WHERE id = ?', [r.insertId]);
  res.status(201).json({ service: rows[0] });
}));

router.patch('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM services WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'ערוץ לא נמצא' });
  const b = req.body || {};
  // Only overwrite a column when the key was sent (COALESCE keeps the current value for undefined→null).
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const distribute = has('distribute_leads')
    ? JSON.stringify((Array.isArray(b.distribute_leads) ? b.distribute_leads : []).map(String))
    : null;
  await query(
    `UPDATE services SET
       name = COALESCE(?, name),
       description = ${has('description') ? '?' : 'description'},
       service_type = COALESCE(?, service_type),
       site_url = ${has('site_url') ? '?' : 'site_url'},
       phone_service_number = ${has('phone_service_number') ? '?' : 'phone_service_number'},
       line_type = ${has('line_type') ? '?' : 'line_type'},
       is_whatsapp_service = COALESCE(?, is_whatsapp_service),
       is_import_service = COALESCE(?, is_import_service),
       returning_sms_from = ${has('returning_sms_from') ? '?' : 'returning_sms_from'},
       returning_sms_text = ${has('returning_sms_text') ? '?' : 'returning_sms_text'},
       distribute_leads = COALESCE(?, distribute_leads),
       service_ref = ${has('service_ref') ? '?' : 'service_ref'},
       export_webhook_url = ${has('export_webhook_url') ? '?' : 'export_webhook_url'},
       open_hours = ${has('open_hours') ? '?' : 'open_hours'},
       close_hours_phone = ${has('close_hours_phone') ? '?' : 'close_hours_phone'},
       close_hours_audio_url = ${has('close_hours_audio_url') ? '?' : 'close_hours_audio_url'},
       is_active = COALESCE(?, is_active)
     WHERE id = ?`,
    [
      b.name ?? null,
      ...(has('description') ? [b.description ?? null] : []),
      b.service_type ?? null,
      ...(has('site_url') ? [b.site_url ?? null] : []),
      ...(has('phone_service_number') ? [b.phone_service_number ?? null] : []),
      ...(has('line_type') ? [b.line_type ?? null] : []),
      has('is_whatsapp_service') ? (b.is_whatsapp_service ? 1 : 0) : null,
      has('is_import_service') ? (b.is_import_service ? 1 : 0) : null,
      ...(has('returning_sms_from') ? [b.returning_sms_from ?? null] : []),
      ...(has('returning_sms_text') ? [b.returning_sms_text ?? null] : []),
      distribute,
      ...(has('service_ref') ? [b.service_ref ?? null] : []),
      ...(has('export_webhook_url') ? [b.export_webhook_url ?? null] : []),
      ...(has('open_hours') ? [b.open_hours ?? null] : []),
      ...(has('close_hours_phone') ? [b.close_hours_phone ?? null] : []),
      ...(has('close_hours_audio_url') ? [b.close_hours_audio_url ?? null] : []),
      has('is_active') ? (b.is_active ? 1 : 0) : null,
      req.params.id,
    ]);
  // Per-number redirect updates (only numbers linked to this service).
  if (Array.isArray(b.phones)) {
    for (const p of b.phones) {
      if (!p || p.id == null) continue;
      await query('UPDATE phone_numbers SET redirect_to_number = ? WHERE id = ? AND service_id = ?',
        [p.redirect_to_number ?? null, p.id, req.params.id]);
    }
  }
  const rows = await query('SELECT id, company_id, name, service_type, public_hash, site_url, is_active FROM services WHERE id = ?', [req.params.id]);
  res.json({ service: rows[0] });
}));

// Upload an after-hours audio clip for the channel.
router.post('/:id/close-audio', requireRole('super_admin', 'agency_admin', 'company_admin'),
  upload.single('audio'), asyncHandler(async (req, res) => {
    const s = companyScope(req.user, 'company_id');
    const owned = await query(`SELECT id FROM services WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
    if (!owned[0]) return res.status(404).json({ error: 'ערוץ לא נמצא' });
    if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
    const url = fileUrl(req.file.filename);
    await query('UPDATE services SET close_hours_audio_url = ? WHERE id = ?', [url, req.params.id]);
    res.json({ close_hours_audio_url: url });
  }));

router.delete('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const sc = companyScope(req.user, 'company_id');
  const r = await query(`DELETE FROM services WHERE id = ? AND (${sc.sql})`, [req.params.id, ...sc.params]);
  if (!r.affectedRows) return res.status(404).json({ error: 'ערוץ לא נמצא' });
  res.json({ ok: true });
}));

module.exports = router;
