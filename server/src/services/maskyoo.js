// Minimal Maskyoo REST API client. Runs from our server (whitelisted IP) with
// the account Bearer token. https://[MASKYOO_URL]/api/?service=...
const config = require('../config');

async function call(service, params = {}, method = 'GET') {
  const base = config.maskyoo.apiUrl;        // e.g. https://www.maskyoo.com/leadclient/api/
  const token = config.maskyoo.token;
  if (!base) throw new Error('MASKYOO_API_URL not set');
  if (!token) throw new Error('MASKYOO_TOKEN not set');
  const headers = { Authorization: `Bearer ${token}` };
  let r;
  if (method === 'POST') {
    const body = new URLSearchParams({ service, format: 'json', ...params });
    r = await fetch(base, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  } else {
    const url = `${base}?${new URLSearchParams({ service, format: 'json', ...params })}`;
    r = await fetch(url, { method: 'GET', headers });
  }
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 2000) }; }
  return { httpStatus: r.status, ...json };
}

const intl = (n) => { const d = String(n || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('972')) return d; if (d.startsWith('0')) return '972' + d.slice(1); return '972' + d; };

// Push our routing to a Maskyoo number: set call_destination_phone (and keep
// callback_url pointing at us). Reads current settings and re-sends them all so
// nothing is wiped (update_maskyoo replaces the whole record). Best-effort.
async function syncRouting(maskyooNumber, destPhone) {
  if (!config.maskyoo.token) return { ok: false, error: 'no_token' };
  const num = intl(maskyooNumber), dest = intl(destPhone);
  if (!num || !dest) return { ok: false, error: 'bad_args' };
  const g = await call('get_maskyoo', { maskyoo: num });
  if (g.status?.code !== 200 || !g.result || !g.result[0]) return { ok: false, error: 'get_failed', g };
  const cur = g.result[0];
  const p = {};
  for (const [k, v] of Object.entries(cur)) { if (k === 'create_time') continue; p[k] = v == null ? '' : String(v); }
  p.call_destination_phone = dest;
  if (config.appUrl) p.callback_url = `${config.appUrl}/api/public/call`;
  const u = await call('update_maskyoo', p, 'POST');
  return { ok: u.status?.code === 200, u };
}

// Download a call recording by its call UUID (returns a WAV Buffer, or null).
async function getRecording(uuid) {
  if (!config.maskyoo.token || !uuid) return null;
  try {
    const url = `${config.maskyoo.apiUrl}?${new URLSearchParams({ service: 'get_record_by_call_uuid', call_uuid: uuid, format: 'json' })}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${config.maskyoo.token}` } });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (/audio|octet-stream/i.test(ct) && buf.length > 100) return buf; // reject HTML/JSON error pages
    return null;
  } catch (e) { return null; }
}

module.exports = { call, syncRouting, getRecording, intl };
