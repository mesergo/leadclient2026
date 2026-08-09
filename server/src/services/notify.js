// Central notification dispatch. One event -> up to three channels per user,
// gated by each user's preferences (users.notifications JSON):
//   app     -> row in `notifications` (in-app bell)
//   browser -> Web Push (background, works when the app tab is closed)
//   sms     -> integrations.sms.send (currently MOCK — logs, no real send)
// Best-effort: callers fire-and-forget; failures never break the request.
const webpush = require('web-push');
const config = require('../config');
const { query } = require('../db/pool');
const integrations = require('./integrations');

// Event catalog — the customer chooses which of these they want, per channel.
const EVENTS = ['new_lead', 'status_change', 'reminder_due', 'lead_message'];
// Default when a user has no explicit preference for an event.
const DEFAULTS = { app: true, browser: false, sms: false };

let pushReady = false;
if (config.vapid.publicKey && config.vapid.privateKey) {
  try { webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey); pushReady = true; }
  catch (e) { console.warn('[notify] VAPID init failed:', e.message); }
}

function parsePrefs(v) { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return {}; } }
function channelsFor(prefs, event) { return { ...DEFAULTS, ...(prefs[event] || {}) }; }

// Deliver a Web Push to every browser the user has subscribed; prune dead ones.
async function sendPush(userId, payload) {
  if (!pushReady) return;
  const subs = await query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]).catch(() => {});
    }
  }));
}

// Notify a single user across their enabled channels for an event.
async function notifyUser({ userId, event, title, body, leadId = null, companyId = null }) {
  if (!userId) return;
  try {
    const rows = await query('SELECT notifications, phone FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!rows[0]) return;
    const ch = channelsFor(parsePrefs(rows[0].notifications), event);
    const content = title && body ? `${title} — ${body}` : (body || title || '');
    if (ch.app) await query('INSERT INTO notifications (user_id, company_id, lead_id, content) VALUES (?, ?, ?, ?)', [userId, companyId, leadId, content]);
    if (ch.browser) await sendPush(userId, { title: title || 'LeadClient', body: body || content, url: leadId ? `/leads/${leadId}` : '/' });
    if (ch.sms && rows[0].phone) {
      const r = await integrations.sms.send({ to: rows[0].phone, text: content });
      console.log(`[notify sms${r.mocked ? ' MOCK' : ''}] -> ${rows[0].phone}: ${content}`);
    }
  } catch (e) { console.warn('[notify] user', userId, 'failed:', e.message); }
}

// Notify all active users of a company (new_lead / status_change).
async function notifyCompany({ companyId, event, title, body, leadId = null, excludeUserId = null }) {
  if (!companyId) return;
  try {
    const users = await query('SELECT id FROM users WHERE company_id = ? AND is_active = 1', [companyId]);
    await Promise.all(users.filter((u) => u.id !== excludeUserId).map((u) => notifyUser({ userId: u.id, event, title, body, leadId, companyId })));
  } catch (e) { console.warn('[notify] company', companyId, 'failed:', e.message); }
}

module.exports = { notifyUser, notifyCompany, sendPush, EVENTS, DEFAULTS, parsePrefs, channelsFor, isPushReady: () => pushReady };
