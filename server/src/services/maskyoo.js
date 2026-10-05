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

module.exports = { call };
