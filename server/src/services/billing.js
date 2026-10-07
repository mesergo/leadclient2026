// Subscription lifecycle on top of iCount standing orders:
// pending (signed up, must fill billing) -> active (card on file, trial running / billed
// monthly) -> past_due (last monthly debit failed) | cancelled.
// During the trial, answered call minutes are charged once at trial end
// (config.billing.trialMinuteRate per started minute, incl. VAT).
const config = require('../config');
const { query } = require('../db/pool');
const icount = require('./icount');

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);

// Mark a subscription active, apply its package to the company and lift the billing
// gate. Idempotent (a repeated IPN / verify just refreshes the iCount ids).
async function activateSubscription(subId, info = {}) {
  const s = (await query('SELECT * FROM subscriptions WHERE id = ?', [subId]))[0];
  if (!s) return null;
  await query(
    `UPDATE subscriptions SET status = 'active',
       icount_hk_id = COALESCE(?, icount_hk_id), icount_client_id = COALESCE(?, icount_client_id),
       cc_last4 = COALESCE(?, cc_last4), activated_at = COALESCE(activated_at, NOW())
     WHERE id = ?`,
    [info.hk_id || null, info.client_id || null, info.cc_last4 || null, subId]);
  if (s.status !== 'active') {
    const p = s.package_id ? (await query('SELECT id, quota_users, quota_numbers, quota_leads, quota_channels FROM packages WHERE id = ?', [s.package_id]))[0] : null;
    if (p) {
      await query(
        `UPDATE companies SET billing_status = 'active', package_id = ?, quota_users = ?, quota_numbers = ?,
           quota_leads = ?, quota_channels = ? WHERE id = ?`,
        [p.id, p.quota_users, p.quota_numbers, p.quota_leads, p.quota_channels, s.company_id]);
    } else {
      await query("UPDATE companies SET billing_status = 'active' WHERE id = ?", [s.company_id]);
    }
    // an admin-sent billing link turns an existing company into a paying one
    if (s.source === 'admin_link') await query('UPDATE companies SET is_trial = 0 WHERE id = ?', [s.company_id]);
    // any other half-finished checkout of this company is now moot
    await query("UPDATE subscriptions SET status = 'abandoned' WHERE company_id = ? AND id <> ? AND status = 'pending'", [s.company_id, subId]);
  }
  return (await query('SELECT * FROM subscriptions WHERE id = ?', [subId]))[0];
}

// After the customer returns from the PayPage: the IPN normally activates the
// subscription; if it hasn't arrived (or isn't sent for a deferred first debit),
// look the new standing order up in iCount by the billing email.
async function verifyPendingByEmail(sub) {
  if (!sub || sub.status !== 'pending' || icount.isMock() || !sub.billing_email) return sub;
  try {
    const hks = await icount.findHkByEmail(sub.billing_email);
    const since = new Date(sub.created_at).getTime() - 5 * 60000;
    const hk = hks.find((h) => !h.is_deleted && (!h.ts_created || new Date(h.ts_created).getTime() >= since));
    if (hk) return activateSubscription(sub.id, { hk_id: hk.hk_id, client_id: hk.client_id, cc_last4: hk.cc_last4 });
  } catch (e) { /* the IPN may still come */ }
  return sub;
}

// Answered call minutes (each call rounded up to a whole minute) in [from, to).
async function callMinutes(companyId, from, to) {
  const r = await query(
    `SELECT COALESCE(SUM(CEIL(call_duration_sec / 60)), 0) AS m FROM leads
      WHERE company_id = ? AND lead_through IN ('call', 'call_out') AND call_status = 'answered'
        AND call_duration_sec > 0 AND created_at >= ? AND created_at < ?`,
    [companyId, from, to]);
  return Number(r[0].m) || 0;
}

// Charge the trial's call minutes once the trial is over (one-time payment on the
// customer's standing-order card). Marks the subscription so it never charges twice.
async function chargeTrialUsage(sub) {
  const from = sub.trial_started_at, to = sub.trial_ends_at;
  const minutes = await callMinutes(sub.company_id, from, to);
  const amount = Math.round(minutes * config.billing.trialMinuteRate * 100) / 100;
  // claim it first, so a crash/retry can never bill the same trial twice
  const claim = await query('UPDATE subscriptions SET trial_usage_charged = 1 WHERE id = ? AND trial_usage_charged = 0', [sub.id]);
  if (!claim.affectedRows) return null;
  const ins = await query(
    `INSERT INTO billing_charges (company_id, subscription_id, kind, minutes, amount, period_start, period_end, status)
     VALUES (?, ?, 'trial_usage', ?, ?, ?, ?, ?)`,
    [sub.company_id, sub.id, minutes, amount, from, to, amount > 0 ? 'pending' : 'none']);
  if (amount <= 0) return { minutes, amount, status: 'none' };
  if (icount.isMock() || !sub.icount_hk_id) {
    await query("UPDATE billing_charges SET status = ? WHERE id = ?", [icount.isMock() ? 'mock' : 'failed', ins.insertId]);
    return { minutes, amount, status: icount.isMock() ? 'mock' : 'failed' };
  }
  try {
    const r = await icount.hkAddOneTimePayment(sub.icount_hk_id, amount, `שיחות בתקופת הניסיון: ${minutes} דק׳ × ₪${config.billing.trialMinuteRate}`);
    await query("UPDATE billing_charges SET status = 'charged', icount_ref = ? WHERE id = ?", [r.hk_id ? String(r.hk_id) : null, ins.insertId]);
    return { minutes, amount, status: 'charged' };
  } catch (e) {
    await query("UPDATE billing_charges SET status = 'failed', error = ? WHERE id = ?", [String(e.message).slice(0, 250), ins.insertId]);
    return { minutes, amount, status: 'failed', error: e.message };
  }
}

