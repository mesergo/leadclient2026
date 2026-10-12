// Mobile app caller ID ("smart call identification").
// While the agent's phone rings, the app asks who is calling:
//   - a call forwarded from a virtual number shows the virtual on the phone, not the caller —
//     GET /live returns the calls in progress, so the app can show the customer.
//   - a call straight to the private mobile: GET /lookup names the number; the agent may mark it
//     "business" (POST /mobile-call -> a lead + the number joins their business list, so next
//     time it is recognized automatically) or private (kept on the phone only).
const express = require('express');
const { query, leadScope } = require('../db/pool');
const { requireAuth, loadLeadRestriction } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth, loadLeadRestriction);

const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-9);

// GET /api/calls/live -> { calls: [{ lead_id, name, phone, service_name, virtuals: [..], at }] }
// incoming calls that started in the last 3 minutes and are still ringing/talking, newest first
router.get('/live', asyncHandler(async (req, res) => {
  const s = leadScope(req.user, 'l');
  const rows = await query(
    `SELECT l.id, l.lead_name, l.lead_phone, l.service_id, l.updated_at, sv.name AS service_name
       FROM leads l LEFT JOIN services sv ON sv.id = l.service_id
      WHERE (${s.sql}) AND l.lead_through = 'call' AND l.call_status = 'active'
        AND l.updated_at > (NOW() - INTERVAL 3 MINUTE)
      ORDER BY l.updated_at DESC, l.id DESC LIMIT 5`, s.params);
  const serviceIds = [...new Set(rows.map((r) => r.service_id).filter(Boolean))];
  const nums = serviceIds.length
    ? await query(`SELECT service_id, phone_number, number_to_display FROM phone_numbers WHERE service_id IN (${serviceIds.map(() => '?').join(',')})`, serviceIds)
    : [];
  res.json({
    calls: rows.map((r) => ({
      lead_id: r.id,
      name: r.lead_name || null,
      phone: r.lead_phone || null,
      service_name: r.service_name || null,
      virtuals: nums.filter((n) => n.service_id === r.service_id).flatMap((n) => [n.phone_number, n.number_to_display]).filter(Boolean),
      at: r.updated_at,
    })),
  });
}));

// GET /api/calls/lookup?phone= -> { name, lead_id, business } for a number calling the private mobile
router.get('/lookup', asyncHandler(async (req, res) => {
  const key = phoneKey(req.query.phone);
  if (key.length < 7) return res.json({ name: null, lead_id: null, business: false });
  const s = leadScope(req.user, 'l');
  const lead = (await query(
    `SELECT l.id, l.lead_name FROM leads l
      WHERE (${s.sql}) AND REGEXP_REPLACE(l.lead_phone, '[^0-9]', '') LIKE CONCAT('%', ?)
      ORDER BY (l.lead_name IS NOT NULL AND l.lead_name <> '') DESC, l.id DESC LIMIT 1`, [...s.params, key]))[0];
  const biz = await query('SELECT 1 FROM user_business_numbers WHERE user_id = ? AND phone_key = ?', [req.user.id, key]);
  res.json({ name: (lead && lead.lead_name) || null, lead_id: lead ? lead.id : null, business: biz.length > 0 });
}));

// the agent's business numbers (last 9 digits) — the app caches them for instant recognition
router.get('/business-numbers', asyncHandler(async (req, res) => {
  const rows = await query('SELECT phone_key FROM user_business_numbers WHERE user_id = ? ORDER BY created_at DESC LIMIT 2000', [req.user.id]);
  res.json({ numbers: rows.map((r) => r.phone_key) });
}));

router.delete('/business-numbers/:key', asyncHandler(async (req, res) => {
  await query('DELETE FROM user_business_numbers WHERE user_id = ? AND phone_key = ?', [req.user.id, phoneKey(req.params.key)]);
  res.json({ ok: true });
}));

// POST /api/calls/mobile-call { phone } — a business call that reached the agent's private mobile.
// Creates a lead (lead_through 'mobile') assigned to the agent and remembers the number as business.
// A second report of the same number within 3 minutes reuses the lead (no duplicates).
router.post('/mobile-call', asyncHandler(async (req, res) => {
  const raw = String((req.body && req.body.phone) || '').trim();
  const key = phoneKey(raw);
  if (key.length < 7) return res.status(400).json({ error: 'מספר לא תקין' });
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ error: 'המשתמש אינו משויך לחברה' });
  if (req.user.role === 'sales_manager') return res.status(403).json({ error: 'אין הרשאה' });

  await query('INSERT IGNORE INTO user_business_numbers (user_id, phone_key) VALUES (?, ?)', [req.user.id, key]);

  const recent = (await query(
    `SELECT id FROM leads WHERE company_id = ? AND lead_through = 'mobile' AND current_agent_id = ?
       AND REGEXP_REPLACE(lead_phone, '[^0-9]', '') LIKE CONCAT('%', ?) AND created_at > (NOW() - INTERVAL 3 MINUTE)
     ORDER BY id DESC LIMIT 1`, [companyId, req.user.id, key]))[0];
  if (recent) return res.json({ lead: { id: recent.id }, reused: true });

  const local = raw.replace(/\D/g, '').replace(/^972/, '0');
  const named = (await query(
    `SELECT lead_name FROM leads WHERE company_id = ? AND lead_name IS NOT NULL AND lead_name <> ''
       AND REGEXP_REPLACE(lead_phone, '[^0-9]', '') LIKE CONCAT('%', ?) ORDER BY id DESC LIMIT 1`, [companyId, key]))[0];
  const st = await query(
    'SELECT id FROM lead_statuses WHERE company_id = ? ORDER BY is_static DESC, sort_order ASC, id ASC LIMIT 1', [companyId]);
  const r = await query(
    `INSERT INTO leads (company_id, status_id, lead_name, lead_phone, lead_info, lead_through, current_agent_id,
                        last_interaction_at, last_interaction_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'mobile', ?, NOW(), 'call', NOW(), NOW())`,
    [companyId, st[0] ? st[0].id : null, named ? named.lead_name : null, local || raw,
      '[שיחה עסקית בנייד פרטי]', req.user.id]);
  res.status(201).json({ lead: { id: r.insertId }, reused: false });
}));

module.exports = router;
