const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query, companyScope, getPool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { upload, fileUrl } = require('../services/uploads');
const icount = require('../services/icount');
const billing = require('../services/billing');

const router = express.Router();
router.use(requireAuth);

const FIELDS = `c.id, c.agency_id, c.name, c.logo_url, c.phone, c.fax, c.address, c.zip_code, c.industry,
  c.public_token, c.contacts_access, c.is_donation_center, c.payment_package, c.is_active, c.created_at,
  c.returning_sms_enabled, c.returning_sms_from, c.returning_sms_text, c.leads_distribution_enabled,
  c.is_trial, c.package_id, c.quota_users, c.quota_numbers, c.quota_leads, c.quota_channels`;

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'c.id');
  const rows = await query(
    `SELECT ${FIELDS}, a.name AS agency_name, COUNT(DISTINCT sv.id) AS services_count
     FROM companies c
     LEFT JOIN agencies a ON a.id = c.agency_id
     LEFT JOIN services sv ON sv.company_id = c.id
     WHERE (${s.sql})
     GROUP BY c.id ORDER BY c.created_at DESC`,
    s.params
  );
  res.json({ companies: rows });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'c.id');
  const rows = await query(
    `SELECT ${FIELDS}, a.name AS agency_name FROM companies c
     LEFT JOIN agencies a ON a.id = c.agency_id
     WHERE c.id = ? AND (${s.sql})`,
    [req.params.id, ...s.params]
  );
  if (!rows[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  res.json({ company: rows[0] });
}));

router.post('/', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const { name, agency_id } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'חסר שם חברה' });
  if (req.user.role === 'agency_admin' && String(agency_id) !== String(req.user.agency_id)) {
    return res.status(403).json({ error: 'ניתן ליצור חברה רק תחת הסוכנות שלך' });
  }
  const token = require('crypto').randomUUID();
  const r = await query('INSERT INTO companies (name, agency_id, public_token, created_at) VALUES (?, ?, ?, NOW())',
    [name.trim(), agency_id || null, token]);
  await query(
    `INSERT INTO lead_statuses (company_id, text, color, sort_order, is_waiting, is_finished) VALUES
     (?, 'חדש', '#4f46e5', 1, 1, 0), (?, 'טופל', '#16a34a', 2, 0, 1), (?, 'בוטל', '#dc2626', 3, 0, 1)`,
    [r.insertId, r.insertId, r.insertId]);
  const rows = await query(`SELECT ${FIELDS} FROM companies c WHERE c.id = ?`, [r.insertId]);
  res.status(201).json({ company: rows[0] });
}));

const EDITABLE = ['name', 'phone', 'fax', 'address', 'zip_code', 'industry', 'is_active',
  'contacts_access', 'is_donation_center', 'payment_package',
  'returning_sms_enabled', 'returning_sms_from', 'returning_sms_text', 'leads_distribution_enabled',
  'quota_users', 'quota_numbers', 'quota_leads', 'quota_channels', 'package_id'];

// Usage vs quota for a company (anyone who can see the company). Read-only.
router.get('/:id/usage', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'id');
  const owned = await query(
    `SELECT id, quota_users, quota_numbers, quota_leads, quota_channels FROM companies WHERE id = ? AND (${s.sql})`,
    [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const id = owned[0].id;
  const one = async (sql) => (await query(sql, [id]))[0].c;
  const usage = {
    users: await one('SELECT COUNT(*) c FROM users WHERE company_id = ? AND is_active = 1'),
    numbers: await one('SELECT COUNT(*) c FROM phone_numbers WHERE company_id = ?'),
    leads: await one('SELECT COUNT(*) c FROM leads WHERE company_id = ?'),
    channels: await one('SELECT COUNT(*) c FROM services WHERE company_id = ?'),
  };
  res.json({
    usage,
    quota: { users: owned[0].quota_users, numbers: owned[0].quota_numbers, leads: owned[0].quota_leads, channels: owned[0].quota_channels },
  });
}));

