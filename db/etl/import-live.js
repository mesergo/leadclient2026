// One-shot importer: legacy live DB  ->  our new schema. TEMPORARY / repeatable.
// It NEVER touches the legacy DB (reads only). It (re)builds the target DB.
//
// Prereq: the legacy data must live in a DB on the SAME MySQL server as the
// target (restore your live dump into it — a read-only export of live):
//     mysql -u root -p -e "CREATE DATABASE app_leadclient_net"
//     mysql -u root -p app_leadclient_net < live-dump.sql
//
// Then run (connection comes from repo-root .env; use a user with rights on both DBs):
//     SRC_DB=app_leadclient_net DST_DB=leadclient_trial node db/etl/import-live.js
//
// Optional: SRC_DUMP=/path/live-dump.sql   (loads it into SRC_DB first, if the
// mysql/mariadb client is on PATH).
//
// Steps: [1] build target schema  [2] transform legacy->target (INSERT..SELECT,
// server-side — no data flows through Node)  [3] seed translations + packages
// [4] decode HTML entities. Safe to re-run.

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');

const SRC_DB = process.env.SRC_DB || 'app_leadclient_net';
const DST_DB = process.env.DST_DB || process.env.DB_NAME || 'leadclient';
const SRC_DUMP = process.env.SRC_DUMP || '';
const CONN = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  multipleStatements: true,
};
const readSql = (p) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
const log = (m) => console.log(`\n▶ ${m}`);

function tryLoadDump() {
  if (!SRC_DUMP) return false;
  const client = ['mysql', 'mariadb'].find((c) => { try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } });
  if (!client) {
    console.log(`  ⚠ no mysql client on PATH — load the dump manually:\n    ${'mysql'} -u ${CONN.user} -p ${SRC_DB} < ${SRC_DUMP}`);
    return false;
  }
  log(`loading dump into ${SRC_DB} via ${client}`);
  const args = [`-h${CONN.host}`, `-P${CONN.port}`, `-u${CONN.user}`, ...(CONN.password ? [`-p${CONN.password}`] : []), SRC_DB];
  execFileSync(client, args, { input: fs.readFileSync(SRC_DUMP), stdio: ['pipe', 'inherit', 'inherit'], maxBuffer: 1 << 30 });
  return true;
}

async function main() {
  console.log(`Import: ${SRC_DB}  ->  ${DST_DB}  @ ${CONN.host}:${CONN.port}`);
  const conn = await mysql.createConnection(CONN);

  if (SRC_DUMP) { await conn.query(`CREATE DATABASE IF NOT EXISTS \`${SRC_DB}\` CHARACTER SET utf8mb4`); tryLoadDump(); }
  const [[srcExists]] = [await conn.query('SELECT COUNT(*) n FROM information_schema.schemata WHERE schema_name = ?', [SRC_DB])];
  if (!srcExists[0].n) throw new Error(`source DB "${SRC_DB}" not found. Restore your live dump into it first (see header).`);

  log(`building target schema in ${DST_DB}`);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.changeUser({ database: DST_DB });
  await conn.query(readSql('../schema.sql'));

  log('transforming legacy data -> target (server-side INSERT..SELECT)');
  let migrate = readSql('prod-migrate.sql')
    .replace(/app_leadclient_net/g, SRC_DB)
    .replace(/\bleadclient\./g, `${DST_DB}.`);
  await conn.query(migrate);

  await conn.end();

  // seeds + cleanup reuse the standalone scripts, pointed at the target DB
  const env = { ...process.env, DB_NAME: DST_DB };
  const run = (script) => { log(`running ${script}`); execFileSync(process.execPath, [path.resolve(__dirname, '..', script)], { stdio: 'inherit', env }); };
  run('seed-translations.js');
  run('seed-translations-all.js');
  run('seed-packages.js');
  run('decode-entities.js');

  console.log(`\n✅ done. Point server/.env DB_NAME to "${DST_DB}" and start the app.`);
}
main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
