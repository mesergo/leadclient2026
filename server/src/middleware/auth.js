const jwt = require('jsonwebtoken');
const config = require('../config');

// The token proves WHO the user is; their role / company / agency are read from the DB
// (cached briefly), so assigning a user to a company or changing a role applies without
// signing in again, and a deactivated user is locked out at once.
const USER_TTL_MS = 30 * 1000;
const COMPANY_ROLES = ['company_admin', 'company_user', 'sales_manager', 'translator'];
const userCache = new Map(); // id -> { at, row }
async function currentUser(id) {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.row;
  const { query } = require('../db/pool');
  const row = (await query(
    'SELECT role, company_id, agency_id, is_active, phone_verified_at, must_change_password, UNIX_TIMESTAMP(password_changed_at) AS pwd_changed_ts FROM users WHERE id = ?',
    [id]).catch((e) => (e.code === 'ER_BAD_FIELD_ERROR' // column not migrated yet
    ? query('SELECT role, company_id, agency_id, is_active, phone_verified_at, must_change_password FROM users WHERE id = ?', [id]) : Promise.reject(e))))[0] || null;
  if (row && COMPANY_ROLES.includes(row.role)) {
    // every company the user works in: the primary one + extra memberships (each with its role)
    const extra = await query('SELECT company_id, role FROM user_companies WHERE user_id = ? ORDER BY id', [id]).catch(() => []);
    row.companies = [
      ...(row.company_id ? [{ id: Number(row.company_id), role: row.role }] : []),
      ...extra.filter((m) => Number(m.company_id) !== Number(row.company_id)).map((m) => ({ id: Number(m.company_id), role: m.role })),
    ];
  }
  userCache.set(id, { at: Date.now(), row });
  if (userCache.size > 5000) userCache.clear();
  return row;
}

const TRANSLATOR_OK = ['/api/auth', '/api/profile', '/api/language', '/api/notifications'];

// what a user who has not yet passed the entry gates may still call
const gateOpen = (req) => req.baseUrl === '/api/auth'
  || (req.baseUrl === '/api/profile' && req.path === '/password')
  || (req.baseUrl === '/api/language' && req.method === 'GET');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'לא מחובר' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    return res.status(401).json({ error: 'טוקן לא תקין' });
  }
  req.user = {
    id: payload.sub,
    role: payload.role,
    company_id: payload.company_id ?? null,
    agency_id: payload.agency_id ?? null,
    name: payload.name || null,
    impersonated_by: payload.impersonated_by || null,
    exp: payload.exp || null, // session end (seconds), e.g. to re-issue with the same lifetime
  };
  try {
    const row = await currentUser(payload.sub);
    if (!row) return res.status(401).json({ error: 'המשתמש לא נמצא' });
    if (!Number(row.is_active)) return res.status(401).json({ error: 'המשתמש אינו פעיל' });
    // a password change ends every session issued before it (on any device)
    if (row.pwd_changed_ts && Number(payload.iat) < Math.floor(Number(row.pwd_changed_ts))) {
      return res.status(401).json({ error: 'הסיסמה הוחלפה, יש להתחבר מחדש' });
    }
    req.user.role = row.role;
    req.user.company_id = row.company_id ?? null;
    req.user.agency_id = row.agency_id ?? null;
    // several companies: the client chooses one (X-Company: <id>) or all of them (X-Company: all);
    // only companies the user really belongs to count — anything else falls back to the primary
    if (row.companies && row.companies.length > 1) {
      req.user.companies = row.companies;
      const want = String(req.headers['x-company'] || '');
      const pick = row.companies.find((c) => String(c.id) === want);
      if (pick) { req.user.company_id = pick.id; req.user.role = pick.role; }
      else if (want === 'all') {
        req.user.companyIds = row.companies.map((c) => c.id);
        // one role spans every company here: take the LEAST privileged membership, so being an
        // admin in one company never grants admin rights in another through the "all" view
        const rank = { company_admin: 3, company_user: 2, translator: 1 };
        req.user.role = row.companies.reduce((lo, c) => ((rank[c.role] || 0) < (rank[lo] || 0) ? c.role : lo), row.companies[0].role);
      }
    }
    // the entry gates (verify phone / replace a weak or default password) are enforced here
    // too, not only in the clients: until passed, only the sign-in/verify/password calls work.
    // Impersonation sessions skip them, as in the clients.
    const gated = (config.requirePhoneVerify && !row.phone_verified_at) || Number(row.must_change_password);
    if (gated && !req.user.impersonated_by && !gateOpen(req)) {
      return res.status(403).json({ error: 'יש להשלים אימות טלפון / החלפת סיסמה', code: 'entry_gate' });
    }
  } catch (e) {
    // DB hiccup: fail closed — never fall back to the token's (possibly stale) role / company
    return res.status(503).json({ error: 'השרת אינו זמין כרגע, נסו שוב בעוד רגע' });
  }
  // translator: only the translation screens (plus sign-in, own profile and the bell)
  if (req.user.role === 'translator' && !TRANSLATOR_OK.includes(req.baseUrl)) {
    return res.status(403).json({ error: 'למתרגם הרשאה למסך התרגומים בלבד' });
  }
  // sales_manager is a read-only role: block every write except the auth/OTP
  // flows it needs to sign in and pass the phone-verify gate.
  if (req.user.role === 'sales_manager' && req.method !== 'GET' && req.baseUrl !== '/api/auth') {
    return res.status(403).json({ error: 'למנהל מכירות הרשאת צפייה בלבד' });
  }
  next();
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

// drop the cached role/companies after a change (e.g. a new company membership), so it applies now
const forgetUser = (id) => userCache.delete(id) || userCache.delete(String(id)) || userCache.delete(Number(id));

module.exports = { requireAuth, requireRole, loadLeadRestriction, forgetUser };
