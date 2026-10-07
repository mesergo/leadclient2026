// Public billing link (/pay/<token>) a manager sends to a customer. No login: the
// unguessable token is the authorization. Each checkout generates a fresh iCount
// sale (their sale URLs expire after 2 hours); the IPN / email lookup activates it.
const express = require('express');
const config = require('../config');
const { query } = require('../db/pool');
const icount = require('../services/icount');
const billing = require('../services/billing');

const router = express.Router();

async function loadLink(token) {
  if (!/^[a-f0-9]{40}$/.test(String(token || ''))) return null;
  const r = await query(
    `SELECT s.*, c.name AS company_name, p.name AS package_name
       FROM subscriptions s JOIN companies c ON c.id = s.company_id LEFT JOIN packages p ON p.id = s.package_id
      WHERE s.link_token = ? AND s.source = 'admin_link' LIMIT 1`, [token]);
  return r[0] || null;
}
const expired = (s) => s.status === 'pending' && s.link_expires_at && new Date(s.link_expires_at) <= new Date();
const view = (s) => ({
  company_name: s.company_name,
  package: { name: s.package_name, monthly_price: s.monthly_price },
  start_date: s.start_date,
  status: expired(s) ? 'expired' : s.status, // pending | active | past_due | cancelled | abandoned | expired
  mock: icount.isMock(),
});

router.get('/:token', async (req, res, next) => {
  try {
    const s = await loadLink(req.params.token);
    if (!s) return res.status(404).json({ error: 'קישור לא תקין' });
    res.json(view(s));
  } catch (e) { next(e); }
});

router.post('/:token/checkout', async (req, res, next) => {
  try {
    const s = await loadLink(req.params.token);
    if (!s) return res.status(404).json({ error: 'קישור לא תקין' });
    if (s.status !== 'pending' || expired(s)) return res.status(409).json({ error: 'הקישור אינו פעיל' });
    if (!icount.billingEnabled()) return res.status(503).json({ error: 'הסליקה אינה מוגדרת כרגע' });
    const today = billing.ymd(new Date());
    const start = s.start_date && billing.ymd(s.start_date) > today ? billing.ymd(s.start_date) : today;
    const sale = await icount.generateSale({
      subId: s.id,
      pkg: { name: s.package_name, monthly_price: s.monthly_price },
      company: { name: s.company_name },
      customer: { email: s.billing_email, phone: s.billing_phone },
      startDate: start,
      returnTo: `/pay/${req.params.token}`,
    });
    await query('UPDATE subscriptions SET icount_sale_uniqid = ? WHERE id = ?', [sale.sale_uniqid, s.id]);
    res.json({ url: sale.sale_url, mock: !!sale.mock });
  } catch (e) {
    res.status(502).json({ error: `יצירת דף התשלום נכשלה: ${e.message}` });
  }
});

// back from the PayPage: activate via email lookup if the IPN hasn't landed yet
router.post('/:token/verify', async (req, res, next) => {
  try {
    const s = await loadLink(req.params.token);
    if (!s) return res.status(404).json({ error: 'קישור לא תקין' });
    await billing.verifyPendingByEmail(s);
    res.json(view(await loadLink(req.params.token)));
  } catch (e) { next(e); }
});

// dev only (no iCount token): simulate a successful PayPage
router.post('/:token/mock-complete', async (req, res, next) => {
  try {
    if (!icount.isMock() || config.env === 'production') return res.status(404).json({ error: 'לא זמין' });
    const s = await loadLink(req.params.token);
    if (!s || s.status !== 'pending' || expired(s)) return res.status(409).json({ error: 'הקישור אינו פעיל' });
    await billing.activateSubscription(s.id, { cc_last4: '4242' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
