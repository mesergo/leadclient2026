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
  await logInbound(req, 'widget', { companyId: svc[0].company_id, leadId: r.insertId, result: 'lead_created' });
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
  await logInbound(req, 'company-token', { companyId: co[0].id, leadId: r.insertId, result: 'lead_created' });
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

// --- inbound webhook log (raw data of every attempt, for debugging) ---
let wlReady = false;
async function ensureWebhookLog() {
  if (wlReady) return;
  await query(`CREATE TABLE IF NOT EXISTS webhook_log (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    source VARCHAR(30) NULL, method VARCHAR(10) NULL, path VARCHAR(255) NULL, ip VARCHAR(45) NULL,
    query_data TEXT NULL, body_data TEXT NULL,
    matched_number_id BIGINT UNSIGNED NULL, company_id BIGINT UNSIGNED NULL, lead_id BIGINT UNSIGNED NULL,
    result VARCHAR(30) NULL, error VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_wl_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  wlReady = true;
}
async function logInbound(req, source, x = {}) {
  try {
    await ensureWebhookLog();
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
    const r = await query(
      `INSERT INTO webhook_log (source, method, path, ip, query_data, body_data, matched_number_id, company_id, lead_id, result, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [source, req.method, String(req.originalUrl || '').slice(0, 255), ip,
        JSON.stringify(req.query || {}).slice(0, 8000), JSON.stringify(req.body || {}).slice(0, 8000),
        x.numberId || null, x.companyId || null, x.leadId || null, x.result || null, (x.error || '').slice(0, 255) || null]);
    return r.insertId;
  } catch (e) { return null; /* logging must never break the webhook */ }
}
// update the outcome of an already-logged request (keeps one row per request)
async function updateLog(id, x = {}) {
  if (!id) return;
  try {
    await query(
      `UPDATE webhook_log SET result = COALESCE(?, result), lead_id = COALESCE(?, lead_id),
         matched_number_id = COALESCE(?, matched_number_id), company_id = COALESCE(?, company_id), error = COALESCE(?, error) WHERE id = ?`,
      [x.result || null, x.leadId || null, x.numberId || null, x.companyId || null, (x.error || '').slice(0, 255) || null, id]);
  } catch (e) { /* never break the webhook */ }
}

// Normalize an Israeli number to MSISDN (972XXXXXXXXX) — the format Maskyoo routes to.
function toIsraeliMsisdn(n) {
  const d = String(n || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return '972' + d.slice(1);
  return '972' + d;
}

// Core: given the matched phone_number, process a call event.
// Start (no duration) logs an incoming-call lead; end (duration/recording, or a
// hangup-like status) attaches the details to that caller's recent lead.
async function processCall(num, req, res, logId) {
  // Maskyoo params: CLI = caller, CALLSTATUS = STARTED/ENDED, DURATION, plus generic aliases.
  const caller = pick(req, 'CLI', 'cli', 'caller', 'from', 'phone', 'ani');
  const duration = pick(req, 'DURATION', 'duration', 'seconds', 'billsec');
  const recording = pick(req, 'RECORDING', 'recording', 'recording_url');
  const status = String(pick(req, 'CALLSTATUS', 'callstatus', 'status', 'event', 'type') || '').toLowerCase();
  const isEnd = duration != null || /end|hangup|finish|complete|done/.test(status);

  // Maskyoo reads the destination to route the call to from the START of the response
  // body (destination number), followed by JSON (as the legacy system returned).
  const dest = num ? toIsraeliMsisdn(num.redirect_to_number) : '';
  const reply = (ok, desc) => res.type('text/plain').send(dest + JSON.stringify({ success: ok, success_description: desc }));

  if (!num) { await updateLog(logId, { result: 'no_match' }); return reply(false, 'no match'); }
  if (!num.company_id) { await updateLog(logId, { numberId: num.id, result: 'number_unassigned' }); return reply(true, 'number unassigned'); }

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
      await updateLog(logId, { numberId: num.id, companyId: num.company_id, leadId: recent[0].id, result: 'lead_updated' });
      return reply(true, 'lead updated');
    }
  }
  const r = await query(
    `INSERT INTO leads (company_id, service_id, lead_phone, lead_info, lead_through, recording_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'call', ?, NOW(), NOW())`,
    [num.company_id, num.service_id || null, caller, duration ? `[שיחה] משך: ${duration}` : null, recording || null]);
  await updateLog(logId, { numberId: num.id, companyId: num.company_id, leadId: r.insertId, result: 'lead_created' });
  announceNewLead(num.company_id, r.insertId, 'שיחה נכנסת', caller || 'לא מזוהה');
  reply(true, 'lead saved');
}

// One fixed URL for ALL numbers: Maskyoo sends the dialed number (DID); we match
// it to our phone_number (by its last digits, format-agnostic).
router.all('/call', asyncHandler(async (req, res) => {
  const logId = await logInbound(req, 'maskyoo-call', { result: 'received' }); // log raw first, always
  const did = pick(req, 'DDI', 'ddi', 'did', 'number', 'to', 'called', 'virtual', 'dnis'); // Maskyoo: DDI = dialed number
  const key = String(did || '').replace(/\D/g, '').slice(-9);
  if (!key) { await updateLog(logId, { result: 'missing_dialed_number' }); return res.status(400).json({ error: 'missing_dialed_number' }); }
  const rows = await query(
    `SELECT id, company_id, service_id, redirect_to_number FROM phone_numbers
     WHERE REGEXP_REPLACE(phone_number, '[^0-9]', '') LIKE CONCAT('%', ?) ORDER BY id DESC LIMIT 1`, [key]);
  return processCall(rows[0], req, res, logId);
}));

// Also addressable per-number by id (optional).
router.all('/call/:id', asyncHandler(async (req, res) => {
  const logId = await logInbound(req, 'maskyoo-call', { result: 'received' });
  const rows = await query('SELECT id, company_id, service_id, redirect_to_number FROM phone_numbers WHERE id = ? LIMIT 1', [req.params.id]);
  return processCall(rows[0], req, res, logId);
}));

module.exports = router;
