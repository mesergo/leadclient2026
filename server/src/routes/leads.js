const express = require('express');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const fs = require('fs');
const path = require('path');
const integrations = require('../services/integrations');
const notify = require('../services/notify');
const maskyoo = require('../services/maskyoo');
const config = require('../config');
// recordings are stored in a private dir inside the persistent volume (dot-prefixed
// so express.static does NOT serve it publicly); only the authed proxy below reads it.
const REC_DIR = path.join(config.uploadDir, '.recordings');

const router = express.Router();
// allow the recording <audio>/download link to authenticate via ?token=
router.use((req, res, next) => { if (!req.headers.authorization && req.query.token) req.headers.authorization = `Bearer ${req.query.token}`; next(); });
router.use(requireAuth);

// Stream a call recording through our server (Maskyoo download needs a Bearer
// token + whitelisted IP; the browser cannot send those, so we proxy it).
router.get('/:id/recording', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const rows = await query(`SELECT id, recording_url FROM leads WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  const lead = rows[0];
  if (!lead || !lead.recording_url) return res.status(404).json({ error: 'no_recording' });

  // already downloaded to our server -> serve the private local copy
  if (lead.recording_url.startsWith('local:')) {
    const fp = path.join(REC_DIR, path.basename(lead.recording_url.slice(6)));
    if (fs.existsSync(fp)) return res.sendFile(fp);
    return res.status(404).json({ error: 'file_missing' });
  }

  // Maskyoo recording by call UUID -> fetch via REST API (get_record_by_call_uuid), store, serve
  if (lead.recording_url.startsWith('maskyoo-uuid:')) {
    const uuid = lead.recording_url.slice('maskyoo-uuid:'.length);
    const buf = await maskyoo.getRecording(uuid);
    if (!buf) return res.status(404).json({ error: 'recording_not_ready' }); // may still be processing
    try {
      fs.mkdirSync(REC_DIR, { recursive: true });
      const fname = `lead-${lead.id}.wav`;
      fs.writeFileSync(path.join(REC_DIR, fname), buf);
      await query('UPDATE leads SET recording_url = ? WHERE id = ?', [`local:${fname}`, lead.id]);
    } catch (e) { /* still serve what we fetched */ }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="recording-${lead.id}.wav"`);
    return res.send(buf);
  }

  if (!/^https?:\/\//i.test(lead.recording_url)) return res.status(404).json({ error: 'no_recording' });

  // first access: fetch from Maskyoo (Bearer + whitelisted IP), store locally, then serve
  try {
    const r = await fetch(lead.recording_url, { headers: config.maskyoo.token ? { Authorization: `Bearer ${config.maskyoo.token}` } : {} });
    if (!r.ok) return res.status(502).json({ error: `maskyoo_${r.status}` });
    const ct = r.headers.get('content-type') || 'audio/mpeg';
    if (!/audio|octet-stream|mpeg|wav|mp4/i.test(ct)) return res.status(502).json({ error: 'not_audio', ct }); // e.g. got an auth page
    const ext = /wav/i.test(ct) ? 'wav' : /mp4|m4a|aac/i.test(ct) ? 'm4a' : 'mp3';
    const buf = Buffer.from(await r.arrayBuffer());
    try {
      fs.mkdirSync(REC_DIR, { recursive: true });
      const fname = `lead-${lead.id}.${ext}`;
      fs.writeFileSync(path.join(REC_DIR, fname), buf);
      await query('UPDATE leads SET recording_url = ? WHERE id = ?', [`local:${fname}`, lead.id]);
    } catch (e) { /* if saving fails, still serve what we fetched */ }
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `inline; filename="recording-${lead.id}.${ext}"`);
    res.send(buf);
  } catch (e) { res.status(502).json({ error: 'fetch_failed' }); }
}));

