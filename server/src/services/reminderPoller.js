// Lightweight in-process poller: fires 'reminder_due' notifications for
// reminders whose time has arrived. Marks each notified so it fires once.
const { query } = require('../db/pool');
const notify = require('./notify');

async function tick() {
  try {
    const due = await query(
      `SELECT r.id, r.user_id, r.comment, r.lead_id, l.lead_name, l.lead_phone
       FROM reminders r JOIN leads l ON l.id = r.lead_id
       WHERE r.notified = 0 AND r.reminder_at <= NOW() AND r.user_id IS NOT NULL
       ORDER BY r.reminder_at ASC LIMIT 100`);
    for (const r of due) {
      await notify.notifyUser({
        userId: r.user_id, event: 'reminder_due', title: 'תזכורת',
        body: r.comment || `תזכורת לליד ${r.lead_name || r.lead_phone}`, leadId: r.lead_id,
      });
      await query('UPDATE reminders SET notified = 1 WHERE id = ?', [r.id]);
    }
  } catch (e) { console.warn('[reminderPoller]', e.message); }
}

let timer = null;
function start(intervalMs = 60000) {
  if (timer) return;
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  console.log(`[reminderPoller] started (every ${Math.round(intervalMs / 1000)}s)`);
}

module.exports = { start, tick };
