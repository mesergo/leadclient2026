const express = require('express');
const crypto = require('crypto');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { upload, fileUrl } = require('../services/uploads');
const { logPhone } = require('../services/phoneLog');
const maskyoo = require('../services/maskyoo');
// push a number's routing to Maskyoo (only Maskyoo numbers; best-effort, non-blocking)
async function syncMaskyoo(phoneNumberId) {
  try {
    const [pn] = await query('SELECT phone_number, ivr_provider, company_id, service_id, redirect_config, redirect_to_number FROM phone_numbers WHERE id = ?', [phoneNumberId]);
    if (!pn || !pn.phone_number) return;
    const tags = ['app26'];
    if (pn.company_id) tags.push('company-' + pn.company_id);
    if (pn.service_id) tags.push('channel-' + pn.service_id);
    // Build the full routing (numbers + sequential/parallel + ring) from the saved config.
    let routing = null;
    if (pn.redirect_config) {
      const o = safeParse(pn.redirect_config);
      if (o && Array.isArray(o.numbers) && o.numbers.filter(Boolean).length) routing = o;
    }
    if (!routing && pn.redirect_to_number) routing = String(pn.redirect_to_number);

    // Per-channel Maskyoo settings (working hours / after-hours / recording / prompts / exposure)
    const extra = {};
    if (pn.service_id) {
      const [sv] = await query(
        `SELECT open_hours, close_hours_phone, close_hours_config, record_percentage, record_option,
                greeting_in, greeting_out, ringback_tone, maskyoo_expose FROM services WHERE id = ?`, [pn.service_id]);
      if (sv) {
        if (typeof sv.open_hours === 'string' && sv.open_hours.length === 168 && /0/.test(sv.open_hours)) extra.working_hours = sv.open_hours;
        let afterDest = sv.close_hours_phone || null;
        if (!afterDest && sv.close_hours_config) { const c = safeParse(sv.close_hours_config); const n = c && Array.isArray(c.numbers) ? c.numbers.filter(Boolean) : []; if (n.length) afterDest = n[0]; }
        if (afterDest) extra.out_of_time_destination_phone = afterDest;
        if (sv.record_percentage != null) extra.record_percentage = sv.record_percentage;
        if (sv.record_option != null) extra.record_option = sv.record_option;
        if (sv.maskyoo_expose != null) extra.expose = sv.maskyoo_expose;
        if (sv.greeting_in != null) extra.greeting_in = sv.greeting_in;
        if (sv.greeting_out != null) extra.greeting_out = sv.greeting_out;
        if (sv.ringback_tone != null) extra.ringback_tone = sv.ringback_tone;
      }
    }

    // syncRouting reads get_maskyoo first and no-ops if the number isn't in the Maskyoo
    // account — so a stale ivr_provider flag ('native' on imports) never blocks a real one.
    if (routing) {
      const r = await maskyoo.syncRouting(pn.phone_number, routing, extra);
      if (r && r.ok) {
        maskyoo.syncTags(pn.phone_number, tags).catch(() => {});
        if (pn.ivr_provider !== 'maskyoo') { // self-heal the flag once confirmed
          query("UPDATE phone_numbers SET ivr_provider = 'maskyoo' WHERE id = ?", [phoneNumberId]).catch(() => {});
        }
      }
    } else if (pn.ivr_provider === 'maskyoo') {
      maskyoo.syncTags(pn.phone_number, tags).catch(() => {});
    }
  } catch (e) { /* never block the save */ }
}

const router = express.Router();
const who = (u) => ({ userId: u.id, userName: u.name || u.display_name || u.username || '' });
router.use(requireAuth);

