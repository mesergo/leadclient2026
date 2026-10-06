const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const messergo = require('../services/messergo');
const config = require('../config');

const router = express.Router();
// allow ?token= so this can be opened directly in the browser for testing
router.use((req, res, next) => { if (!req.headers.authorization && req.query.token) req.headers.authorization = `Bearer ${req.query.token}`; next(); });
router.use(requireAuth, requireRole('super_admin'));

// Send a REAL test OTP (code 123456) and return MesserGO's full response so the
// exact failure reason (StatusId / StatusDescription) is visible. super_admin only.
//   GET /api/messergo/otp-test?phone=05XXXXXXXX&token=<jwt>
router.post('/otp-test', asyncHandler(async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'missing phone (?phone=05XXXXXXXX)' });
  let egressIp = null;
  try { egressIp = (await (await fetch('https://api.ipify.org?format=json')).json()).ip; } catch (e) { egressIp = 'unknown'; }
  const info = {
    egressIp, // the IP MesserGO actually sees — must be whitelisted in the MesserGO account
    configured: messergo.configured(),
    user_set: !!config.messergo.user,
    token_set: !!config.messergo.smsToken,
    sender: config.messergo.sender,
    otpUrl: config.messergo.otpUrl,
    normalized: { e164: messergo.toE164(phone), local: messergo.toLocal(phone) },
    kosher: messergo.isKosher(phone),
    channel: req.query.channel || (messergo.isKosher(phone) ? 'SMS_WITH_VOICE_FAILOVER' : 'SMS'),
  };
  // ?premsg=... overrides the voice PreMessage; ?channel=... forces the channel (for testing)
  const preMessage = req.query.premsg;
  const result = await messergo.sendOtp({ phone, code: '123456', ...(preMessage !== undefined ? { preMessage } : {}), ...(req.query.channel ? { channel: req.query.channel } : {}) });
  res.json({ info: { ...info, preMessageUsed: preMessage !== undefined ? preMessage : config.messergo.voicePreMessage }, result });
}));

// Plain SMS test (isolates the SMS leg from the OTP voice failover). super_admin only.
//   GET /api/messergo/sms-test?phone=05XXXXXXXX&token=<jwt>
router.post('/sms-test', asyncHandler(async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'missing phone (?phone=05XXXXXXXX)' });
  const info = { sender: config.messergo.sender, smsUrl: config.messergo.smsUrl, normalizedLocal: messergo.toLocal(phone) };
  const result = await messergo.sendSms({ phone, text: 'בדיקת SMS מ-LeadClient: 123456' });
  res.json({ info, result });
}));

module.exports = router;
