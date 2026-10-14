const mysql = require('mysql2/promise');
const config = require('../config');
const scope = require('./scope');

// Current UTC offset of a zone, as MySQL wants it ("+03:00"). Israel switches between
// +02:00 and +03:00, and the DB server may not have named time-zone tables, so we
// set the numeric offset per session and recycle the pool when it changes (DST).
function tzOffset(tz = config.timezone, d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const n = (t) => Number(p.find((x) => x.type === t).value);
  const mins = Math.round((Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - d.getTime()) / 60000);
  const a = Math.abs(mins);
  return `${mins < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

let pool, poolOffset, checkedAt = 0;
function getPool() {
  // re-check the offset at most once a minute; on a DST switch start a fresh pool
  if (pool && Date.now() - checkedAt > 60000) {
    checkedAt = Date.now();
    if (tzOffset() !== poolOffset) {
      const old = pool; pool = null;
      setTimeout(() => old.end().catch(() => {}), 60000).unref?.(); // let in-flight queries finish
    }
  }
  if (!pool) {
    poolOffset = tzOffset(); checkedAt = Date.now();
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
      dateStrings: true,
      timezone: poolOffset, // JS Date params are written in Israel time too
    });
    // every new connection: NOW()/CURRENT_TIMESTAMP in Israel time (queued before any other command)
    const off = poolOffset;
    pool.pool.on('connection', (conn) => conn.query(`SET time_zone = '${off}'`));
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

// Build a scoped WHERE and merge params. Returns { where, params }.
function scoped(user, baseWhere = '1=1', baseParams = [], col = 'company_id') {
  const s = scope.companyScope(user, col);
  return { where: `(${baseWhere}) AND (${s.sql})`, params: [...baseParams, ...s.params] };
}

// The company a write targets: company-level roles always write to their own company
// (a body company_id is ignored); admins above them name it and must pass ownsCompany.
const COMPANY_ROLES = ['company_admin', 'company_user', 'translator'];
function targetCompanyId(user, requested) {
  if (user && COMPANY_ROLES.includes(user.role)) return user.company_id || null;
  return Number(requested) || null;
}

// Whether `user` may write to company `companyId` (super_admin: any; agency_admin:
// its agency's companies; company roles: their own). Async counterpart of canAccessCompany.
async function ownsCompany(user, companyId) {
  if (!companyId) return false;
  const s = scope.companyScope(user, 'id');
  return !!(await query(`SELECT id FROM companies WHERE id = ? AND (${s.sql})`, [companyId, ...s.params]))[0];
}

module.exports = { getPool, query, scoped, tzOffset, targetCompanyId, ownsCompany, ...scope };
