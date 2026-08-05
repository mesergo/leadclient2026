const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'לא מחובר' });
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.sub,
      role: payload.role,
      company_id: payload.company_id ?? null,
      agency_id: payload.agency_id ?? null,
      name: payload.name || null,
      impersonated_by: payload.impersonated_by || null,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'טוקן לא תקין' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
