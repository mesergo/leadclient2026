// MesserGO OTP delivery — dedicated OTP endpoint with SMS + voice-call failover.
// We generate & verify the code ourselves; MesserGO only delivers it (SMS to
// mobiles, automatic voice call that reads the code to landline/kosher phones).
// Without credentials it runs in MOCK mode: logs the code, pretends success.
const config = require('../config');

// --- phone helpers ---------------------------------------------------------
// Canonical storage form is E.164 (+9725XXXXXXXX). MesserGO wants the local
// Israeli form (0541234567), so we convert on the way out.
function digits(n) { return String(n == null ? '' : n).replace(/\D/g, ''); }

function toE164(n) {
  let d = digits(n);
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);                  // intl dialing prefix (00972…)
  d = d.replace(/^0+/, '0');                               // collapse leading zeros to one
  while (d.startsWith('972972')) d = d.slice(3);           // double country code
  if (d.startsWith('972')) return '+' + d;
  if (d.startsWith('0')) return '+972' + d.slice(1);
  return '+972' + d;
}

function toLocal(n) {
  const d = digits(toE164(n));      // e.g. 9725XXXXXXXX
  if (d.startsWith('972')) return '0' + d.slice(3);
  if (d.startsWith('0')) return d;
  return '0' + d;
}

// Israeli mobile = +9725XXXXXXXX (05x). Others (07x, landline, intl) still work
// via the voice failover, but this lets callers branch if they want to.
function isIsraeliMobile(n) {
  const d = digits(toE164(n));
  return /^9725\d{8}$/.test(d);
}

// Kosher phone number prefixes (local 0XXXXXXXXX form). These lines can't receive
// SMS, so they get voice OTP; every other number is treated as a regular mobile
// (SMS only, never voice). Source: "ועד בני תורה" kosher ranges.
const KOSHER_PREFIXES = [
  '05041', '05271', '05276', '05331', '05341', '05484', '05485',
  '05532', '05552', '05567', '055400', '05541', '05576', '05832',
];
function isKosher(n) {
  const local = toLocal(n);
  if (KOSHER_PREFIXES.some((p) => local.startsWith(p))) return true;
  if (/^0[2-9]80\d/.test(local)) return true; // Bezeq kosher landline (0X) 80X-XXXX
  return false;
}

// --- OTP send --------------------------------------------------------------
function configured() { return !!(config.messergo.user && config.messergo.smsToken); }

async function sendOtp({ phone, code, campaign = 'LeadClient OTP', smsText, voiceMessage, preMessage, channel }) {
  const local = toLocal(phone);
  // the OTP endpoint injects OtpCode into the {OtpCode} placeholder — do NOT inline the code
  const sms = smsText || 'קוד האימות שלך: {OtpCode}';
  const voice = voiceMessage || 'הקוד שלך הוא {OtpCode}';
  // Regular mobile => SMS only (never voice). Kosher/landline => allow voice failover.
  const ch = channel || (isKosher(phone) ? 'SMS_WITH_VOICE_FAILOVER' : 'SMS');

  if (!configured()) {
    console.log(`[messergo MOCK] OTP to ${local} (${ch}): ${code}`);
    return { ok: true, mocked: true, channel: ch };
  }

  const auth = Buffer.from(`${config.messergo.user}:${config.messergo.smsToken}`).toString('base64');
  const data = { Channel: ch, CampaignName: campaign, OtpCode: String(code), Phone: local };
  if (ch === 'SMS' || ch === 'SMS_WITH_VOICE_FAILOVER') {
    data.SMSSettings = { Sender: config.messergo.sender, Message: sms };
  }
  if (ch === 'VOICE' || ch === 'SMS_WITH_VOICE_FAILOVER') {
    const voiceSettings = {
      CallerId: config.messergo.voiceCallerId || 'PRIVATE',
      Language: 'he-female',
      RequireDigitPress: true,
      Digit: '1',
      Message: voice,
    };
    const pre = preMessage !== undefined ? preMessage : config.messergo.voicePreMessage; // caller override wins
    if (pre) voiceSettings.PreMessage = pre; // omit entirely when empty
    data.VoiceSettings = voiceSettings;
  }
  const payload = { Data: data };
  try {
    const r = await fetch(config.messergo.otpUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
    // MesserGO returns HTTP 200 even on failure — success is StatusId === 1.
    const statusId = json.StatusId != null ? json.StatusId : (json.Data && json.Data.StatusId);
    if (Number(statusId) === 1) return { ok: true, mocked: false, statusId, channel: ch };
    const reason = json.StatusDescription || json.Message || (json.Data && json.Data.StatusDescription) || 'send_failed';
    console.error(`[messergo] OTP send failed to ${local} (${ch}): statusId=${statusId} reason="${reason}" http=${r.status}`);
    return { ok: false, mocked: false, statusId, error: reason, channel: ch, json };
  } catch (e) {
    console.error('[messergo] OTP send error:', e.message);
    return { ok: false, mocked: false, error: e.message };
  }
}

// Plain SMS send (not OTP) — for diagnostics and general notifications.
async function sendSms({ phone, text }) {
  const local = toLocal(phone);
  if (!configured()) { console.log(`[messergo MOCK] SMS to ${local}: ${text}`); return { ok: true, mocked: true }; }
  const auth = Buffer.from(`${config.messergo.user}:${config.messergo.smsToken}`).toString('base64');
  const payload = { Data: { Message: text, Recipients: [{ Phone: local }], Settings: { Sender: config.messergo.sender } } };
  try {
    const r = await fetch(config.messergo.smsUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const t = await r.text();
    let json; try { json = JSON.parse(t); } catch { json = { raw: t.slice(0, 500) }; }
    const statusId = json.StatusId != null ? json.StatusId : (json.Data && json.Data.StatusId);
    if (Number(statusId) === 1) return { ok: true, mocked: false, statusId };
    const reason = json.StatusDescription || json.Message || 'send_failed';
    console.error(`[messergo] SMS send failed to ${local}: statusId=${statusId} reason="${reason}"`);
    return { ok: false, mocked: false, statusId, error: reason, json };
  } catch (e) {
    console.error('[messergo] SMS send error:', e.message);
    return { ok: false, mocked: false, error: e.message };
  }
}

module.exports = { sendOtp, sendSms, toE164, toLocal, isIsraeliMobile, isKosher, digits, configured };
