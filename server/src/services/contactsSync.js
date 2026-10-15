// Leads -> contacts: one contact per phone number per company (the same caller in two companies is
// two contacts). Withheld / invalid numbers are skipped. A contact gets the lead's name and email
// only while it has none (a name already on the contact is never overwritten). The lead is linked
// via leads.contact_id. Runs for every new lead (a poller over leads.id) and when a lead is named.
const { query } = require('../db/pool');

const LAST_KEY = 'contacts_sync_last_lead_id';
const key9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const isRealPhone = (p) => { const k = key9(p); return k.length >= 7 && !/^0+$/.test(k); };

function splitName(full) {
  const s = String(full || '').trim().replace(/\s+/g, ' ');
  if (!s) return { first: null, last: null };
  const i = s.indexOf(' ');
  return i < 0 ? { first: s.slice(0, 50), last: null } : { first: s.slice(0, i).slice(0, 50), last: s.slice(i + 1).slice(0, 50) };
}

async function ensureContactForLead(leadId) {
  const l = (await query('SELECT id, company_id, lead_name, lead_phone, lead_email, contact_id FROM leads WHERE id = ?', [leadId]))[0];
  if (!l || !l.company_id || !isRealPhone(l.lead_phone)) return null;
  const k = key9(l.lead_phone);
  let c = (await query(
    `SELECT id, first_name, last_name, email FROM contacts
      WHERE company_id = ? AND (RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 9) = ? OR RIGHT(REGEXP_REPLACE(phone2, '[^0-9]', ''), 9) = ?)
      ORDER BY id LIMIT 1`, [l.company_id, k, k]))[0];
  const name = splitName(l.lead_name);
  if (!c) {
    const local = String(l.lead_phone).replace(/\D/g, '').replace(/^972/, '0');
    const r = await query(
      'INSERT INTO contacts (company_id, first_name, last_name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [l.company_id, name.first, name.last, local.startsWith('0') ? local : '0' + local, l.lead_email || null]);
    c = { id: r.insertId };
  } else {
    const hasName = String(c.first_name || '').trim() || String(c.last_name || '').trim();
    if (!hasName && name.first) await query('UPDATE contacts SET first_name = ?, last_name = ? WHERE id = ?', [name.first, name.last, c.id]);
    if (!c.email && l.lead_email) await query('UPDATE contacts SET email = ? WHERE id = ?', [l.lead_email, c.id]);
  }
  if (l.contact_id !== c.id) await query('UPDATE leads SET contact_id = ? WHERE id = ?', [c.id, l.id]);
  return c.id;
}

// every lead after the last one handled (the first run backfills all existing leads)
let running = false;
async function syncNewLeads() {
  if (running) return;
  running = true;
  try {
    const last = Number(((await query('SELECT v FROM app_settings WHERE k = ?', [LAST_KEY]))[0] || {}).v) || 0;
    const rows = await query('SELECT id FROM leads WHERE id > ? ORDER BY id LIMIT 500', [last]);
    for (const r of rows) {
      try { await ensureContactForLead(r.id); } catch (e) { console.warn('[contacts-sync] lead', r.id, e.message); }
    }
    if (rows.length) {
      await query('INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [LAST_KEY, String(rows[rows.length - 1].id)]);
      if (rows.length === 500) setImmediate(syncNewLeads); // more to backfill
    }
  } catch (e) {
    console.warn('[contacts-sync] failed:', e.message);
  } finally {
    running = false;
  }
}

function start() {
  setTimeout(syncNewLeads, 15 * 1000);
  setInterval(syncNewLeads, 60 * 1000).unref?.();
  console.log('[contacts-sync] started (every 60s)');
}

module.exports = { start, syncNewLeads, ensureContactForLead };
