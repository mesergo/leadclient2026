// Clean demo seed: wipe all data, then create a minimal baseline —
// 1 agency, 1 company, 3 channels (services) with 3 leads each, and users
// (a super-admin + a company manager + agents). Safe to re-run.
//
// Run inside the app container:  node db/demo-seed.js
// Connects using the same DB_* env vars the server uses.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'leadclient',
  multipleStatements: true,
};

const hash = bcrypt.hashSync('admin1234', 10); // demo password for every seeded user
const uuid = () => crypto.randomUUID();
const shortHash = (n) => crypto.randomBytes(18).toString('base64url').slice(0, n);

(async () => {
  const c = await mysql.createConnection(cfg);
  console.log(`connected to ${cfg.host}:${cfg.port}/${cfg.database}`);

  // 1) ensure schema exists (idempotent — CREATE TABLE IF NOT EXISTS)
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  await c.query(schema);
  console.log('schema applied');

  // 2) wipe ALL data
  const [tables] = await c.query(
    'SELECT table_name tn FROM information_schema.tables WHERE table_schema = ?', [cfg.database]);
  await c.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { tn } of tables) await c.query(`TRUNCATE TABLE \`${tn}\``);
  await c.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`wiped ${tables.length} tables`);

  const ins = async (sql, params) => (await c.query(sql, params))[0].insertId;

  // 3) agency + company
  const agencyId = await ins('INSERT INTO agencies (name, is_active) VALUES (?, 1)', ['סוכנות דוגמה']);
  const companyId = await ins(
    'INSERT INTO companies (agency_id, name, public_token, is_active) VALUES (?, ?, ?, 1)',
    [agencyId, 'חברת דוגמה', uuid()]);

  // 4) statuses for the company
  const statusRows = [
    ['חדש', '#3498db', 1, 1, 0, 0],
    ['בטיפול', '#f39c12', 2, 0, 1, 0],
    ['עסקה נסגרה', '#2ecc71', 3, 0, 0, 1],
  ];
  const statusIds = [];
  for (const [text, color, sort, isStatic, isWaiting, isFinished] of statusRows) {
    statusIds.push(await ins(
      'INSERT INTO lead_statuses (company_id, text, color, sort_order, is_static, is_waiting, is_finished) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [companyId, text, color, sort, isStatic, isWaiting, isFinished]));
  }

  // 5) users: super-admin + company manager + 3 agents (password: admin1234)
  const adminId = await ins(
    `INSERT INTO users (role, username, display_name, password_hash, is_active, language)
     VALUES ('super_admin', 'admin', 'מנהל מערכת', ?, 1, 'he')`, [hash]);
  const managerId = await ins(
    `INSERT INTO users (role, company_id, agency_id, username, display_name, password_hash, is_active, language)
     VALUES ('company_admin', ?, ?, 'manager', 'מנהל חברה', ?, 1, 'he')`, [companyId, agencyId, hash]);
  const agentIds = [];
  for (let i = 1; i <= 3; i++) {
    agentIds.push(await ins(
      `INSERT INTO users (role, company_id, agency_id, username, display_name, password_hash, is_active, language)
       VALUES ('company_user', ?, ?, ?, ?, ?, 1, 'he')`,
      [companyId, agencyId, `agent${i}`, `נציג ${i}`, hash]));
  }

  // 6) 3 channels (services), 3 leads each
  const channelNames = ['ערוץ דוגמה 1', 'ערוץ דוגמה 2', 'ערוץ דוגמה 3'];
  let leadN = 0;
  for (let s = 0; s < channelNames.length; s++) {
    const serviceId = await ins(
      'INSERT INTO services (company_id, name, public_hash, service_type, is_active) VALUES (?, ?, ?, ?, 1)',
      [companyId, channelNames[s], 'demo' + shortHash(20), 'form']);
    for (let l = 1; l <= 3; l++) {
      leadN++;
      await c.query(
        `INSERT INTO leads (company_id, service_id, status_id, current_agent_id, lead_name, lead_phone, lead_email, lead_through)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'widget')`,
        [companyId, serviceId, statusIds[l % statusIds.length], agentIds[l % agentIds.length],
          `ליד ${leadN}`, `05${(20000000 + leadN).toString().slice(0, 8)}`, `lead${leadN}@example.com`]);
    }
  }

  console.log('✓ seeded: 1 agency, 1 company, 3 channels, 9 leads, 5 users');
  console.log('  login: admin / admin1234  (manager: manager, agents: agent1..3 — same password)');
  await c.end();
  process.exit(0);
})().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