// ---- list ----
router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'l.company_id');
  const params = [...s.params];
  let extra = '';
  const { company_id, service_id, status_id, start, end, q, agency } = req.query;
  if (agency) { extra += ' AND l.company_id IN (SELECT id FROM companies WHERE agency_id = ?)'; params.push(agency); }
  if (company_id) { extra += ' AND l.company_id = ?'; params.push(company_id); }
  if (service_id) { extra += ' AND l.service_id = ?'; params.push(service_id); }
  if (status_id) { extra += ' AND l.status_id = ?'; params.push(status_id); }
  if (start) { extra += ' AND l.created_at >= ?'; params.push(start + ' 00:00:00'); }
  if (end) { extra += ' AND l.created_at <= ?'; params.push(end + ' 23:59:59'); }
  if (q) { extra += ' AND (l.lead_name LIKE ? OR l.lead_phone LIKE ? OR l.lead_email LIKE ?)'; params.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  const rows = await query(
    `SELECT l.id, l.lead_name, l.lead_phone, l.lead_email, l.lead_rating, l.lead_through, l.company_id, l.service_id, l.status_id,
            l.current_agent_id, l.is_converted, l.created_at, l.last_interaction_at, l.last_interaction_type,
            c.name AS company_name, a.name AS agency_name, sv.name AS service_name, sv.service_type,
            st.text AS status_text, st.color AS status_color,
            u.display_name AS agent_name, u.current_status AS agent_status
     FROM leads l
     LEFT JOIN companies c ON c.id = l.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.id = l.service_id
     LEFT JOIN lead_statuses st ON st.id = l.status_id
     LEFT JOIN users u ON u.id = l.current_agent_id
     WHERE (${s.sql})${extra} ORDER BY l.created_at DESC LIMIT 500`, params);

  // batch tags for the returned leads
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const tagRows = await query(
      `SELECT lt.lead_id, t.id, t.label FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const byLead = {};
    for (const tr of tagRows) (byLead[tr.lead_id] = byLead[tr.lead_id] || []).push({ id: tr.id, label: tr.label });
    for (const r of rows) r.tags = byLead[r.id] || [];
  }
  res.json({ leads: rows });
}));

// ---- single lead (card) ----
router.get('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'l.company_id');
  const rows = await query(
    `SELECT l.*, c.name AS company_name, a.name AS agency_name, sv.name AS service_name, sv.service_type,
            st.text AS status_text, st.color AS status_color, u.display_name AS agent_name
     FROM leads l
     LEFT JOIN companies c ON c.id = l.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.id = l.service_id
     LEFT JOIN lead_statuses st ON st.id = l.status_id
     LEFT JOIN users u ON u.id = l.current_agent_id
     WHERE l.id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!rows[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  const lead = rows[0];
  const conversations = await query(
    'SELECT id, user_id, content, send_by, comment, from_me, created_at FROM lead_conversations WHERE lead_id = ? ORDER BY created_at DESC', [req.params.id]);
  const tags = await query('SELECT t.id, t.label FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = ?', [req.params.id]);
  const reminders = await query('SELECT id, reminder_at, comment, user_id FROM reminders WHERE lead_id = ? ORDER BY reminder_at ASC', [req.params.id]);
  const statuses = await query('SELECT id, text, color FROM lead_statuses WHERE company_id = ? ORDER BY sort_order', [lead.company_id]);
  const agents = await query(
    "SELECT id, display_name FROM users WHERE company_id = ? AND is_active = 1 AND role IN ('company_admin','company_user') ORDER BY display_name", [lead.company_id]);
  res.json({ lead, conversations, tags, reminders, statuses, agents });
}));

