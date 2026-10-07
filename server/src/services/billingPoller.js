// In-process billing jobs:
//  - when a trial ends, charge its answered call minutes once (one-time payment on
//    the standing-order card);
//  - every few hours, sync each active standing order's state from iCount
//    (failed debit -> past_due, deleted -> cancelled).
const { query } = require('../db/pool');
const billing = require('./billing');

async function tick() {
  try {
    const ended = await query(
      `SELECT * FROM subscriptions WHERE status IN ('active', 'past_due') AND trial_usage_charged = 0
         AND trial_ends_at IS NOT NULL AND trial_ends_at <= NOW() ORDER BY id LIMIT 50`);
    for (const s of ended) {
      const r = await billing.chargeTrialUsage(s);
      if (r) console.log(`[billingPoller] trial usage sub#${s.id}: ${r.minutes} min, ₪${r.amount} -> ${r.status}`);
    }
    const stale = await query(
      `SELECT * FROM subscriptions WHERE status IN ('active', 'past_due') AND icount_hk_id IS NOT NULL
         AND (last_sync_at IS NULL OR last_sync_at < NOW() - INTERVAL 6 HOUR) ORDER BY id LIMIT 50`);
    for (const s of stale) {
      try { await billing.syncSubscription(s); } catch (e) { console.warn('[billingPoller] sync', s.id, e.message); }
    }
  } catch (e) { console.warn('[billingPoller]', e.message); }
}

let timer = null;
function start(intervalMs = 15 * 60000) {
  if (timer) return;
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  setTimeout(tick, 30000).unref?.();
  console.log(`[billingPoller] started (every ${Math.round(intervalMs / 60000)}m)`);
}

module.exports = { start, tick };
