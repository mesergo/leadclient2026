// Outgoing per-channel webhook (services.export_webhook_url). Every attempt is
// logged to webhook_log (source 'channel-out', with service_id, the HTTP status,
// response snippet or error), so "the customer receives nothing" can be checked.
// Events: call_ended (phone channels, at call end) | lead_created (form/widget
// leads) | test (manual "send test" from the channel page).
const config = require('../config');
const { query } = require('../db/pool');
const recording = require('./recording');

const TIMEOUT_MS = 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Payload builders — shared by real events and the channel page's "send test",
// so a test looks exactly like what the receiver will get in production.
// recording_url: our signed link (only when the lead has a recording);
// recording_ready: the file is already downloadable from that link.
function callEndedPayload({ leadId, companyId, serviceId, caller, duration, status, withRecording = true, recordingReady = false }) {
  const rec = !!(withRecording && leadId);
  return {
    event: 'call_ended', lead_id: leadId, company_id: companyId, service_id: serviceId,
    caller: caller || null,
    duration: duration == null || duration === '' ? null : String(duration),
    status: status || null,                    // 'answered' | 'missed'
    recording_url: rec ? recording.publicUrl(leadId) : null,
    recording_ready: rec && !!recordingReady,
    at: new Date().toISOString(),
  };
}
function leadCreatedPayload({ leadId, companyId, serviceId, name, phone, email, source }) {
  return {
    event: 'lead_created', lead_id: leadId, company_id: companyId, service_id: serviceId,
    name: name || null, phone: phone || null, email: email || null, source: source || null,
    at: new Date().toISOString(),
  };
}

const LEAD_COLS = 'id, lead_name, lead_phone, lead_email, lead_through, call_status, call_duration_sec, recording_url';

// A stored lead in the real event format (call -> call_ended, otherwise lead_created).
// For a call with a recording, the file is fetched/cached first so the link works at once.
async function payloadForLead(service, l) {
  const base = { companyId: service.company_id, serviceId: service.id, leadId: l.id };
  if (l.lead_through === 'call' || l.lead_through === 'call_out') {
    let ready = false;
    if (l.recording_url) { try { ready = await recording.prefetch(l.id); } catch (e) { ready = false; } }
    return callEndedPayload({ ...base, caller: l.lead_phone, duration: l.call_duration_sec,
      status: l.call_status === 'active' ? 'answered' : l.call_status, withRecording: !!l.recording_url, recordingReady: ready });
  }
  return leadCreatedPayload({ ...base, name: l.lead_name, phone: l.lead_phone, email: l.lead_email, source: l.lead_through });
}

// Real call end: for an answered call, hold the webhook until the provider has the
// recording ready (fetched + cached here, so the link downloads immediately) — up to
// ~3.5 minutes, then send anyway with recording_ready:false. Missed calls go at once,
// without a recording link.
async function sendCallEnded(serviceId, lead) {
  const base = { leadId: lead.id, companyId: lead.company_id, serviceId, caller: lead.caller, duration: lead.duration, status: lead.status };
  const row = (await query('SELECT recording_url FROM leads WHERE id = ?', [lead.id]).catch(() => []))[0];
  const hasRec = lead.status === 'answered' && !!(row && row.recording_url);
  let ready = false;
  if (hasRec) {
    const waits = config.maskyoo.token ? [0, 15, 30, 45, 60, 60] : [0]; // seconds between attempts
    for (const w of waits) {
      if (w) await sleep(w * 1000);
      try { ready = await recording.prefetch(lead.id); } catch (e) { ready = false; }
      if (ready) break;
    }
  }
  return send(serviceId, callEndedPayload({ ...base, withRecording: hasRec, recordingReady: ready }),
    { companyId: lead.company_id, leadId: lead.id });
}

// "Send test": the channel's latest lead (preferring one with a recording) in the
// same shape as the real event, flagged test:true; a sample if it has no leads yet.
async function testPayload(service) {
  const base = { companyId: service.company_id, serviceId: service.id };
  const rows = await query(
    `SELECT ${LEAD_COLS} FROM leads WHERE service_id = ?
      ORDER BY (recording_url IS NOT NULL AND recording_url <> '') DESC, id DESC LIMIT 1`, [service.id]);
  const l = rows[0];
  let p;
  if (l) {
    p = await payloadForLead(service, l);
  } else if (service.service_type === 'phone') {
    p = { ...callEndedPayload({ ...base, leadId: 0, caller: '0501234567', duration: 42, status: 'answered', withRecording: false }), sample: true };
  } else {
    p = { ...leadCreatedPayload({ ...base, leadId: 0, name: 'ישראל ישראלי', phone: '0501234567', email: 'test@example.com', source: 'widget' }), sample: true };
  }
  return { ...p, test: true };
}

