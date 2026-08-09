// Live-DB one-way delta sync (read-only source, append into our schema).
// - saves the live connection
// - "sync now": full-mirror small config tables + pull only NEW rows (id >
//   marker) for the big tables, then transform with INSERT IGNORE (no deletes)
// The legacy DB is only read.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
const config = require('../config');
const { query } = require('../db/pool');

// small lookup/config tables — mirrored in full every sync (cheap; picks up new companies/channels)
const FULL_TABLES = ['agencies', 'companies', 'users', 'services', 'all_phones', 'maskyoo_phones',
  'statuses', 'languages', 'payment_packages', 'company_lead_tags'];
// large tables — pull only rows with id greater than the stored marker
const DELTA_TABLES = ['leads', 'contacts', 'messages', 'reminders', 'tags_for_leads', 'action_log'];
const ALL_TABLES = [...FULL_TABLES, ...DELTA_TABLES];

let job = null;
const status = () => job || { running: false };

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS live_sync (
    id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
    host VARCHAR(255), port INT, db_user VARCHAR(100), db_pass VARCHAR(255), db_name VARCHAR(100),
    markers TEXT, last_sync_at DATETIME) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
async function getConfig() {
  await ensureTable();
  const r = await query('SELECT * FROM live_sync WHERE id = 1');
  if (!r[0]) return null;
  const c = r[0];
  let markers = {}; try { markers = JSON.parse(c.markers || '{}'); } catch { markers = {}; }
  return { host: c.host, port: c.port, user: c.db_user, database: c.db_name, hasPassword: !!c.db_pass, markers, last_sync_at: c.last_sync_at };
}
async function saveConfig(cfg) {
  await ensureTable();
  await query(
    `INSERT INTO live_sync (id, host, port, db_user, db_pass, db_name, markers)
     VALUES (1, ?, ?, ?, ?, ?, '{}')
     ON DUPLICATE KEY UPDATE host=VALUES(host), port=VALUES(port), db_user=VALUES(db_user),
       db_pass=VALUES(db_pass), db_name=VALUES(db_name)`,
    [cfg.host, Number(cfg.port) || 3306, cfg.user, cfg.password || '', cfg.database]);
  return getConfig();
}
async function rawConfig() {
  const r = await query('SELECT host, port, db_user, db_pass, db_name, markers FROM live_sync WHERE id = 1');
  return r[0] || null;
}

function mirrorCreate(createSql, table) {
  const lines = createSql.split('\n').filter((l) => !/CONSTRAINT|FOREIGN KEY/i.test(l));
  return lines.join('\n').replace(/,(\s*)\)/, '$1)').replace(/^CREATE TABLE `[^`]+`/i, `CREATE TABLE \`zz_src_${table}\``);
}

async function mirrorTable(src, dst, table, sinceId) {
  const cols0 = (await src.query(`SHOW COLUMNS FROM \`${table}\``))[0];
  const cols = cols0.map((c) => c.Field);
  const hasId = cols.includes('id');
  const [[create]] = [await src.query(`SHOW CREATE TABLE \`${table}\``)];
  await dst.query(`DROP TABLE IF EXISTS \`zz_src_${table}\``);
  await dst.query(mirrorCreate(create[0]['Create Table'], table));

  const delta = sinceId != null && hasId;
  let maxId = sinceId || 0;
  if (hasId) { const [[m]] = [await src.query(`SELECT COALESCE(MAX(id),0) mx FROM \`${table}\``)]; maxId = Number(m[0].mx); }
  const where = delta ? `WHERE id > ${Number(sinceId)}` : '';
  const [[cnt]] = [await src.query(`SELECT COUNT(*) n FROM \`${table}\` ${where}`)];
  job.tables[table] = { total: Number(cnt[0].n), copied: 0, newMax: maxId };

  const colList = cols.map((c) => `\`${c}\``).join(',');
  const stream = src.connection.query(`SELECT * FROM \`${table}\` ${where}`).stream();
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const rows = batch; batch = [];
    const ph = rows.map(() => '(' + cols.map(() => '?').join(',') + ')').join(',');
    await dst.query(`INSERT INTO \`zz_src_${table}\` (${colList}) VALUES ${ph}`, rows.flatMap((r) => cols.map((c) => r[c])));
    job.tables[table].copied += rows.length;
  };
  await new Promise((resolve, reject) => {
    stream.on('data', (row) => { batch.push(row); if (batch.length >= 1000) { stream.pause(); flush().then(() => stream.resume()).catch(reject); } });
    stream.on('end', () => flush().then(resolve).catch(reject));
    stream.on('error', reject);
  });
  return maxId;
}

