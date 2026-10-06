const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { asyncHandler } = require('../utils/http');
const notify = require('../services/notify');
const recording = require('../services/recording');
const messergo = require('../services/messergo');
const config = require('../config');
const { issueToken } = require('../services/authService');

const router = express.Router();

// --- Employee invitation acceptance (public) --------------------------------
const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e || '');

async function loadInvite(token) {
  const rows = await query(
    `SELECT i.id, i.company_id, i.email, i.phone, i.role, i.status, i.expires_at, c.name AS company_name
       FROM employee_invites i JOIN companies c ON c.id = i.company_id WHERE i.token = ? LIMIT 1`, [token]);
  const inv = rows[0];
  if (!inv || inv.status !== 'pending' || (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now())) return null;
  return inv;
}

// What the employee sees: company name + the locked email/phone the manager set.
router.get('/invite/:token', asyncHandler(async (req, res) => {
  const inv = await loadInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'קישור הזמנה לא תקין או שפג תוקפו' });
  res.json({ company: { name: inv.company_name }, email: inv.email, phone: inv.phone });
}));

router.post('/invite/:token/accept', asyncHandler(async (req, res) => {
  const inv = await loadInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'קישור הזמנה לא תקין או שפג תוקפו' });
  const { full_name, password } = req.body || {};
  // email/phone are locked to the invite; the employee may supply the one not provided
  const email = inv.email || (req.body.email || null);
  const phone = inv.phone || (req.body.phone ? messergo.toE164(req.body.phone) : null);
  if (!full_name || !String(full_name).trim()) return res.status(400).json({ error: 'חסר שם מלא' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'הסיסמה חייבת לפחות 6 תווים' });
  if (!email && !phone) return res.status(400).json({ error: 'יש להזין אימייל או נייד' });
  if (email && !emailOk(email)) return res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
  if (phone && !/^972\d{8,9}$/.test(messergo.digits(phone))) return res.status(400).json({ error: 'מספר נייד לא תקין' });

  // duplicate guard (single-company model): block if this email/phone is already a user
  const cond = [], params = [];
  if (email) { cond.push('email = ?'); params.push(email); }
  if (phone) { cond.push("REGEXP_REPLACE(phone,'[^0-9]','') LIKE CONCAT('%', ?)"); params.push(messergo.digits(phone).slice(-9)); }
  const existing = cond.length ? await query(`SELECT id, company_id FROM users WHERE is_active = 1 AND (${cond.join(' OR ')}) LIMIT 1`, params) : [];
  if (existing[0]) {
    return res.status(409).json({ error: String(existing[0].company_id) === String(inv.company_id)
      ? 'המשתמש כבר קיים בחברה' : 'האימייל/נייד כבר רשום במערכת. פנה לתמיכה.' });
  }
  const username = email || phone;
  const uexist = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (uexist[0]) return res.status(409).json({ error: 'משתמש כבר קיים' });

  const hash = await bcrypt.hash(password, 10);
  const u = await query(
    `INSERT INTO users (company_id, role, username, email, display_name, phone, password_hash, language, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'he', 1, NOW())`,
    [inv.company_id, inv.role || 'company_user', username, email, String(full_name).trim(), phone, hash]);
  await query("UPDATE employee_invites SET status = 'accepted', accepted_user_id = ? WHERE id = ?", [u.insertId, inv.id]);

  const user = { id: u.insertId, role: inv.role || 'company_user', company_id: inv.company_id, agency_id: null };
  res.status(201).json({
    token: issueToken(user),
    user: { id: u.insertId, name: String(full_name).trim(), role: user.role, company_id: inv.company_id, agency_id: null, phone: phone || null, phone_verified_at: null, phone_verify_required: config.requirePhoneVerify },
  });
}));