async function log({ url, payload, serviceId, companyId, leadId, result, error, meta }) {
  try {
    await query(
      `INSERT INTO webhook_log (source, method, path, query_data, body_data, service_id, company_id, lead_id, result, error)
       VALUES ('channel-out', 'POST', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(url || '').slice(0, 255), JSON.stringify(meta || {}).slice(0, 8000), JSON.stringify(payload || {}).slice(0, 8000),
        serviceId || null, companyId || null, leadId || null, result, error ? String(error).slice(0, 250) : null]);
  } catch (e) { /* logging is best-effort */ }
}

// POST `payload` to the channel's webhook URL (or `opts.url`, e.g. an unsaved test URL).
// Resolves with { ok, status, error, ms, response } — never throws.
async function send(serviceId, payload, opts = {}) {
  let url = opts.url || null;
  let companyId = opts.companyId || null;
  if (!url || !companyId) {
    const r = await query('SELECT export_webhook_url, company_id FROM services WHERE id = ?', [serviceId]).catch(() => []);
    if (!url) url = r[0] && r[0].export_webhook_url;
    if (!companyId) companyId = r[0] && r[0].company_id;
  }
  url = String(url || '').trim();
  if (!url) return { skipped: true };
  const base = { url, payload, serviceId, companyId, leadId: opts.leadId || payload.lead_id || null };
  if (!/^https?:\/\//i.test(url)) {
    await log({ ...base, result: 'bad_url', error: 'הכתובת חייבת להתחיל ב-http:// או https://' });
    return { ok: false, error: 'bad_url' };
  }
  const started = Date.now();
  let status = null, response = '', error = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'LeadClient-Webhook/1.0' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    status = res.status;
    response = (await res.text().catch(() => '')).slice(0, 500);
  } catch (e) {
    error = e.name === 'AbortError' ? `timeout (${TIMEOUT_MS / 1000}s)` : (e.cause && e.cause.code) || e.message;
  } finally { clearTimeout(timer); }
  const ms = Date.now() - started;
  const ok = !error && status >= 200 && status < 300;
  const result = error ? 'error' : (ok ? `ok_${status}` : `http_${status}`);
  await log({ ...base, result, error: error || (ok ? null : `HTTP ${status}`), meta: { event: payload.event, status, ms, response } });
  return { ok, status, error, ms, response };
}

// --- resend (super admin) -----------------------------------------------------
const MAX_RESEND = 500;
const running = new Set(); // service ids with a bulk resend in progress

// Leads of the channel created in [from, to] (dates, Israel time). onlyFailed: skip
// leads that already had a successful delivery to this channel.
async function leadsToResend(service, { from, to, onlyFailed }) {
  return query(
    `SELECT ${LEAD_COLS} FROM leads l
      WHERE l.service_id = ? AND l.created_at >= ? AND l.created_at < (? + INTERVAL 1 DAY)
        ${onlyFailed ? `AND NOT EXISTS (SELECT 1 FROM webhook_log w WHERE w.source = 'channel-out' AND w.service_id = l.service_id
                          AND w.lead_id = l.id AND w.result LIKE 'ok\\_%')` : ''}
      ORDER BY l.id ASC LIMIT ${MAX_RESEND + 1}`,
    [service.id, from, to]);
}

// Start a background resend; returns how many leads are queued. Each delivery is
// logged like any other (payload flagged resent:true). One run per channel at a time.
async function startResend(service, opts) {
  if (running.has(service.id)) return { busy: true };
  const leads = await leadsToResend(service, opts);
  const capped = leads.length > MAX_RESEND;
  const list = leads.slice(0, MAX_RESEND);
  if (!list.length) return { queued: 0 };
  running.add(service.id);
  (async () => {
    try {
      for (let i = 0; i < list.length; i += 3) { // 3 at a time, in order
        await Promise.all(list.slice(i, i + 3).map(async (l) =>
          send(service.id, { ...(await payloadForLead(service, l)), resent: true }, { companyId: service.company_id, leadId: l.id })));
      }
    } finally { running.delete(service.id); }
  })();
  return { queued: list.length, capped };
}

// Resend one logged delivery exactly as it was sent (to the channel's current URL).
async function resendLog(service, logId) {
  const r = await query("SELECT body_data, lead_id FROM webhook_log WHERE id = ? AND source = 'channel-out' AND service_id = ?", [logId, service.id]);
  if (!r[0]) return null;
  let payload;
  try { payload = JSON.parse(r[0].body_data || '{}'); } catch { payload = {}; }
  return send(service.id, { ...payload, resent: true }, { companyId: service.company_id, leadId: r[0].lead_id });
}

module.exports = {
  send, sendCallEnded, callEndedPayload, leadCreatedPayload, payloadForLead, testPayload,
  startResend, resendLog, isResending: (id) => running.has(id),
};