const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

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
  // available = this company's own unlinked numbers OR the global pool (unassigned)
  const numbers = await query(
    `SELECT id, phone_number, number_to_display FROM phone_numbers
     WHERE service_id IS NULL AND (company_id = ? OR company_id IS NULL) ORDER BY phone_number`, [companyId]);
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
    `SELECT id, phone_number, number_to_display, redirect_to_number, redirect_config, ivr_provider
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
  const closeCfg = b.close_hours_config == null ? null : (typeof b.close_hours_config === 'string' ? b.close_hours_config : JSON.stringify(b.close_hours_config));
  const r = await query(
    `INSERT INTO services
       (company_id, name, service_type, public_hash, description, site_url, line_type,
        phone_service_number, is_whatsapp_service, returning_sms_from, returning_sms_text,
        distribute_leads, service_ref, export_webhook_url, open_hours, close_hours_phone, close_hours_config, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
    [company_id, name, service_type || null, crypto.randomUUID(),
     b.description ?? null, service_type === 'website' ? (b.site_url ?? null) : null,
     service_type === 'phone' ? (b.line_type ?? null) : null,
     service_type === 'phone' ? (b.phone_service_number ?? null) : null,
     service_type === 'whatsapp' ? 1 : 0,
     b.returning_sms_from ?? null, b.returning_sms_text ?? null,
     distribute, b.service_ref ?? null, b.export_webhook_url ?? null, b.open_hours ?? '', b.close_hours_phone ?? null, closeCfg]);
  // Optionally claim one of the company's unassigned numbers for this channel.
  if (b.phone_number_id) {
    let cfg = null, primary = b.redirect_to_number ?? null;
    if (b.redirect_config != null) {
      const obj = typeof b.redirect_config === 'string' ? safeParse(b.redirect_config) : b.redirect_config;
      cfg = JSON.stringify(obj);
      const nums = Array.isArray(obj?.numbers) ? obj.numbers.filter(Boolean) : [];
      if (nums.length) primary = nums[0];
    }
    await query('UPDATE phone_numbers SET company_id = ?, service_id = ?, redirect_to_number = ?, redirect_config = ? WHERE id = ? AND service_id IS NULL AND (company_id = ? OR company_id IS NULL)',
      [company_id, r.insertId, primary, cfg, b.phone_number_id, company_id]);
    await query('UPDATE services SET phone_service_number = (SELECT phone_number FROM phone_numbers WHERE id = ?) WHERE id = ?', [b.phone_number_id, r.insertId]);
    await logPhone(b.phone_number_id, 'assigned', { ...who(req.user), toCompanyId: company_id, serviceId: r.insertId, note: 'שויך לערוץ' });
    syncMaskyoo(b.phone_number_id);
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
       close_hours_config = ${has('close_hours_config') ? '?' : 'close_hours_config'},
       record_percentage = ${has('record_percentage') ? '?' : 'record_percentage'},
       record_option = ${has('record_option') ? '?' : 'record_option'},
       greeting_in = ${has('greeting_in') ? '?' : 'greeting_in'},
       greeting_out = ${has('greeting_out') ? '?' : 'greeting_out'},
       ringback_tone = ${has('ringback_tone') ? '?' : 'ringback_tone'},
       maskyoo_expose = ${has('maskyoo_expose') ? '?' : 'maskyoo_expose'},
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
      ...(has('close_hours_config') ? [b.close_hours_config == null ? null : (typeof b.close_hours_config === 'string' ? b.close_hours_config : JSON.stringify(b.close_hours_config))] : []),
      ...(has('record_percentage') ? [b.record_percentage === '' || b.record_percentage == null ? null : Number(b.record_percentage)] : []),
      ...(has('record_option') ? [b.record_option === '' || b.record_option == null ? null : Number(b.record_option)] : []),
      ...(has('greeting_in') ? [b.greeting_in ?? null] : []),
      ...(has('greeting_out') ? [b.greeting_out ?? null] : []),
      ...(has('ringback_tone') ? [b.ringback_tone ?? null] : []),
      ...(has('maskyoo_expose') ? [b.maskyoo_expose === '' || b.maskyoo_expose == null ? null : Number(b.maskyoo_expose)] : []),
      has('is_active') ? (b.is_active ? 1 : 0) : null,
      req.params.id,
    ]);
  // Per-number redirect updates (only numbers linked to this service).
  if (Array.isArray(b.phones)) {
    for (const p of b.phones) {
      if (!p || p.id == null) continue;
      let cfg = null, primary = p.redirect_to_number ?? null;
      if (p.redirect_config != null) {
        const obj = typeof p.redirect_config === 'string' ? safeParse(p.redirect_config) : p.redirect_config;
        cfg = JSON.stringify(obj);
        const nums = Array.isArray(obj?.numbers) ? obj.numbers.filter(Boolean) : [];
        if (nums.length) primary = nums[0];
      }
      await query('UPDATE phone_numbers SET redirect_to_number = ?, redirect_config = ? WHERE id = ? AND service_id = ?',
        [primary, cfg, p.id, req.params.id]);
      syncMaskyoo(p.id);
    }
  }
  const rows = await query('SELECT id, company_id, name, service_type, public_hash, site_url, is_active FROM services WHERE id = ?', [req.params.id]);
  res.json({ service: rows[0] });
}));

// Attach an additional virtual number to an existing channel.
router.post('/:id/numbers', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const svc = await query(`SELECT id, company_id FROM services WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!svc[0]) return res.status(404).json({ error: 'ערוץ לא נמצא' });
  const b = req.body || {};
  if (!b.phone_number_id) return res.status(400).json({ error: 'לא נבחר מספר' });
  let cfg = null, primary = b.redirect_to_number ?? null;
  if (b.redirect_config != null) {
    const obj = typeof b.redirect_config === 'string' ? safeParse(b.redirect_config) : b.redirect_config;
    cfg = JSON.stringify(obj);
    const nums = Array.isArray(obj && obj.numbers) ? obj.numbers.filter(Boolean) : [];
    if (nums.length) primary = nums[0];
  }
  const r = await query(
    `UPDATE phone_numbers SET company_id = ?, service_id = ?, redirect_to_number = ?, redirect_config = ?
       WHERE id = ? AND service_id IS NULL AND (company_id = ? OR company_id IS NULL)`,
    [svc[0].company_id, req.params.id, primary, cfg, b.phone_number_id, svc[0].company_id]);
  if (!r.affectedRows) return res.status(409).json({ error: 'המספר כבר משויך לערוץ אחר' });
  await logPhone(b.phone_number_id, 'assigned', { ...who(req.user), toCompanyId: svc[0].company_id, serviceId: Number(req.params.id), note: 'שויך לערוץ' });
  syncMaskyoo(b.phone_number_id);
  const phones = await query(
    `SELECT id, phone_number, number_to_display, redirect_to_number, redirect_config, ivr_provider
       FROM phone_numbers WHERE service_id = ? ORDER BY id`, [req.params.id]);
  res.status(201).json({ phones });
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
