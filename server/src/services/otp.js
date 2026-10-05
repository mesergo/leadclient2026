// One-time-password engine. Codes are never stored raw — we keep sha256("<e164>:<code>")
// with an expiry, enforce a resend gap and an attempt cap, and deliver via MesserGO
// (SMS + voice failover; mock when no credentials). Phones are canonicalized to E.164.
const crypto = require('crypto');
const { query } = require('../db/pool');
const config = require('../config');
const messergo = require('./messergo');

let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS otp_codes (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    phone VARCHAR(20) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    consumed TINYINT(1) NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_lookup (phone, purpose, consumed),
    INDEX idx_otp_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ready = true;
}

const hash = (phoneE164, code) => crypto.createHash('sha256').update(`${phoneE164}:${code}`).digest('hex');
const genCode = () => String(crypto.randomInt(0, 10 ** config.otp.length)).padStart(config.otp.length, '0');

// Create & send a code. Returns { ok, mocked, devCode? }. devCode is only ever
// included in mock mode (no MesserGO creds) so a developer can test end-to-end.
async function requestOtp({ phone, purpose = 'login', campaign, smsText, voiceMessage }) {
  await ensureTable();
  const e164 = messergo.toE164(phone);
  if (!e164 || messergo.digits(e164).length < 11) return { ok: false, error: 'bad_phone' };

  // resend throttle: block if a code was sent very recently
  const recent = await query(
    `SELECT created_at FROM otp_codes WHERE phone = ? AND purpose = ?
       AND created_at > (NOW() - INTERVAL ? SECOND) ORDER BY id DESC LIMIT 1`,
    [e164, purpose, config.otp.resendSeconds]);
  if (recent[0]) return { ok: false, error: 'too_soon', retryAfter: config.otp.resendSeconds };

  // invalidate any still-pending codes for this phone+purpose
  await query('UPDATE otp_codes SET consumed = 1 WHERE phone = ? AND purpose = ? AND consumed = 0', [e164, purpose]);

  const code = genCode();
  const ins = await query(
    'INSERT INTO otp_codes (phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, (NOW() + INTERVAL ? MINUTE))',
    [e164, hash(e164, code), purpose, config.otp.ttlMinutes]);

  const sent = await messergo.sendOtp({ phone: e164, code, campaign, smsText, voiceMessage });
  if (!sent.ok) {
    // a code that never went out must not block the next attempt via the resend throttle
    await query('DELETE FROM otp_codes WHERE id = ?', [ins.insertId]);
    return { ok: false, error: sent.error || 'send_failed' };
  }
  const out = { ok: true, mocked: !!sent.mocked };
  if (sent.mocked) out.devCode = code; // mock only
  return out;
}

// Verify a code. Returns { ok } or { ok:false, error }. On success the code is consumed.
async function verifyOtp({ phone, code, purpose = 'login' }) {
  await ensureTable();
  const e164 = messergo.toE164(phone);
  if (!e164 || !code) return { ok: false, error: 'bad_input' };

  const rows = await query(
    `SELECT id, code_hash, attempts, expires_at FROM otp_codes
       WHERE phone = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC LIMIT 1`,
    [e164, purpose]);
  const rec = rows[0];
  if (!rec) return { ok: false, error: 'no_code' };
  if (new Date(rec.expires_at).getTime() < Date.now()) {
    await query('UPDATE otp_codes SET consumed = 1 WHERE id = ?', [rec.id]);
    return { ok: false, error: 'expired' };
  }
  if (rec.attempts >= config.otp.maxAttempts) {
    await query('UPDATE otp_codes SET consumed = 1 WHERE id = ?', [rec.id]);
    return { ok: false, error: 'too_many_attempts' };
  }
  const match = crypto.timingSafeEqual(Buffer.from(rec.code_hash, 'hex'), Buffer.from(hash(e164, String(code)), 'hex'));
  if (!match) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [rec.id]);
    return { ok: false, error: 'wrong_code' };
  }
  await query('UPDATE otp_codes SET consumed = 1 WHERE id = ?', [rec.id]);
  return { ok: true, phone: e164 };
}

module.exports = { requestOtp, verifyOtp, ensureTable };
