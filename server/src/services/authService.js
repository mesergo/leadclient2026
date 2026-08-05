const jwt = require('jsonwebtoken');
const config = require('../config');

function issueToken(user, extra = {}) {
  const payload = {
    sub: user.id,
    role: user.role,
    company_id: user.company_id ?? null,
    agency_id: user.agency_id ?? null,
    name: user.display_name || user.username || null,
    ...extra,
  };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: extra.expiresIn || config.jwt.expiresIn });
}

module.exports = { issueToken };
