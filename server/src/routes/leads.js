const express = require('express');
const { query, companyScope, canAccessCompany, leadScope } = require('../db/pool');
const { requireAuth, loadLeadRestriction } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const fs = require('fs');
const path = require('path');
const integrations = require('../services/integrations');
const notify = require('../services/notify');
const maskyoo = require('../services/maskyoo');
const recording = require('../services/recording');
const config = require('../config');
// recordings are stored in a private dir inside the persistent volume; index.js blocks
// dot-paths under /uploads, so only the authed proxy below reads it.
const REC_DIR = path.join(config.uploadDir, '.recordings');

const router = express.Router();
// allow the recording <audio>/download link to authenticate via ?token=
router.use((req, res, next) => { if (!req.headers.authorization && req.query.token) req.headers.authorization = `Bearer ${req.query.token}`; next(); });
router.use(requireAuth, loadLeadRestriction); // ownLeadsOnly -> leadScope()

// Stream a call recording through our server (Maskyoo download needs a Bearer
// token + whitelisted IP; the browser cannot send those, so we proxy it).
router.get('/:id/recording', asyncHandler(async (req, res) => {
  const s = leadScope(req.user);
  const rows = await query(`SELECT id, recording_url FROM leads WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  const lead = rows[0];
  return recording.serve(res, lead);
}));

// ---- list ----
router.get('/', asyncHandler(async (req, res) => {
  const s = leadScope(req.user, 'l');
  const params = [...s.params];
  let extra = '';
  const { company_id, service_id, status_id, start, end, q, agency, mine, unassigned, agent_id, updated_since } = req.query;
  if (agency) { extra += ' AND l.company_id IN (SELECT id FROM companies WHERE agency_id = ?)'; params.push(agency); }
  if (company_id) { extra += ' AND l.company_id = ?'; params.push(company_id); }
  if (service_id) { extra += ' AND l.service_id = ?'; params.push(service_id); }
  if (status_id) { extra += ' AND l.status_id = ?'; params.push(status_id); }
  if (start) { extra += ' AND l.created_at >= ?'; params.push(start + ' 00:00:00'); }
  if (end) { extra += ' AND l.created_at <= ?'; params.push(end + ' 23:59:59'); }
  // "my leads" filters — narrow on top of leadScope (a restricted agent's unassigned is always empty)
  if (mine === '1' || mine === 'true') { extra += ' AND l.current_agent_id = ?'; params.push(req.user.id); }
  if (unassigned === '1' || unassigned === 'true') extra += ' AND l.current_agent_id IS NULL';
  if (agent_id) { extra += ' AND l.current_agent_id = ?'; params.push(Number(agent_id)); }
  if (updated_since) { extra += ' AND l.updated_at > ?'; params.push(updated_since); } // Israel time, like every API date
  if (q) { extra += ' AND (l.lead_name LIKE ? OR l.lead_phone LIKE ? OR l.lead_email LIKE ?)'; params.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const rows = await query(
    `SELECT l.id, l.lead_name, l.lead_phone, l.lead_email, l.lead_rating, l.lead_through, l.company_id, l.service_id, l.status_id,
            l.call_status, l.recording_url,
            l.current_agent_id, l.is_converted, l.created_at, l.updated_at, l.last_interaction_at, l.last_interaction_type,
            c.name AS company_name, a.name AS agency_name, sv.name AS service_name, sv.service_type,
            st.text AS status_text, st.color AS status_color,
            u.display_name AS agent_name, u.current_status AS agent_status,
            -- the virtual number a call from this lead goes out through (as in GET /:id)
            COALESCE(
              (SELECT pn.phone_number FROM webhook_log w JOIN phone_numbers pn ON pn.id = w.matched_number_id
                 WHERE w.lead_id = l.id AND w.source = 'maskyoo-call' AND pn.company_id = l.company_id ORDER BY w.id DESC LIMIT 1),
              (SELECT pn2.phone_number FROM phone_numbers pn2 WHERE pn2.service_id = l.service_id AND pn2.company_id = l.company_id ORDER BY pn2.id LIMIT 1)
            ) AS via_number
     FROM leads l
     LEFT JOIN companies c ON c.id = l.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.id = l.service_id
     LEFT JOIN lead_statuses st ON st.id = l.status_id
     LEFT JOIN users u ON u.id = l.current_agent_id
     WHERE (${s.sql})${extra} ORDER BY l.created_at DESC, l.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  // total under the same scope + filters (no limit) — cheap path when the page isn't full
  const total = offset === 0 && rows.length < limit
    ? rows.length
    : (await query(`SELECT COUNT(*) AS n FROM leads l WHERE (${s.sql})${extra}`, params))[0].n;

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
  res.json({ leads: rows, total: Number(total) });
}));

// ---- single lead (card) ----
router.get('/:id', asyncHandler(async (req, res) => {
  const s = leadScope(req.user, 'l');
  const rows = await query(
    `SELECT l.*, c.name AS company_name, a.name AS agency_name, sv.name AS service_name, sv.service_type,
            st.text AS status_text, st.color AS status_color, u.display_name AS agent_name,
            COALESCE(NULLIF(ab.display_name,''), NULLIF(TRIM(CONCAT_WS(' ', ab.first_name, ab.last_name)),''), ab.username) AS answered_by_name,
            ab.phone AS answered_by_phone,
            -- the virtual number a call from this lead goes out through (its incoming number, else its channel's)
            COALESCE(
              (SELECT pn.phone_number FROM webhook_log w JOIN phone_numbers pn ON pn.id = w.matched_number_id
                 WHERE w.lead_id = l.id AND w.source = 'maskyoo-call' AND pn.company_id = l.company_id ORDER BY w.id DESC LIMIT 1),
              (SELECT pn2.phone_number FROM phone_numbers pn2 WHERE pn2.service_id = l.service_id AND pn2.company_id = l.company_id ORDER BY pn2.id LIMIT 1)
            ) AS via_number
     FROM leads l
     LEFT JOIN companies c ON c.id = l.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.id = l.service_id
     LEFT JOIN lead_statuses st ON st.id = l.status_id
     LEFT JOIN users u ON u.id = l.current_agent_id
     LEFT JOIN users ab ON ab.id = l.answered_by
     WHERE l.id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!rows[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  const lead = rows[0];
  // "answered by": the number the call was routed to has no linked user -> name it from this
  // company's users, else this company's contacts (never another company's people)
  if (!lead.answered_by_name && lead.answered_phone) {
    const k = String(lead.answered_phone).replace(/\D/g, '').slice(-9);
    if (k.length >= 7) {
      const who = (await query(
        `SELECT COALESCE(NULLIF(display_name,''), NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)),''), username) AS name
           FROM users u WHERE u.is_active = 1 AND RIGHT(REGEXP_REPLACE(u.phone, '[^0-9]', ''), 9) = ?
             AND (u.company_id = ? OR EXISTS (SELECT 1 FROM user_companies uc WHERE uc.user_id = u.id AND uc.company_id = ?)) LIMIT 1`,
        [k, lead.company_id, lead.company_id]))[0]
        || (await query(
          `SELECT NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') AS name FROM contacts
            WHERE company_id = ? AND (RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 9) = ? OR RIGHT(REGEXP_REPLACE(phone2, '[^0-9]', ''), 9) = ?)
              AND TRIM(CONCAT_WS(' ', first_name, last_name)) <> '' LIMIT 1`,
          [lead.company_id, k, k]))[0];
      if (who && who.name) lead.answered_by_name = who.name;
    }
  }
  const conversations = await query(
    'SELECT id, user_id, content, send_by, comment, from_me, created_at FROM lead_conversations WHERE lead_id = ? ORDER BY created_at DESC', [req.params.id]);
  const tags = await query('SELECT t.id, t.label FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = ?', [req.params.id]);
  const reminders = await query('SELECT id, reminder_at, comment, user_id, done_at FROM reminders WHERE lead_id = ? ORDER BY reminder_at ASC', [req.params.id]);
  const statuses = await query('SELECT id, text, color FROM lead_statuses WHERE company_id = ? ORDER BY sort_order', [lead.company_id]);
  const agents = await query(
    `SELECT u.id, u.display_name FROM users u LEFT JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = ?
      WHERE (u.company_id = ? OR uc.id IS NOT NULL) AND u.is_active = 1 AND COALESCE(uc.role, u.role) IN ('company_admin','company_user')
      ORDER BY u.display_name`, [lead.company_id, lead.company_id]);
  res.json({ lead, conversations, tags, reminders, statuses, agents });
}));

// ---- create ----
router.post('/', asyncHandler(async (req, res) => {
  const { company_id, service_id, lead_name, lead_phone, lead_email, status_id } = req.body || {};
  if (!company_id || !lead_phone) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  // an agent limited to own leads creates leads for themselves (else they couldn't see it)
  const agentId = req.user.ownLeadsOnly ? req.user.id : null;
  const r = await query(
    'INSERT INTO leads (company_id, service_id, lead_name, lead_phone, lead_email, status_id, current_agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [company_id, service_id || null, lead_name || null, lead_phone, lead_email || null, status_id || null, agentId]);
  notify.notifyCompany({ companyId: company_id, event: 'new_lead', title: 'ליד חדש', body: `${lead_name || 'ללא שם'} · ${lead_phone}`, leadId: r.insertId, excludeUserId: req.user.id }).catch(() => {});
  res.status(201).json({ lead: { id: r.insertId } });
}));

// any activity on a lead bumps updated_at (drives ?updated_since= sync in the mobile app)
const touchLead = (id) => query('UPDATE leads SET updated_at = NOW() WHERE id = ?', [id]);
// a handling action (note/treatment/message) also marks the lead as interacted with
const interact = (id, type) => query(
  'UPDATE leads SET last_interaction_at = NOW(), last_interaction_type = ?, updated_at = NOW() WHERE id = ?', [type, id]);

async function ownLead(req) {
  const s = leadScope(req.user);
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
    const st = await query('SELECT text, for_notification FROM lead_statuses WHERE id = ?', [req.body.status_id]);
    if (st[0] && st[0].for_notification) {
      notify.notifyCompany({ companyId: lead.company_id, event: 'status_change', title: 'שינוי סטטוס', body: `${lead.lead_name || lead.lead_phone} → ${st[0].text}`, leadId: lead.id, excludeUserId: req.user.id }).catch(() => {});
    }
  }

  // the lead's contact (one per phone per company) gets the name too, if it has none yet
  if (req.body.lead_name !== undefined && String(req.body.lead_name || '').trim()) {
    require('../services/contactsSync').ensureContactForLead(lead.id).catch(() => {});
  }

  // naming a lead names the contact: propagate to every lead with the same phone
  // in this company (past and — via nameForPhone on intake — future).
  if (req.body.lead_name !== undefined && String(req.body.lead_name || '').trim() && lead.lead_phone) {
    const key = String(lead.lead_phone).replace(/\D/g, '').slice(-9);
    if (key.length >= 7) {
      await query(
        `UPDATE leads SET lead_name = ? WHERE company_id = ? AND id <> ?
           AND REGEXP_REPLACE(lead_phone, '[^0-9]', '') LIKE CONCAT('%', ?)`,
        [String(req.body.lead_name).trim(), lead.company_id, lead.id, key]);
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
  await interact(req.params.id, 'note');
  res.status(201).json({ ok: true });
}));

// ---- treatment log entry (טיפול בלקוח) ----
router.post('/:id/treatment', asyncHandler(async (req, res) => {
  if (!(await ownLead(req))) return res.status(404).json({ error: 'ליד לא נמצא' });
  const { action_type, content } = req.body || {};
  if (!action_type) return res.status(400).json({ error: 'חסר סוג פעולה' });
  await query('INSERT INTO lead_conversations (lead_id, user_id, content, comment, send_by, from_me, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [req.params.id, req.user.id, content || null, action_type, 'treatment']);
  await interact(req.params.id, 'treatment');
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
  await interact(req.params.id, channel === 'whatsapp' || channel === 'email' ? channel : 'sms');
  res.status(201).json({ ok: true, delivery: result });
}));

// ---- reminders for a lead ----
router.post('/:id/reminders', asyncHandler(async (req, res) => {
  const lead = await ownLead(req);
  if (!lead) return res.status(404).json({ error: 'ליד לא נמצא' });
  const { reminder_at, comment } = req.body || {};
  if (!reminder_at) return res.status(400).json({ error: 'חסר תאריך' });
  await query('INSERT INTO reminders (lead_id, user_id, lead_name, reminder_at, comment) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, req.user.id, lead.lead_name || null, reminder_at, comment || null]);
  await touchLead(req.params.id);
  res.status(201).json({ ok: true });
}));

// ---- tags ----
router.post('/:id/tags', asyncHandler(async (req, res) => {
  if (!(await ownLead(req))) return res.status(404).json({ error: 'ליד לא נמצא' });
  await query('INSERT IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)', [req.params.id, req.body.tag_id]);
  await touchLead(req.params.id);
  res.status(201).json({ ok: true });
}));

router.delete('/:id/tags/:tagId', asyncHandler(async (req, res) => {
  if (!(await ownLead(req))) return res.status(404).json({ error: 'ליד לא נמצא' });
  await query('DELETE FROM lead_tags WHERE lead_id = ? AND tag_id = ?', [req.params.id, req.params.tagId]);
  await touchLead(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
