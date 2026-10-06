const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const messergo = require('../services/messergo');
const maskyoo = require('../services/maskyoo');

const router = express.Router();
router.use(requireAuth);

// Options for the dialer dropdowns, scoped to what the user may see (super_admin →
// all, agency_admin → their agencies, company roles → their company): the agents'
// mobiles, the channels' forwarding targets, and the virtual numbers.
router.get('/options', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const mobiles = await query(
    `SELECT COALESCE(NULLIF(display_name,''), NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)),''), username) AS name, phone
       FROM users WHERE is_active = 1 AND phone IS NOT NULL AND phone <> '' AND (${s.sql}) ORDER BY name LIMIT 300`, s.params);
  const t = await query(
    `SELECT DISTINCT redirect_to_number AS n FROM phone_numbers
       WHERE redirect_to_number IS NOT NULL AND redirect_to_number <> '' AND (${s.sql}) LIMIT 300`, s.params);
  const virtuals = await query(
    `SELECT id, phone_number, number_to_display FROM phone_numbers
       WHERE company_id IS NOT NULL AND (${s.sql}) ORDER BY phone_number LIMIT 500`, s.params);
  res.json({ mobiles, targets: t.map((x) => x.n), virtuals });
}));

// Register a pending callback: when `from_number` next calls in, the system routes
// that call to `target_number` (logged as an outgoing call). Supersedes any prior pending one.
// Place a click-to-call: Maskyoo rings the agent and bridges to the customer via
// a dedicated outbound call (create_maskyoo_call_v2). This does NOT touch the
// virtual number's general routing — it is specific to this call only.
router.post('/', asyncHandler(async (req, res) => {
  const { from_number, via_number, target_number } = req.body || {};
  if (!from_number || !target_number) return res.status(400).json({ error: 'חסר מספר מוצא או יעד' });
  if (!via_number) return res.status(400).json({ error: 'חסר מספר וירטואלי לחיוג דרכו' });
  const from = messergo.toE164(from_number);
  const target = messergo.toE164(target_number);
  const via = messergo.toE164(via_number);

  // the outgoing call is logged under the virtual number's company/channel
  const key = messergo.digits(via).slice(-9);
  const vn = await query(
    `SELECT company_id, service_id FROM phone_numbers WHERE REGEXP_REPLACE(phone_number,'[^0-9]','') LIKE CONCAT('%', ?) LIMIT 1`, [key]);
  const companyId = (vn[0] && vn[0].company_id) || req.user.company_id || null;
  const serviceId = (vn[0] && vn[0].service_id) || null;

  // place the dedicated bridged call (no change to call_destination_phone)
  const placed = await maskyoo.createCall({ maskyooNumber: via, agent: from, customer: target });
  if (!placed.ok) {
    return res.status(502).json({ error: 'יצירת השיחה נכשלה' + (placed.error && placed.error !== 'call_failed' ? `: ${placed.error}` : '') });
  }

  // log it as an outgoing call lead (customer is the lead)
  let leadId = null;
  if (companyId) {
    const st = await query('SELECT id FROM lead_statuses WHERE company_id = ? ORDER BY is_static DESC, sort_order ASC, id ASC LIMIT 1', [companyId]);
    const lr = await query(
      `INSERT INTO leads (company_id, service_id, status_id, lead_phone, lead_info, lead_through, call_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, '[שיחה יוצאת] חיוג מהחייגן', 'call_out', 'active', NOW(), NOW())`,
      [companyId, serviceId, st[0] ? st[0].id : null, messergo.digits(target).replace(/^972/, '0')]);
    leadId = lr.insertId;
    notify.notifyCompany({ companyId, event: 'new_lead', title: 'שיחה יוצאת', body: `חיוג ל-${target_number}`, leadId }).catch(() => {});
  }
  // keep a record so the end-of-call webhook can attach the recording to this lead
  await query("UPDATE callbacks SET status = 'expired' WHERE from_number = ? AND status = 'pending'", [from]);
  await query(
    "INSERT INTO callbacks (company_id, user_id, from_number, via_number, target_number, status, lead_id, used_at) VALUES (?, ?, ?, ?, ?, 'used', ?, NOW())",
    [companyId, req.user.id, from, via, target, leadId]);

  res.status(201).json({ ok: true, placed: true, lead_id: leadId });
}));

module.exports = router;
