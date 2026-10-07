// iCount PayPage IPN (server-to-server). Each sale is generated with its own
// ipn_url (?sub=<subscription id>&k=<HMAC>), so the callback is tied to its
// subscription without trusting the payload. First call activates the subscription;
// later ones (recurring debits, if iCount reports them here) are recorded as charges.
const express = require('express');
const config = require('../config');
const { query } = require('../db/pool');
const icount = require('../services/icount');
const billing = require('../services/billing');

const router = express.Router();
router.use(express.urlencoded({ extended: true })); // IPN arrives as POST form data

async function log(req, result, x = {}) {
  try {
    await query(
      `INSERT INTO webhook_log (source, method, path, ip, query_data, body_data, company_id, result, error)
       VALUES ('icount-ipn', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.method, req.originalUrl.slice(0, 255), req.ip,
        JSON.stringify(req.query || {}).slice(0, 8000), JSON.stringify(req.body || {}).slice(0, 8000),
        x.companyId || null, result, x.error ? String(x.error).slice(0, 250) : null]);
  } catch (e) { /* logging is best-effort */ }
}

router.all('/ipn', async (req, res) => {
  const subId = Number(req.query.sub);
  if (!subId || !icount.ipnSigOk(subId, req.query.k)) { await log(req, 'bad_signature'); return res.status(403).send('forbidden'); }
  try {
    const b = { ...(req.query || {}), ...(req.body || {}) };
    const sub = (await query('SELECT * FROM subscriptions WHERE id = ?', [subId]))[0];
    if (!sub) { await log(req, 'no_subscription'); return res.status(404).send('not found'); }
    // the callback must come from our PayPage (when we know its id)
    const expectedPage = config.icount.paypageId || Number(await icount.getSetting('icount_paypage_id')) || null;
    if (expectedPage && b.cp && Number(b.cp) !== expectedPage) { await log(req, 'wrong_paypage', { companyId: sub.company_id }); return res.status(403).send('forbidden'); }

    const wasActive = sub.status === 'active' || sub.status === 'past_due';
    await billing.activateSubscription(subId, { hk_id: b.hk_id, client_id: b.customer_id, cc_last4: b.cc_last4 });
    if (wasActive && Number(b.sum) > 0) {
      // a recurring debit reported on the same IPN URL
      await query(
        `INSERT INTO billing_charges (company_id, subscription_id, kind, amount, status, icount_ref)
         VALUES (?, ?, 'monthly', ?, 'charged', ?)`,
        [sub.company_id, subId, Number(b.sum), b.docnum ? String(b.docnum) : null]);
      await query("UPDATE subscriptions SET status = 'active', last_debit_success = 1 WHERE id = ?", [subId]);
      await query("UPDATE companies SET billing_status = 'active' WHERE id = ? AND billing_status = 'past_due'", [sub.company_id]);
    }
    await log(req, wasActive ? 'charge_recorded' : 'activated', { companyId: sub.company_id });
    res.send('OK');
  } catch (e) {
    await log(req, 'error', { error: e.message });
    res.status(500).send('error');
  }
});

module.exports = router;