router.patch('/:id', requireRole('super_admin', 'agency_admin', 'company_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'id');
  const owned = await query(`SELECT id FROM companies WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const isManager = req.user.role === 'super_admin' || req.user.role === 'agency_admin';
  const sets = [], params = [];
  for (const f of EDITABLE) {
    if (req.body[f] === undefined) continue;
    if (f.startsWith('quota_') || f === 'package_id') {
      if (!isManager) continue;                       // only managers set quotas / package (not the customer)
      const v = req.body[f];
      sets.push(`${f} = ?`); params.push(v === '' || v == null ? null : Number(v)); // empty = unlimited / no package
    } else { sets.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (sets.length) { params.push(req.params.id); await query(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, params); }
  const rows = await query(`SELECT ${FIELDS} FROM companies c WHERE c.id = ?`, [req.params.id]);
  res.json({ company: rows[0] });
}));

// Permanently delete a company. Releases its virtual numbers back to the pool,
// removes its users/invites/callbacks, and relies on FK CASCADE for the rest
// (services, leads, statuses, tags, contacts, files, reports). super_admin only.
router.delete('/:id', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const id = req.params.id;
  const rows = await query('SELECT id FROM companies WHERE id = ?', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const userRows = await query('SELECT id FROM users WHERE company_id = ?', [id]);
  const userIds = userRows.map((u) => u.id);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE phone_numbers SET company_id = NULL, service_id = NULL, redirect_to_number = NULL, redirect_config = NULL WHERE company_id = ?', [id]);
    await conn.execute('DELETE FROM employee_invites WHERE company_id = ?', [id]);
    await conn.execute('DELETE FROM callbacks WHERE company_id = ?', [id]);
    await conn.execute('DELETE FROM companies WHERE id = ?', [id]); // cascades services/leads/statuses/tags/contacts/files/reports
    if (userIds.length) await conn.query('DELETE FROM users WHERE id IN (?)', [userIds]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  res.json({ ok: true });
}));

router.post('/:id/logo', requireRole('super_admin', 'agency_admin', 'company_admin'), upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'חסר קובץ' });
  const s = companyScope(req.user, 'id');
  const owned = await query(`SELECT id FROM companies WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const url = fileUrl(req.file.filename);
  await query('UPDATE companies SET logo_url = ? WHERE id = ?', [url, req.params.id]);
  res.json({ company: { id: Number(req.params.id), logo_url: url } });
}));

router.post('/:id/impersonate', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'id');
  const owned = await query(`SELECT id FROM companies WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const admins = await query(
    `SELECT id, role, company_id, agency_id, display_name, username FROM users
     WHERE company_id = ? AND role = 'company_admin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1`,
    [req.params.id]);
  if (!admins[0]) return res.status(404).json({ error: 'אין מנהל פעיל בחברה זו' });
  const t = admins[0];
  const token = jwt.sign(
    { sub: t.id, role: t.role, company_id: t.company_id, agency_id: t.agency_id, name: t.display_name || t.username, impersonated_by: req.user.id },
    config.jwt.secret, { expiresIn: '1h' });
  res.json({ token, user: { id: t.id, name: t.display_name || t.username, role: t.role } });
}));

// --- billing (managers): subscription state + admin-sent billing links ---------
async function scopedCompany(req) {
  const s = companyScope(req.user, 'c.id');
  const r = await query(
    `SELECT c.id, c.name, c.billing_status, c.package_id, c.is_trial FROM companies c WHERE c.id = ? AND (${s.sql})`,
    [req.params.id, ...s.params]);
  return r[0] || null;
}
const companyAdminContact = async (companyId) => (await query(
  "SELECT email, username, phone FROM users WHERE company_id = ? AND role = 'company_admin' AND is_active = 1 ORDER BY id LIMIT 1",
  [companyId]))[0] || {};

// GET /api/companies/:id/billing
router.get('/:id/billing', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const c = await scopedCompany(req);
  if (!c) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const subs = await query(
    `SELECT s.*, p.name AS package_name FROM subscriptions s LEFT JOIN packages p ON p.id = s.package_id
      WHERE s.company_id = ? ORDER BY s.id DESC LIMIT 20`, [c.id]);
  const current = subs.find((s) => s.status === 'active' || s.status === 'past_due') || null;
  const link = subs.find((s) => s.status === 'pending' && s.source === 'admin_link' && s.link_token
    && new Date(s.link_expires_at) > new Date()) || null;
  const admin = await companyAdminContact(c.id);
  res.json({
    billing_status: c.billing_status, is_trial: !!c.is_trial,
    enabled: icount.billingEnabled(), mock: icount.isMock(),
    subscription: current && {
      id: current.id, status: current.status, source: current.source, package_id: current.package_id,
      package_name: current.package_name, monthly_price: current.monthly_price, cc_last4: current.cc_last4,
      next_debit: current.next_debit, last_debit_success: current.last_debit_success, activated_at: current.activated_at,
    },
    link: link && {
      path: `/pay/${link.link_token}`, package_name: link.package_name, monthly_price: link.monthly_price,
      start_date: link.start_date, expires_at: link.link_expires_at, created_at: link.created_at, billing_email: link.billing_email,
    },
    defaults: { email: admin.email || admin.username || '', phone: admin.phone || '', package_id: c.package_id },
  });
}));

