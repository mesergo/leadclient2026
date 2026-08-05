// Loads db/seed.sql into the configured MySQL database.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const file = path.join(__dirname, 'seed.sql');
  if (!fs.existsSync(file)) {
    console.error('seed.sql not found — run: node db/etl/etl.js');
    process.exit(1);
  }
  const sql = fs.readFileSync(file, 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  console.log(`Seeding ${process.env.DB_NAME}...`);
  await conn.query(sql);
  const [[{ c: companies }]] = await conn.query('SELECT COUNT(*) c FROM companies');
  const [[{ c: leads }]] = await conn.query('SELECT COUNT(*) c FROM leads');
  console.log(`✅ seeded. companies=${companies}, leads=${leads}`);
  await conn.end();
}
main().catch((e) => { console.error('❌ seed failed:', e.message); process.exit(1); });