// ---- create ----
router.post('/', asyncHandler(async (req, res) => {
  const { company_id, service_id, lead_name, lead_phone, lead_email, status_id } = req.body || {};
  if (!company_id || !lead_phone) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const r = await query(
    'INSERT INTO leads (company_id, service_id, lead_name, lead_phone, lead_email, status_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [company_id, service_id || null, lead_name || null, lead_phone, lead_email || null, status_id || null]);
  notify.notifyCompany({ companyId: company_id, event: 'new_lead', title: 'ליד חדש', body: `${lead_name || 'ללא שם'} · ${lead_phone}`, leadId: r.insertId, excludeUserId: req.user.id }).catch(() => {});
  res.status(201).json({ lead: { id: r.insertId } });
}));

async function ownLead(req) {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id, company_id, lead_name, lead_phone, lead_email, lead_through FROM leads WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  return owned[0] || null;
}

// ---- update (status / assign agent / rating / convert) ----
router.patch('/:id', asyncHandler(async (req, res) => {
  const lead = await ownLead(req);
  if (!lead) return res.status(404).json({ error: 'ליד לא נמצא' });
  // the caller's number on an incoming-call lead is locked — never let it be changed/cleared
  if (lead.lead_through === 'call') delete req.body.lead_phone;
  const editable = ['status_id', 'current_agent_id', 'lead_rating', 'lead_name', 'lead_phone', 'lead_email', 'is_converted', 'lead_info'];
  const sets = [], params = [];
  for (const f of editable) if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
  if (sets.length) { sets.push('updated_at = NOW()'); params.push(req.params.id); await query(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`, params); }

  // notify on a status change, but only for statuses flagged for_notification
  if (req.body.status_id !== undefined && req.body.status_id) {
    const st = await query('SELECT name, for_notification FROM statuses WHERE id = ?', [req.body.status_id]);
    if (st[0] && st[0].for_notification) {
      notify.notifyCompany({ companyId: lead.company_id, event: 'status_change', title: 'שינוי סטטוס', body: `${lead.lead_name || lead.lead_phone} → ${st[0].name}`, leadId: lead.id, excludeUserId: req.user.id }).catch(() => {});
    }
  }
  res.json({ ok: true });
}));

// ---- conversation note (general) ----
router.post('/:id/notes', asyncHandler(async (req, res) => {
  if (!(await ownLead(req))) return res.status(404).json({ error: 'ליד לא נמצא' });
  const { content, comment } = req.body || {};
  await query('INSERT INTO lead_conversations (lead_id, user_id, content, comment, send_by, from_me, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [req.params.id, req.user.id, content || null, comment || null, 'note']);
  res.status(201).json({ ok: true });
}));

// ---- treatment log entry (טיפול בלקוח) ----
router.post('/:id/treatment', asyncHandler(async (req, res) => {
  if (!(await ownLead(req))) return res.status(404).json({ error: 'ליד לא נמצא' });
  const { action_type, content } = req.body || {};
  if (!action_type) return res.status(400).json({ error: 'חסר סוג פעולה' });
  await query('INSERT INTO lead_conversations (lead_id, user_id, content, comment, send_by, from_me, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [req.params.id, req.user.id, content || null, action_type, 'treatment']);
  res.status(201).json({ ok: true });
}));

// ---- send message (mock via integration adapter) ----
router.post('/:id/message', asyncHandler(async (req, res) => {
  const lead = await ownLead(req);
  if (!lead) return res.status(404).json({ error: 'ליד לא נמצא' });
  const { channel, content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'חסר תוכן' });
  let result;
  if (channel === 'whatsapp') result = await integrations.whatsapp.send({ to: lead.lead_phone, template: null, params: { content } });
  else if (channel === 'email') result = await integrations.emailMarketing.syncContact({ contact: { email: lead.lead_email } });
  else result = await integrations.sms.send({ to: lead.lead_phone, text: content });
  await query('INSERT INTO lead_conversations (lead_id, user_id, content, comment, send_by, from_me, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [req.params.id, req.user.id, content, null, channel || 'sms']);
  res.status(201).json({ ok: true, delivery: result });
}));

// ---- reminders for a lead ----
router.post('/:id/reminders', asyncHandler(async (req, res) => {
  const lead = await ownLead(req);
  if (!lead) return res.status(404).json({ error: 'ליד לא נמצא' });
  const { reminder_at, comment } = req.body || {};
  if (!reminder_at) return res.status(400).json({ error: 'חסר תאריך' });
  await query('INSERT INTO reminders (lead_id, user_id, reminder_at, comment) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, reminder_at, comment || null]);
  res.status(201).json({ ok: true });
}));

// ---- tags ----
router.post('/:id/tags', asyncHandler(async (req, res) => {
  if (!(await ownLead(req))) return res.status(404).json({ error: 'ליד לא נמצא' });
  await query('INSERT IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)', [req.params.id, req.body.tag_id]);
  res.status(201).json({ ok: true });
}));

router.delete('/:id/tags/:tagId', asyncHandler(async (req, res) => {
  if (!(await ownLead(req))) return res.status(404).json({ error: 'ליד לא נמצא' });
  await query('DELETE FROM lead_tags WHERE lead_id = ? AND tag_id = ?', [req.params.id, req.params.tagId]);
  res.json({ ok: true });
}));

module.exports = router;
