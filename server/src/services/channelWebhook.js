// Outgoing per-channel webhook (services.export_webhook_url). Every attempt is
// logged to webhook_log (source 'channel-out', with service_id, the HTTP status,
// response snippet or error), so "the customer receives nothing" can be checked.
// Events: call_ended (phone channels, at call end) | lead_created (form/widget
// leads) | test (manual "send test" from the channel page).
const { query } = require('../db/pool');
const recording = require('./recording');

const TIMEOUT_MS = 10000;

// Payload builders — shared by real events and the channel page's "send test",
// so a test looks exactly like what the receiver will get in production.
function callEndedPayload({ leadId, companyId, serviceId, caller, duration, status, withRecording = true }) {
  return {
    event: 'call_ended', lead_id: leadId, company_id: companyId, service_id: serviceId,
    caller: caller || null,
    duration: duration == null || duration === '' ? null : String(duration),
    status: status || null,                    // 'answered' | 'missed'
    recording_url: withRecording && leadId ? recording.publicUrl(leadId) : null,
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

// "Send test": the channel's latest lead (preferring one with a recording) in the
// same shape as the real event, flagged test:true; a sample if it has no leads yet.
async function testPayload(service) {
  const base = { companyId: service.company_id, serviceId: service.id };
  const rows = await query(
    `SELECT id, lead_name, lead_phone, lead_email, lead_through, call_status, call_duration_sec, recording_url
       FROM leads WHERE service_id = ?
      ORDER BY (recording_url IS NOT NULL AND recording_url <> '') DESC, id DESC LIMIT 1`, [service.id]);
  const l = rows[0];
  let p;
  if (l && (l.lead_through === 'call' || l.lead_through === 'call_out')) {
    p = callEndedPayload({ ...base, leadId: l.id, caller: l.lead_phone, duration: l.call_duration_sec,
      status: l.call_status === 'active' ? 'answered' : l.call_status, withRecording: !!l.recording_url });
  } else if (l) {
    p = leadCreatedPayload({ ...base, leadId: l.id, name: l.lead_name, phone: l.lead_phone, email: l.lead_email, source: l.lead_through });
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

module.exports = { send, callEndedPayload, leadCreatedPayload, testPayload };
