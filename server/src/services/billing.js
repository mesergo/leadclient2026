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
    // any other half-finished checkout of this company is now moot
    await query("UPDATE subscriptions SET status = 'abandoned' WHERE company_id = ? AND id <> ? AND status = 'pending'", [s.company_id, subId]);
  }
  return (await query('SELECT * FROM subscriptions WHERE id = ?', [subId]))[0];
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
  if (icount.isMock() || !sub.icount_hk_id) return null;
  const r = await icount.hkInfo(sub.icount_hk_id);
  const h = r.hk_info || {};
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

module.exports = { activateSubscription, callMinutes, chargeTrialUsage, syncSubscription, ymd, addDays };