function runScript(script) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [path.resolve(__dirname, '../../../db', script)], { env: { ...process.env, DB_NAME: config.db.database }, stdio: 'ignore' });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
    c.on('error', reject);
  });
}

async function doSync() {
  const cfg = await rawConfig();
  if (!cfg) throw new Error('לא נשמר חיבור ל-DB החי');
  const markers = (() => { try { return JSON.parse(cfg.markers || '{}'); } catch { return {}; } })();

  const src = await mysql.createConnection({ host: cfg.host, port: Number(cfg.port) || 3306, user: cfg.db_user, password: cfg.db_pass, database: cfg.db_name, connectTimeout: 15000 });
  const dst = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database, multipleStatements: true });
  const newMarkers = { ...markers };
  try {
    await dst.query('SET FOREIGN_KEY_CHECKS = 0');
    job.phase = 'mirror';
    for (const t of FULL_TABLES) { job.table = t; try { await mirrorTable(src, dst, t, null); } catch (e) { job.tables[t] = { error: e.message }; } }
    for (const t of DELTA_TABLES) { job.table = t; try { newMarkers[t] = await mirrorTable(src, dst, t, markers[t] || 0); } catch (e) { job.tables[t] = { error: e.message }; } }

    job.phase = 'transform';
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../db/etl/prod-migrate.sql'), 'utf8')
      .replace(/DELETE FROM leadclient\.[a-z_]+;\s*/gi, '')          // append-only: no deletes
      .replace(/INSERT INTO leadclient\./gi, 'INSERT IGNORE INTO ')  // skip existing
      .replace(/app_leadclient_net\./g, 'zz_src_')
      .replace(/\bleadclient\./g, '');
    await dst.query(sql);
    for (const t of ALL_TABLES) await dst.query(`DROP TABLE IF EXISTS \`zz_src_${t}\``).catch(() => {});
    await dst.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally { await src.end().catch(() => {}); await dst.end().catch(() => {}); }

  // seed translations/packages once (if missing), then clean entities
  job.phase = 'finalize';
  const trans = await query("SELECT COUNT(*) n FROM translation_strings").catch(() => [{ n: 1 }]);
  if (!Number(trans[0].n)) { await runScript('seed-translations.js'); await runScript('seed-translations-all.js'); }
  const pkg = await query("SELECT COUNT(*) n FROM payment_packages").catch(() => [{ n: 1 }]);
  if (!Number(pkg[0].n)) await runScript('seed-packages.js');
  await runScript('decode-entities.js');

  await query('UPDATE live_sync SET markers = ?, last_sync_at = NOW() WHERE id = 1', [JSON.stringify(newMarkers)]);
}

async function testConnection(cfg) {
  let c = cfg;
  if (!c || !c.host) { const r = await rawConfig(); if (!r) throw new Error('אין חיבור שמור'); c = { host: r.host, port: r.port, user: r.db_user, password: r.db_pass, database: r.db_name }; }
  const src = await mysql.createConnection({ host: c.host, port: Number(c.port) || 3306, user: c.user, password: c.password, database: c.database, connectTimeout: 15000 });
  try {
    const out = {};
    for (const t of ['agencies', 'companies', 'leads']) { try { out[t] = Number((await src.query(`SELECT COUNT(*) n FROM \`${t}\``))[0][0].n); } catch { out[t] = null; } }
    return out;
  } finally { await src.end().catch(() => {}); }
}

function sync() {
  if (job && job.running) throw new Error('סנכרון כבר רץ');
  job = { running: true, phase: 'starting', table: null, tables: {}, error: null, startedAt: Date.now(), finishedAt: null };
  doSync()
    .then(() => { job.running = false; job.phase = 'done'; job.finishedAt = Date.now(); })
    .catch((e) => { job.running = false; job.phase = 'error'; job.error = e.message; job.finishedAt = Date.now(); });
  return job;
}

module.exports = { getConfig, saveConfig, testConnection, sync, status };