// Pull the standing order's state from iCount: a failed last debit -> past_due,
// recovered -> active, deleted -> cancelled.
async function syncSubscription(sub) {
  if (icount.isMock()) return null;
  const hkId = await ensureHkId(sub);
  if (!hkId) return null;
  const r = await icount.hkInfo(hkId);
  return applyHkInfo({ ...sub, icount_hk_id: hkId }, r.hk_info || {});
}

// Store what iCount says about the standing order on our subscription + company.
async function applyHkInfo(sub, h) {
  let status = sub.status;
  if (h.is_deleted) status = 'cancelled';
  else if (h.last_debit_success === false && h.last_debit) status = 'past_due';
  else if (h.last_debit_success === true || !h.last_debit) status = 'active';
  await query(
    `UPDATE subscriptions SET status = ?, last_sync_at = NOW(), last_debit_success = ?, next_debit = ?,
       cc_last4 = COALESCE(?, cc_last4), cancelled_at = IF(? = 'cancelled', COALESCE(cancelled_at, NOW()), cancelled_at)
     WHERE id = ?`,
    [status, h.last_debit_success == null ? null : (h.last_debit_success ? 1 : 0), h.next_debit || null, h.cc_last4 || null, status, sub.id]);
  if (status !== sub.status) await query('UPDATE companies SET billing_status = ? WHERE id = ?', [status, sub.company_id]);
  return status;
}

// The subscription's iCount standing-order id; if the IPN didn't carry it, find
// the profile by the billing email and remember it.
async function ensureHkId(sub) {
  if (sub.icount_hk_id) return sub.icount_hk_id;
  if (icount.isMock() || !sub.billing_email) return null;
  const hks = await icount.findHkByEmail(sub.billing_email);
  const since = new Date(sub.created_at).getTime() - 5 * 60000;
  const hk = hks.find((h) => !h.is_deleted && (!h.ts_created || new Date(h.ts_created).getTime() >= since));
  if (!hk) return null;
  await query('UPDATE subscriptions SET icount_hk_id = ?, cc_last4 = COALESCE(?, cc_last4) WHERE id = ?', [hk.hk_id, hk.cc_last4 || null, sub.id]);
  return hk.hk_id;
}

const itemsTotal = (items) => (Array.isArray(items) ? items : []).reduce((t, i) =>
  t + Number(i.unitprice_incvat ?? i.unitprice ?? 0) * Number(i.quantity ?? 1), 0);

// Live health of the standing order, straight from iCount (hk/info + transactions).
// state: ok | failing | paused | cancelled | finished | not_found
async function liveStatus(sub) {
  if (icount.isMock()) {
    return {
      mock: true, state: 'ok', hk_id: sub.icount_hk_id, start_date: sub.start_date || sub.trial_ends_at || sub.activated_at,
      next_debit: sub.next_debit, cc_last4: sub.cc_last4, amount: Number(sub.monthly_price), transactions: [],
    };
  }
  const hkId = await ensureHkId(sub);
  if (!hkId) return { state: 'not_found' };
  const r = await icount.hkInfo(hkId, { get_transactions: true });
  const h = r.hk_info || {};
  await applyHkInfo({ ...sub, icount_hk_id: hkId }, h);
  let state = 'ok';
  if (h.is_deleted) state = 'cancelled';
  else if (h.is_finished) state = 'finished';
  else if (h.is_paused) state = 'paused';
  else if (h.last_debit_success === false && h.last_debit) state = 'failing';
  const txs = Array.isArray(r.hk_transactions) ? r.hk_transactions : [];
  const last = h.last_transaction || txs[txs.length - 1] || null;
  return {
    state, hk_id: hkId,
    start_date: h.start_date || null, next_debit: h.next_debit || null,
    last_debit: h.last_debit || null, last_debit_success: h.last_debit_success ?? null,
    last_error: last && last.debit_status === 'FAILURE' ? (last.more_info || null) : null,
    payments_done: h.last_success_num ?? null,
    cc_type: h.cc_type || null, cc_last4: h.cc_last4 || sub.cc_last4 || null, cc_expires: h.cc_expires || null,
    amount: itemsTotal(h.items) || Number(sub.monthly_price) || null,
    transactions: txs.slice(-8).reverse().map((t) => ({
      date: t.debit_date, sum: t.debit_sum, status: t.debit_status, info: t.more_info || null, docnum: t.docnum || null,
    })),
  };
}

module.exports = { activateSubscription, verifyPendingByEmail, callMinutes, chargeTrialUsage, syncSubscription, liveStatus, ymd, addDays };