// Push end-of-call details to the channel's own webhook (export_webhook_url), with
// a signed recording link served by us (Maskyoo is never exposed). Fire-and-forget.
async function fireChannelWebhook(serviceId, lead) {
  if (!serviceId) return;
  try {
    const rows = await query('SELECT export_webhook_url FROM services WHERE id = ?', [serviceId]);
    const url = rows[0] && rows[0].export_webhook_url;
    if (!url || !/^https?:\/\//i.test(url)) return;
    const payload = {
      event: 'call_ended',
      lead_id: lead.id,
      company_id: lead.company_id,
      service_id: serviceId,
      caller: lead.caller || null,
      duration: lead.duration || null,
      status: lead.status || null,            // 'answered' | 'missed'
      recording_url: recording.publicUrl(lead.id),
      at: new Date().toISOString(),
    };
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  } catch (e) { /* never block the call webhook */ }
}

// Public, signed recording download for channel webhooks (no login; no Maskyoo).
//   GET /api/public/recording/:id?sig=...
router.get('/recording/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!recording.verifySig(id, req.query.sig)) return res.status(403).json({ error: 'bad_signature' });
  const rows = await query('SELECT id, recording_url FROM leads WHERE id = ? LIMIT 1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  return recording.serve(res, rows[0]);
}));

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
  const rows = await query('SELECT slug, language, language_english, is_rtl FROM languages WHERE is_active = 1 AND in_menu = 1 ORDER BY language');
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
  const duration = pick(req, 'CALLDURATION', 'DURATION', 'duration', 'seconds', 'billsec');
  const recording = pick(req, 'download', 'RECORDING', 'recording', 'recording_url');
  const uuid = pick(req, 'UUID', 'uuid');
  // prefer the call UUID (fetched later via get_record_by_call_uuid) over the download URL
  const recStore = uuid ? 'maskyoo-uuid:' + uuid : (recording || null);
  const routedTo = pick(req, 'DEST', 'dest');
  const status = String(pick(req, 'CALLSTATUS', 'callstatus', 'status', 'event', 'type') || '').toLowerCase();
  // Maskyoo end event is CALLSTATUS=ANSWER (answered, with CALLDURATION); also hangup-like words
  const isEnd = duration != null || /end|hangup|finish|complete|done|answer|noanswer|busy/.test(status);
  // call outcome: answered (picked up: duration>0 / ANSWER / has recording) vs missed (ended, never answered).
  // note: Maskyoo's no-answer status is "NOANSWER", which contains "answer" — exclude it explicitly.
  const answered = !!recStore || (duration != null && Number(duration) > 0)
    || (status.includes('answer') && !status.includes('noanswer')) || status.includes('connected');
  const callStatus = isEnd ? (answered ? 'answered' : 'missed') : 'active';

  // Maskyoo reads the destination to route the call to from the START of the response
  // body (destination number), followed by JSON (as the legacy system returned).
  const dest = num ? toIsraeliMsisdn(num.redirect_to_number) : '';
  // Maskyoo reads the destination number from the response. Return ONLY that
  // number, or an empty body when there is none.
  const reply = () => res.type('text/plain').send(dest || '');

  if (!num) { await updateLog(logId, { result: 'no_match' }); return reply(false, 'no match'); }
  if (!num.company_id) { await updateLog(logId, { numberId: num.id, result: 'number_unassigned' }); return reply(true, 'number unassigned'); }

  // --- click-to-call: recognize the webhook of a dialer (create_maskyoo_call_v2) call ---
  // Match a recent callback on THIS virtual where the caller is the agent OR the customer,
  // so the one outgoing lead is reused (no duplicate inbound lead is created).
  const cbKey = String(caller || '').replace(/\D/g, '').slice(-9);
  const viaKey = String(num.phone_number || '').replace(/\D/g, '').slice(-9);
  if (cbKey && viaKey) {
    const cbRows = await query(
      `SELECT id, target_number, status, lead_id FROM callbacks
         WHERE REGEXP_REPLACE(via_number, '[^0-9]', '') LIKE CONCAT('%', ?)
           AND (REGEXP_REPLACE(from_number, '[^0-9]', '') LIKE CONCAT('%', ?) OR REGEXP_REPLACE(target_number, '[^0-9]', '') LIKE CONCAT('%', ?))
           AND status IN ('pending','used') AND created_at > (NOW() - INTERVAL 20 MINUTE)
         ORDER BY id DESC LIMIT 1`, [viaKey, cbKey, cbKey]);
    const cb = cbRows[0];
    if (cb) {
      const target = toIsraeliMsisdn(cb.target_number);
      if (!isEnd) {
        if (cb.status === 'pending') { // first START: route agent->customer, log an outgoing lead
          const st = await query('SELECT id FROM lead_statuses WHERE company_id = ? ORDER BY is_static DESC, sort_order ASC, id ASC LIMIT 1', [num.company_id]);
          const r = await query(
            `INSERT INTO leads (company_id, service_id, status_id, lead_phone, lead_info, lead_through, call_status, created_at, updated_at)
             VALUES (?, ?, ?, ?, '[שיחה יוצאת] חיוג חוזר', 'call_out', 'active', NOW(), NOW())`,
            [num.company_id, num.service_id || null, st[0] ? st[0].id : null, target]);
          await query("UPDATE callbacks SET status = 'used', used_at = NOW(), lead_id = ? WHERE id = ?", [r.insertId, cb.id]);
          await updateLog(logId, { numberId: num.id, companyId: num.company_id, leadId: r.insertId, result: 'callback_out' });
          announceNewLead(num.company_id, r.insertId, 'שיחה יוצאת', target);
        } else {
          await updateLog(logId, { numberId: num.id, companyId: num.company_id, leadId: cb.lead_id, result: 'callback_dup' });
        }
      } else if (cb.lead_id) { // END: attach recording/duration to the outgoing lead
        await query(
          `UPDATE leads SET lead_info = CONCAT(COALESCE(lead_info, ''), ?),
             recording_url = COALESCE(?, recording_url), call_status = ?, updated_at = NOW()
           WHERE id = ? AND (recording_url IS NULL OR recording_url = '')`,
          [`\n[שיחה יוצאת הסתיימה] משך: ${duration || '?'} שנ׳`, recStore, answered ? 'answered' : 'missed', cb.lead_id]);
        await updateLog(logId, { numberId: num.id, companyId: num.company_id, leadId: cb.lead_id, result: 'callback_end' });
        fireChannelWebhook(num.service_id, { id: cb.lead_id, company_id: num.company_id, caller: target, duration, status: answered ? 'answered' : 'missed' });
      }
      return res.type('text/plain').send(target || ''); // route the agent's call to the customer
    }
  }

  if (isEnd) {
    // call end — pair with the recent call lead (wide window to cover call length)
    const recent = await query(
      `SELECT id, recording_url, call_status FROM leads WHERE company_id = ? AND lead_through = 'call' AND (lead_phone <=> ?)
         AND created_at >= (NOW() - INTERVAL 6 HOUR) ORDER BY id DESC LIMIT 1`,
      [num.company_id, caller]);
    if (recent[0]) {
      // a prior end already finalized this call (answered/missed, or recording set) -> retry
      if (recent[0].recording_url || recent[0].call_status === 'answered' || recent[0].call_status === 'missed') {
        await updateLog(logId, { numberId: num.id, companyId: num.company_id, leadId: recent[0].id, result: 'duplicate' });
        return reply(true, 'duplicate');
      }
      const routedLocal = routedTo ? String(routedTo).replace(/\D/g, '').replace(/^972/, '0').replace(/^(?!0)/, '0') : '';
      const label = answered ? 'שיחה הסתיימה' : 'שיחה לא נענתה';
      const info = `\n[${label}] משך: ${duration || '?'} שנ׳${routedLocal ? ` · נותב בפועל ל-${routedLocal}` : ''}`;
      await query(
        `UPDATE leads SET lead_info = CONCAT(COALESCE(lead_info, ''), ?),
           recording_url = COALESCE(?, recording_url), call_status = ?, updated_at = NOW() WHERE id = ?`,
        [info, recStore, callStatus, recent[0].id]);
      await updateLog(logId, { numberId: num.id, companyId: num.company_id, leadId: recent[0].id, result: 'lead_updated' });
      fireChannelWebhook(num.service_id, { id: recent[0].id, company_id: num.company_id, caller, duration, status: callStatus });
      return reply(true, 'lead updated');
    }
  } else {
    // call start — Maskyoo fires this several times per call; de-dupe within 2 min
    const dup = await query(
      `SELECT id FROM leads WHERE company_id = ? AND lead_through = 'call' AND (lead_phone <=> ?)
         AND created_at >= (NOW() - INTERVAL 2 MINUTE) ORDER BY id DESC LIMIT 1`,
      [num.company_id, caller]);
    if (dup[0]) {
      await updateLog(logId, { numberId: num.id, companyId: num.company_id, leadId: dup[0].id, result: 'duplicate' });
      return reply(true, 'duplicate');
    }
  }
  // default status = the company's "new" status (static first, then lowest sort order)
  const st = await query(
    `SELECT id FROM lead_statuses WHERE company_id = ? ORDER BY is_static DESC, sort_order ASC, id ASC LIMIT 1`,
    [num.company_id]);
  const statusId = st[0] ? st[0].id : null;
  const r = await query(
    `INSERT INTO leads (company_id, service_id, status_id, lead_phone, lead_info, lead_through, recording_url, call_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'call', ?, ?, NOW(), NOW())`,
    [num.company_id, num.service_id || null, statusId, caller, duration ? `[שיחה] משך: ${duration}` : null, recStore, callStatus]);
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
     WHERE REGEXP_REPLACE(phone_number, '[^0-9]', '') LIKE CONCAT('%', ?)
     ORDER BY (redirect_to_number IS NOT NULL AND redirect_to_number <> '') DESC, id DESC LIMIT 1`, [key]);
  return processCall(rows[0], req, res, logId);
}));

// Also addressable per-number by id (optional).
router.all('/call/:id', asyncHandler(async (req, res) => {
  const logId = await logInbound(req, 'maskyoo-call', { result: 'received' });
  const rows = await query('SELECT id, company_id, service_id, redirect_to_number FROM phone_numbers WHERE id = ? LIMIT 1', [req.params.id]);
  return processCall(rows[0], req, res, logId);
}));

module.exports = router;
