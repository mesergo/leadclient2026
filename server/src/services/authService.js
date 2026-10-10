const jwt = require('jsonwebtoken');
const config = require('../config');

// extra = additional JWT claims; opts.expiresIn overrides the session lifetime.
function issueToken(user, extra = {}, opts = {}) {
  const payload = {
    sub: user.id,
    role: user.role,
    company_id: user.company_id ?? null,
    agency_id: user.agency_id ?? null,
    name: user.display_name || user.username || null,
    ...extra,
  };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: opts.expiresIn || config.jwt.expiresIn });
}

// Session lifetime from the login request body: the mobile app gets a long token,
// "remember me" gets 30 days, everything else the regular (short) session.
function sessionTtl(body = {}) {
  if (body.client === 'mobile') return config.jwt.mobileExpiresIn;
  if (body.remember === true || body.remember === 'true' || body.remember === 1) return config.jwt.rememberExpiresIn;
  return config.jwt.expiresIn;
}

module.exports = { issueToken, sessionTtl };
