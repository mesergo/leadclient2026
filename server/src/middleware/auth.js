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
    // sales_manager is a read-only role: block every write except the auth/OTP
    // flows it needs to sign in and pass the phone-verify gate.
    if (req.user.role === 'sales_manager' && req.method !== 'GET' && req.baseUrl !== '/api/auth') {
      return res.status(403).json({ error: 'למנהל מכירות הרשאת צפייה בלבד' });
    }
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

// Marks req.user.ownLeadsOnly for an agent a manager limited to the leads assigned
// to them (users.restrict_own_leads). Read per request, so a change applies at once.
// Use after requireAuth on every router that reads leads; see leadScope() in db/scope.js.
async function loadLeadRestriction(req, res, next) {
  if (req.user && req.user.role === 'company_user') {
    try {
      const { query } = require('../db/pool');
      const r = await query('SELECT restrict_own_leads FROM users WHERE id = ?', [req.user.id]);
      req.user.ownLeadsOnly = !!(r[0] && Number(r[0].restrict_own_leads));
    } catch (e) {
      return res.status(500).json({ error: 'שגיאת שרת' }); // fail closed: never show leads unscoped
    }
  }
  next();
}

module.exports = { requireAuth, requireRole, loadLeadRestriction };
