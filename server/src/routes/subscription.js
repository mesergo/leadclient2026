// The signed-in company's own subscription: status for the billing gate, package
// choice + checkout (redirect to the iCount PayPage), and post-payment verification.
const express = require('express');
const config = require('../config');
const { query } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const icount = require('../services/icount');
const billing = require('../services/billing');

const router = express.Router();
router.use(requireAuth);

const PKG_COLS = 'id, name, code, monthly_price, quota_users, quota_numbers, quota_leads, quota_channels';
const latestSub = async (companyId) =>
  (await query('SELECT * FROM subscriptions WHERE company_id = ? ORDER BY id DESC LIMIT 1', [companyId]))[0] || null;
const publicSub = (s) => s && ({
  id: s.id, status: s.status, package_id: s.package_id, monthly_price: s.monthly_price, cc_last4: s.cc_last4,
  trial_ends_at: s.trial_ends_at, next_debit: s.next_debit, last_debit_success: s.last_debit_success,
});

// GET /api/subscription — what the billing gate / setup screen needs
router.get('/', asyncHandler(async (req, res) => {
  const cid = req.user.company_id;
  if (!cid) return res.json({ required: false });
  const c = (await query('SELECT id, name, billing_status, package_id, signup_package_locked, created_at FROM companies WHERE id = ?', [cid]))[0];
  if (!c) return res.json({ required: false });
  const required = c.billing_status === 'pending';
  let packages = [];
  if (required) {
    packages = c.signup_package_locked && c.package_id
      ? await query(`SELECT ${PKG_COLS} FROM packages WHERE id = ?`, [c.package_id])
      : await query(`SELECT ${PKG_COLS} FROM packages WHERE monthly_price > 0 ORDER BY monthly_price, id`);
  }
  const sub = await latestSub(cid);
  res.json({
    required,
    billing_status: c.billing_status,
    can_pay: req.user.role === 'company_admin',
    locked: !!c.signup_package_locked,
    selected_package_id: c.package_id,
    packages,
    trial_days: config.billing.trialDays,
    trial_minute_rate: config.billing.trialMinuteRate,
    trial_ends_at: (sub && sub.trial_ends_at) || billing.addDays(c.created_at, config.billing.trialDays),
    subscription: publicSub(sub),
    mock: icount.isMock(),
  });
}));

// POST /api/subscription/checkout { package_id } -> { url } (the iCount PayPage)
router.post('/checkout', requireRole('company_admin'), asyncHandler(async (req, res) => {
  const cid = req.user.company_id;
  const c = (await query('SELECT id, name, billing_status, package_id, signup_package_locked, created_at FROM companies WHERE id = ?', [cid]))[0];
  if (!c) return res.status(404).json({ error: 'חברה לא נמצאה' });
  if (c.billing_status !== 'pending') return res.status(409).json({ error: 'פרטי החיוב כבר הוגדרו' });
  if (!icount.billingEnabled()) return res.status(503).json({ error: 'הסליקה אינה מוגדרת כרגע' });
  const pkgId = c.signup_package_locked && c.package_id ? c.package_id : Number(req.body && req.body.package_id);
  const pkg = pkgId ? (await query(`SELECT ${PKG_COLS} FROM packages WHERE id = ?`, [pkgId]))[0] : null;
  if (!pkg) return res.status(400).json({ error: 'יש לבחור חבילה' });
  if (!(Number(pkg.monthly_price) > 0)) return res.status(400).json({ error: 'לחבילה זו אין מחיר חודשי' });

  const u = (await query('SELECT email, username, display_name, phone FROM users WHERE id = ?', [req.user.id]))[0] || {};
  const [first, ...rest] = String(u.display_name || '').trim().split(/\s+/);
  const trialStart = new Date(c.created_at);
  // trial ends N days after signup; never in the past (late checkout -> starts tomorrow)
  let trialEnd = billing.addDays(trialStart, config.billing.trialDays);
  if (trialEnd < billing.addDays(new Date(), 1)) trialEnd = billing.addDays(new Date(), 1);

  const ins = await query(
    `INSERT INTO subscriptions (company_id, package_id, monthly_price, status, billing_email, trial_started_at, trial_ends_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
    [cid, pkg.id, pkg.monthly_price, u.email || u.username || null, trialStart, trialEnd]);
  try {
    const sale = await icount.generateSale({
      subId: ins.insertId, pkg, company: c, startDate: billing.ymd(trialEnd),
      customer: { first_name: first || '', last_name: rest.join(' '), email: u.email || u.username, phone: u.phone },
    });
    await query('UPDATE subscriptions SET icount_sale_uniqid = ? WHERE id = ?', [sale.sale_uniqid, ins.insertId]);
    res.json({ url: sale.sale_url, subscription_id: ins.insertId, mock: !!sale.mock });
  } catch (e) {
    await query("UPDATE subscriptions SET status = 'failed' WHERE id = ?", [ins.insertId]);
    res.status(502).json({ error: `יצירת דף התשלום נכשלה: ${e.message}` });
  }
}));

// POST /api/subscription/verify — after returning from the PayPage. The IPN normally
// activates the subscription; if it hasn't arrived (or isn't sent for a deferred
// first debit) look the new standing order up in iCount by the billing email.
router.post('/verify', asyncHandler(async (req, res) => {
  const cid = req.user.company_id;
  const sub = await latestSub(cid);
  if (!sub) return res.json({ status: null });
  if (sub.status === 'pending' && !icount.isMock() && sub.billing_email) {
    try {
      const hks = await icount.findHkByEmail(sub.billing_email);
      const since = new Date(sub.created_at).getTime() - 5 * 60000;
      const hk = hks.find((h) => !h.is_deleted && (!h.ts_created || new Date(h.ts_created).getTime() >= since));
      if (hk) await billing.activateSubscription(sub.id, { hk_id: hk.hk_id, client_id: hk.client_id, cc_last4: hk.cc_last4 });
    } catch (e) { /* fall through: report current status; the IPN may still come */ }
  }
  const fresh = await latestSub(cid);
  res.json({ status: fresh.status, subscription: publicSub(fresh) });
}));

// POST /api/subscription/mock-complete — dev only (no iCount token): simulate a successful PayPage.
router.post('/mock-complete', requireRole('company_admin'), asyncHandler(async (req, res) => {
  if (!icount.isMock() || config.env === 'production') return res.status(404).json({ error: 'לא זמין' });
  const sub = await latestSub(req.user.company_id);
  if (!sub || sub.status !== 'pending') return res.status(409).json({ error: 'אין תשלום ממתין' });
  await billing.activateSubscription(sub.id, { hk_id: null, client_id: null, cc_last4: '4242' });
  res.json({ ok: true });
}));

module.exports = router;