// GET /api/companies/:id/billing/live — the standing order's health straight from
// iCount (refreshes our record too) + the charges we recorded
router.get('/:id/billing/live', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const c = await scopedCompany(req);
  if (!c) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const sub = (await query(
    "SELECT * FROM subscriptions WHERE company_id = ? AND status IN ('active', 'past_due') ORDER BY id DESC LIMIT 1", [c.id]))[0];
  const charges = await query(
    `SELECT kind, minutes, amount, status, icount_ref, error, created_at FROM billing_charges
      WHERE company_id = ? ORDER BY id DESC LIMIT 20`, [c.id]);
  if (!sub) return res.json({ live: null, charges });
  try {
    res.json({ live: await billing.liveStatus(sub), charges });
  } catch (e) {
    res.json({ live: { state: 'error', error: e.message }, charges });
  }
}));

// POST /api/companies/:id/billing-link { package_id, start_date?, email?, phone? }
// Creates a public /pay/<token> page (valid 30 days) the manager sends to the customer.
// No trial: the standing order's first debit is on start_date (default today).
router.post('/:id/billing-link', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const c = await scopedCompany(req);
  if (!c) return res.status(404).json({ error: 'חברה לא נמצאה' });
  if (!icount.billingEnabled()) return res.status(503).json({ error: 'הסליקה אינה מוגדרת כרגע' });
  const active = await query("SELECT id FROM subscriptions WHERE company_id = ? AND status IN ('active', 'past_due') LIMIT 1", [c.id]);
  if (active[0]) return res.status(409).json({ error: 'לחברה כבר יש מנוי פעיל' });
  const b = req.body || {};
  const pkg = (await query('SELECT id, name, monthly_price FROM packages WHERE id = ?', [Number(b.package_id) || 0]))[0];
  if (!pkg) return res.status(400).json({ error: 'יש לבחור חבילה' });
  if (!(Number(pkg.monthly_price) > 0)) return res.status(400).json({ error: 'לחבילה זו אין מחיר חודשי' });
  const today = billing.ymd(new Date());
  const start = b.start_date ? String(b.start_date).slice(0, 10) : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start < today) return res.status(400).json({ error: 'תאריך התחלה לא תקין' });
  const admin = await companyAdminContact(c.id);
  const email = String(b.email || admin.email || admin.username || '').trim() || null;
  const phone = String(b.phone || admin.phone || '').trim() || null;

  // one open link per company: a new one supersedes the previous
  await query("UPDATE subscriptions SET status = 'abandoned' WHERE company_id = ? AND status = 'pending' AND source = 'admin_link'", [c.id]);
  const tok = crypto.randomBytes(20).toString('hex');
  await query(
    `INSERT INTO subscriptions (company_id, package_id, monthly_price, status, source, billing_email, billing_phone,
       start_date, link_token, link_expires_at, trial_usage_charged)
     VALUES (?, ?, ?, 'pending', 'admin_link', ?, ?, ?, ?, NOW() + INTERVAL 30 DAY, 1)`,
    [c.id, pkg.id, pkg.monthly_price, email, phone, start, tok]);
  res.status(201).json({ path: `/pay/${tok}` });
}));

// DELETE /api/companies/:id/billing-link — revoke the open link
router.delete('/:id/billing-link', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const c = await scopedCompany(req);
  if (!c) return res.status(404).json({ error: 'חברה לא נמצאה' });
  await query("UPDATE subscriptions SET status = 'abandoned' WHERE company_id = ? AND status = 'pending' AND source = 'admin_link'", [c.id]);
  res.json({ ok: true });
}));

module.exports = router;
