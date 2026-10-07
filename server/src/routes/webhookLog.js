const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// Raw inbound webhook attempts (Maskyoo calls, widget intake, etc.).
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { source, result, limit } = req.query;
    const lim = Math.min(Number(limit) || 200, 1000);
    const where = [], params = [];
    if (req.user.role !== 'super_admin') { const s = companyScope(req.user, 'company_id'); where.push(`(${s.sql})`); params.push(...s.params); }
    if (source) { where.push('source = ?'); params.push(source); }
    if (result) { where.push('result = ?'); params.push(result); }
    const rows = await query(
      `SELECT id, source, method, path, ip, query_data, body_data, matched_number_id, company_id, lead_id, result, error, created_at
       FROM webhook_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${lim}`, params);
    res.json({ logs: rows });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return res.json({ logs: [] });
    throw e;
  }
}));

// clear the log (super admin only)
router.delete('/', requireRole('super_admin'), asyncHandler(async (req, res) => {
  await query('DELETE FROM webhook_log').catch(() => {});
  res.json({ ok: true });
}));

// first non-empty scalar for any of `keys` (Maskyoo sends some params as arrays)
const pickFrom = (obj, keys) => {
  for (const k of keys) { const v = obj[k]; if (v != null && v !== '') return Array.isArray(v) ? v[0] : v; }
  return null;
};
// carry forward an existing lead name for this phone in the company, if any
async function nameForPhone(companyId, phone) {
  const key = String(phone || '').replace(/\D/g, '').slice(-9);
  if (!companyId || key.length < 7) return null;
  try {
    const r = await query(
      `SELECT lead_name FROM leads WHERE company_id = ? AND lead_name IS NOT NULL AND lead_name <> ''
         AND REGEXP_REPLACE(lead_phone, '[^0-9]', '') LIKE CONCAT('%', ?) ORDER BY id DESC LIMIT 1`,
      [companyId, key]);
    return r[0] ? r[0].lead_name : null;
  } catch (e) { return null; }
}

// Recover call leads that were wrongly flagged "duplicate" (anonymous CLI=0 collided
// by caller+window). Replays webhook_log entries from the last `hours` and recreates
// the MISSING inbound-call lead per distinct call UUID — silently (no notifications /
// channel webhooks). Dry-run by default; pass { apply: true } to write. Idempotent:
// skips a call that already has a lead (by UUID, or a pre-fix uuid-less lead near its time).
router.post('/recover-call-dups', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const hours = Math.min(Math.max(Number(req.body && req.body.hours) || 24, 1), 168);
  const apply = !!(req.body && req.body.apply === true);
  let rows;
  try {
    rows = await query(
      `SELECT id, query_data, body_data, matched_number_id, company_id, created_at
         FROM webhook_log WHERE source = 'maskyoo-call' AND result = 'duplicate'
           AND created_at >= (NOW() - INTERVAL ? HOUR) ORDER BY id`, [hours]);
  } catch (e) { if (e.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, scanned: 0, created: 0, candidates: [] }); throw e; }

  const out = { ok: true, hours, apply, scanned: rows.length, created: 0, skipped_existing: 0, no_uuid: 0, no_number: 0, candidates: [] };
  const seen = new Set();
  for (const row of rows) {
    let q = {}, b = {};
    try { q = JSON.parse(row.query_data || '{}'); } catch { /* ignore */ }
    try { b = JSON.parse(row.body_data || '{}'); } catch { /* ignore */ }
    const p = { ...q, ...b };
    const uuid = pickFrom(p, ['UUID', 'uuid']);
    if (!uuid) { out.no_uuid++; continue; }
    if (seen.has(uuid)) continue;

    let num = null;
    if (row.matched_number_id) {
      const n = await query('SELECT id, company_id, service_id FROM phone_numbers WHERE id = ? LIMIT 1', [row.matched_number_id]);
      num = n[0] || null;
    }
    if (!num) {
      const did = pickFrom(p, ['DDI', 'ddi', 'did', 'number', 'to', 'called', 'virtual', 'dnis']);
      const key = String(did || '').replace(/\D/g, '').slice(-9);
      if (key) { const n = await query("SELECT id, company_id, service_id FROM phone_numbers WHERE REGEXP_REPLACE(phone_number, '[^0-9]', '') LIKE CONCAT('%', ?) LIMIT 1", [key]); num = n[0] || null; }
    }
    if (!num || !num.company_id) { out.no_number++; continue; }

    const caller = pickFrom(p, ['CLI', 'cli', 'caller', 'from', 'phone', 'ani']) || '';
    // already represented? exact UUID, or a pre-fix (uuid-less) call lead near this time
    const byUuid = await query('SELECT id FROM leads WHERE company_id = ? AND call_uuid = ? LIMIT 1', [num.company_id, uuid]);
    if (byUuid[0]) { out.skipped_existing++; seen.add(uuid); continue; }
    const byWindow = await query(
      `SELECT id FROM leads WHERE company_id = ? AND lead_through = 'call' AND call_uuid IS NULL AND (lead_phone <=> ?)
         AND created_at BETWEEN (? - INTERVAL 15 MINUTE) AND (? + INTERVAL 15 MINUTE) LIMIT 1`,
      [num.company_id, caller, row.created_at, row.created_at]);
    if (byWindow[0]) { out.skipped_existing++; seen.add(uuid); continue; }

    const duration = pickFrom(p, ['CALLDURATION', 'DURATION', 'duration', 'seconds', 'billsec']);
    const recording = pickFrom(p, ['download', 'RECORDING', 'recording', 'recording_url']);
    const status = String(pickFrom(p, ['CALLSTATUS', 'callstatus', 'status', 'event', 'type']) || '').toLowerCase();
    const answered = (duration != null && Number(duration) > 0) || (status.includes('answer') && !status.includes('noanswer')) || status.includes('connected') || !!recording;
    const callStatus = answered ? 'answered' : 'missed';
    const recStore = answered ? 'maskyoo-uuid:' + uuid : null;
    seen.add(uuid);
    if (out.candidates.length < 100) out.candidates.push({ uuid, caller, call_status: callStatus, at: row.created_at, company_id: num.company_id });

    if (apply) {
      const st = await query('SELECT id FROM lead_statuses WHERE company_id = ? ORDER BY is_static DESC, sort_order ASC, id ASC LIMIT 1', [num.company_id]);
      const name = await nameForPhone(num.company_id, caller);
      const r = await query(
        `INSERT INTO leads (company_id, service_id, status_id, lead_name, lead_phone, lead_info, lead_through, recording_url, call_status, call_uuid, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '[שוחזר מהלוג] שיחה', 'call', ?, ?, ?, ?, NOW())`,
        [num.company_id, num.service_id || null, st[0] ? st[0].id : null, name, caller, recStore, callStatus, uuid, row.created_at]);
      await query("UPDATE webhook_log SET lead_id = ?, result = 'recovered' WHERE id = ?", [r.insertId, row.id]);
      out.created++;
    }
  }
  res.json(out);
}));

module.exports = router;
