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

// Push our routing to a Maskyoo number. `routing` is either a single number
// (string) or { numbers[], type, ring_seconds }. Maps to call_destination_phone
// (comma-separated), dial_option (1=simultaneous/parallel, 2=sequential) and
// dial_timeout_in_sec, keeps callback_url pointing at us (start+end), and re-sends
// every other field so update_maskyoo (which replaces the whole record) wipes nothing.
async function syncRouting(maskyooNumber, routing) {
  if (!config.maskyoo.token) return { ok: false, error: 'no_token' };
  const num = intl(maskyooNumber);
  if (!num) return { ok: false, error: 'bad_args' };

  let numbers = [], type = 'sequential', ring = 0;
  if (routing && typeof routing === 'object' && Array.isArray(routing.numbers)) {
    numbers = routing.numbers.filter(Boolean);
    type = routing.type === 'parallel' ? 'parallel' : 'sequential';
    ring = Number(routing.ring_seconds) || 0;
  } else if (routing) { numbers = [String(routing)]; }
  const dests = numbers.map(intl).filter(Boolean);
  if (!dests.length) return { ok: false, error: 'no_dest' };

  const g = await call('get_maskyoo', { maskyoo: num });
  if (g.status?.code !== 200 || !g.result || !g.result[0]) return { ok: false, error: 'get_failed', g };
  const cur = g.result[0];
  const p = {};
  for (const [k, v] of Object.entries(cur)) { if (k === 'create_time') continue; p[k] = v == null ? '' : String(v); }
  p.call_destination_phone = dests.join(',').slice(0, 150);
  p.dial_option = type === 'parallel' ? '1' : '2';                 // 1=simultaneous, 2=sequential (hunt)
  if (ring >= 1 && ring <= 180) p.dial_timeout_in_sec = String(ring);
  if (!p.description || !String(p.description).trim()) p.description = `app26 ${num}`; // required, non-empty
  if (config.appUrl) { p.callback_url = `${config.appUrl}/api/public/call`; p.callback_url_option = '3'; } // start + end
  const u = await call('update_maskyoo', p, 'POST');
  return { ok: u.status?.code === 200, u };
}

// Place an outbound (click-to-call) call: ring `agent`, and on answer bridge to
// `customer`, both presenting the virtual Maskyoo number as caller ID.
// Uses create_maskyoo_call_v2. Returns { ok, code, error, r }.
async function createCall({ maskyooNumber, agent, customer }) {
  if (!config.maskyoo.token) return { ok: false, error: 'no_token' };
  const m = intl(maskyooNumber), d1 = intl(agent), d2 = intl(customer);
  if (!m || !d1 || !d2) return { ok: false, error: 'bad_args' };
  const r = await call('create_maskyoo_call_v2', {
    maskyoo1: m, destination1: d1, maskyoo2: m, destination2: d2,
  }, 'POST');
  const code = r.status && r.status.code;
  if (code === 200) return { ok: true, code, r };
  return { ok: false, code, error: (r.status && r.status.description) || 'call_failed', r };
}

// Ensure a Maskyoo number carries every tag in `tagNames` (create the tag if it
// doesn't exist yet, then add the number as a member). Idempotent & best-effort:
// 5072 = tag already exists, 5044 = number already a member — both are fine.
async function syncTags(maskyooNumber, tagNames) {
  if (!config.maskyoo.token) return { ok: false, error: 'no_token' };
  const num = intl(maskyooNumber);
  if (!num) return { ok: false, error: 'bad_num' };
  const wanted = (tagNames || []).map((t) => String(t == null ? '' : t).trim()).filter(Boolean);
  if (!wanted.length) return { ok: false, error: 'no_tags' };
  // name -> id map of all existing tags (one call)
  const list = await call('view_tags');
  const map = {};
  if (Array.isArray(list.result)) for (const t of list.result) map[String(t.tag_name)] = t.tag_id;
  const done = [];
  for (const name of wanted) {
    let id = map[name];
    if (!id) {
      await call('create_tag', { tag_name: name }, 'POST'); // may 5072 if it exists (race)
      const v = await call('view_tag_by_name', { tag_name: name }); // reliable id lookup
      id = Array.isArray(v.result) && v.result[0] ? v.result[0].tag_id : null;
      if (id) map[name] = id;
    }
    if (!id) { done.push({ name, ok: false }); continue; }
    const a = await call('add_member_to_tag', { tag_id: id, maskyoo: num }, 'POST');
    const code = a.status && a.status.code;
    done.push({ name, id, ok: code === 200 || code === 5044, code });
  }
  return { ok: true, done };
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

module.exports = { call, syncRouting, syncTags, createCall, getRecording, intl };
