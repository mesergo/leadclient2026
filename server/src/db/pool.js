const mysql = require('mysql2/promise');
const config = require('../config');
const scope = require('./scope');

let pool;
function getPool() {
  if (!pool) {
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
    });
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

module.exports = { getPool, query, scoped, ...scope };
