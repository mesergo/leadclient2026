const express = require('express');
const { query } = require('../db/pool');
const { asyncHandler } = require('../utils/http');
const notify = require('../services/notify');

const router = express.Router();

// notify a company's users about a newly-arrived lead (fire-and-forget)
function announceNewLead(companyId, leadId, name, phone) {
  notify.notifyCompany({ companyId, event: 'new_lead', title: 'ליד חדש', body: `${name || 'ללא שם'} · ${phone}`, leadId }).catch(() => {});
}

// public lead intake by service hash (embed widget). No auth.
router.post('/leads/service/:hash', asyncHandler(async (req, res) => {
  const svc = await query('SELECT id, company_id FROM services WHERE public_hash = ? LIMIT 1', [req.params.hash]);
  if (!svc[0]) return res.status(404).json({ error: 'no_channel_id' });
  const { name, phone, email } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'missing_phone' });
  const r = await query('INSERT INTO leads (company_id, service_id, lead_name, lead_phone, lead_email, lead_through, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [svc[0].company_id, svc[0].id, name || null, phone, email || null, 'widget']);
  announceNewLead(svc[0].company_id, r.insertId, name, phone);
  res.status(201).json({ ok: true });
}));

// intake by company token — picks company's earliest service
router.post('/leads/company/:token', asyncHandler(async (req, res) => {
  const co = await query('SELECT id FROM companies WHERE public_token = ? LIMIT 1', [req.params.token]);
  if (!co[0]) return res.status(404).json({ error: 'no_company' });
  const svc = await query('SELECT id FROM services WHERE company_id = ? ORDER BY created_at ASC LIMIT 1', [co[0].id]);
  if (!svc[0]) return res.status(404).json({ error: 'no_channel_id' });
  const { name, phone, email } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'missing_phone' });
  const r = await query('INSERT INTO leads (company_id, service_id, lead_name, lead_phone, lead_email, lead_through, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [co[0].id, svc[0].id, name || null, phone, email || null, 'widget']);
  announceNewLead(co[0].id, r.insertId, name, phone);
  res.status(201).json({ ok: true });
}));

// Active languages for the UI language picker (no auth — needed before/around login).
router.get('/languages', asyncHandler(async (req, res) => {
  const rows = await query('SELECT slug, language, language_english, is_rtl FROM languages WHERE is_active = 1 ORDER BY language');
  res.json({ languages: rows });
}));

// Translation overrides map for a language (only non-empty values).
router.get('/translations/:slug', asyncHandler(async (req, res) => {
  const rows = await query(
    "SELECT string_key, string_value FROM translation_strings WHERE lang_slug = ? AND string_value IS NOT NULL AND string_value <> ''",
    [req.params.slug]);
  const map = {};
  for (const r of rows) map[r.string_key] = r.string_value;
  res.json({ strings: map });
}));

// --- IVR / Maskyoo call webhooks (configure these URLs on the provider's number) ---
// Accept GET or POST; caller/duration/recording come from body or query.
const pick = (req, ...keys) => { const b = req.body || {}; for (const k of keys) { if (b[k] != null && b[k] !== '') return b[k]; if (req.query[k] != null && req.query[k] !== '') return req.query[k]; } return null; };

// Core: given the matched phone_number, process a call event.
// Start (no duration) logs an incoming-call lead; end (duration/recording, or a
// hangup-like status) attaches the details to that caller's recent lead.
async function processCall(num, req, res) {
  if (!num) return res.status(404).json({ error: 'number_not_found' });
  if (!num.company_id) return res.json({ ok: true, redirect_to: num.redirect_to_number || null });

  const caller = pick(req, 'caller', 'from', 'phone', 'ani', 'source');
  const duration = pick(req, 'duration', 'seconds');
  const recording = pick(req, 'recording', 'recording_url');
  const status = String(pick(req, 'status', 'event', 'type') || '').toLowerCase();
  const isEnd = duration != null || /end|hangup|finish|complete|done/.test(status);

  if (isEnd) {
    const recent = await query(
      `SELECT id FROM leads WHERE company_id = ? AND lead_through = 'call' AND (lead_phone <=> ?)
         AND created_at >= (NOW() - INTERVAL 30 MINUTE) ORDER BY id DESC LIMIT 1`,
      [num.company_id, caller]);
    if (recent[0]) {
      await query(
        `UPDATE leads SET lead_info = CONCAT(COALESCE(lead_info, ''), ?),
           recording_url = COALESCE(?, recording_url), updated_at = NOW() WHERE id = ?`,
        [duration ? `\n[שיחה] משך: ${duration}` : '', recording || null, recent[0].id]);
      return res.json({ ok: true, lead_id: recent[0].id, redirect_to: num.redirect_to_number || null });
    }
  }
  const r = await query(
    `INSERT INTO leads (company_id, service_id, lead_phone, lead_info, lead_through, recording_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'call', ?, NOW(), NOW())`,
    [num.company_id, num.service_id || null, caller, duration ? `[שיחה] משך: ${duration}` : null, recording || null]);
  announceNewLead(num.company_id, r.insertId, 'שיחה נכנסת', caller || 'לא מזוהה');
  res.json({ ok: true, lead_id: r.insertId, redirect_to: num.redirect_to_number || null });
}

// One fixed URL for ALL numbers: Maskyoo sends the dialed number (DID); we match
// it to our phone_number (by its last digits, format-agnostic).
router.all('/call', asyncHandler(async (req, res) => {
  const did = pick(req, 'did', 'number', 'to', 'called', 'virtual', 'dnis', 'dest', 'target');
  const key = String(did || '').replace(/\D/g, '').slice(-9);
  if (!key) return res.status(400).json({ error: 'missing_dialed_number' });
  const rows = await query(
    `SELECT id, company_id, service_id, redirect_to_number FROM phone_numbers
     WHERE REGEXP_REPLACE(phone_number, '[^0-9]', '') LIKE CONCAT('%', ?) ORDER BY id DESC LIMIT 1`, [key]);
  return processCall(rows[0], req, res);
}));

// Also addressable per-number by id (optional).
router.all('/call/:id', asyncHandler(async (req, res) => {
  const rows = await query('SELECT id, company_id, service_id, redirect_to_number FROM phone_numbers WHERE id = ? LIMIT 1', [req.params.id]);
  return processCall(rows[0], req, res);
}));

module.exports = router;
