// Runs db/schema.sql against the configured MySQL database.
// Usage: node db/migrate.js   (reads .env at repo root)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  console.log(`Applying schema to ${process.env.DB_NAME} @ ${process.env.DB_HOST}...`);
  await conn.query(sql);
  const [rows] = await conn.query('SHOW TABLES');
  console.log(`✅ schema applied. ${rows.length} tables present.`);
  await conn.end();
}

main().catch((e) => {
  console.error('❌ migrate failed:', e.message);
  process.exit(1);
});
