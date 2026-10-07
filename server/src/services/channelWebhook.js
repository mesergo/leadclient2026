// Outgoing per-channel webhook (services.export_webhook_url). Every attempt is
// logged to webhook_log (source 'channel-out', with service_id, the HTTP status,
// response snippet or error), so "the customer receives nothing" can be checked.
// Events: call_ended (phone channels, at call end) | lead_created (form/widget
// leads) | test (manual "send test" from the channel page).
const { query } = require('../db/pool');

const TIMEOUT_MS = 10000;

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

module.exports = { send };
