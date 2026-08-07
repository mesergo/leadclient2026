const express = require('express');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'l.company_id');
  const params = [...s.params];
  let extra = '';
  const { company_id, service_id, status_id, start, end, q, agency } = req.query;
  if (agency) { extra += ' AND l.company_id IN (SELECT id FROM companies WHERE agency_id = ?)'; params.push(agency); }
  if (company_id) { extra += ' AND l.company_id = ?'; params.push(company_id); }
  if (service_id) { extra += ' AND l.service_id = ?'; params.push(service_id); }
  if (status_id) { extra += ' AND l.status_id = ?'; params.push(status_id); }
  if (start) { extra += ' AND l.created_at >= ?'; params.push(start); }
  if (end) { extra += ' AND l.created_at <= ?'; params.push(end); }
  if (q) { extra += ' AND (l.lead_name LIKE ? OR l.lead_phone LIKE ? OR l.lead_email LIKE ?)'; params.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  const rows = await query(
    `SELECT l.id, l.lead_name, l.lead_phone, l.lead_email, l.lead_rating, l.company_id, l.service_id, l.status_id,
            l.current_agent_id, l.is_converted, l.created_at, l.last_interaction_at,
            c.name AS company_name, a.name AS agency_name, sv.name AS service_name,
            st.text AS status_text, st.color AS status_color, u.display_name AS agent_name
     FROM leads l
     LEFT JOIN companies c ON c.id = l.company_id
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.id = l.service_id
     LEFT JOIN lead_statuses st ON st.id = l.status_id
     LEFT JOIN users u ON u.id = l.current_agent_id
     WHERE (${s.sql})${extra} ORDER BY l.created_at DESC LIMIT 500`, params);
  res.json({ leads: rows });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'l.company_id');
  const rows = await query(
    `SELECT l.*, c.name AS company_name, sv.name AS service_name, st.text AS status_text
     FROM leads l LEFT JOIN companies c ON c.id = l.company_id
     LEFT JOIN services sv ON sv.id = l.service_id LEFT JOIN lead_statuses st ON st.id = l.status_id
     WHERE l.id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!rows[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  const convos = await query('SELECT id, user_id, content, send_by, comment, from_me, created_at FROM lead_conversations WHERE lead_id = ? ORDER BY created_at DESC', [req.params.id]);
  const tags = await query('SELECT t.id, t.label FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = ?', [req.params.id]);
  res.json({ lead: rows[0], conversations: convos, tags });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { company_id, service_id, lead_name, lead_phone, lead_email, status_id } = req.body || {};
  if (!company_id || !lead_phone) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const r = await query(
    'INSERT INTO leads (company_id, service_id, lead_name, lead_phone, lead_email, status_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [company_id, service_id || null, lead_name || null, lead_phone, lead_email || null, status_id || null]);
  res.status(201).json({ lead: { id: r.insertId } });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM leads WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  const editable = ['status_id', 'current_agent_id', 'lead_rating', 'lead_name', 'lead_email', 'is_converted', 'lead_info'];
  const sets = [], params = [];
  for (const f of editable) if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
  if (sets.length) { sets.push('updated_at = NOW()'); params.push(req.params.id); await query(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`, params); }
  res.json({ ok: true });
}));

router.post('/:id/notes', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM leads WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  const { content, comment } = req.body || {};
  await query('INSERT INTO lead_conversations (lead_id, user_id, content, comment, send_by, from_me, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [req.params.id, req.user.id, content || null, comment || null, 'note']);
  res.status(201).json({ ok: true });
}));

router.post('/:id/tags', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT company_id FROM leads WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  await query('INSERT IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)', [req.params.id, req.body.tag_id]);
  res.status(201).json({ ok: true });
}));

router.delete('/:id/tags/:tagId', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = await query(`SELECT id FROM leads WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'ליד לא נמצא' });
  await query('DELETE FROM lead_tags WHERE lead_id = ? AND tag_id = ?', [req.params.id, req.params.tagId]);
  res.json({ ok: true });
}));

module.exports = router;
