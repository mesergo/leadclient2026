// Seed the public pricing packages (Basic / Business / Jumbo) with display info.
// Adds display columns to payment_packages if missing. Usage: node db/seed-packages.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const PACKAGES = [
  {
    name: 'חבילת בסיס', subtitle: 'מתאים לעסק קטן', price: 69, original_price: 119, setup_fee: 0, is_popular: 0,
    users: 2, companies: 1, phones: 0, leads: 500, additional_minute_price: 0.20, additional_phone_price: 19,
    features: ['2 משתמשים', 'עד 500 לידים', 'התראות בזמן אמת', 'קו טלפון ב-19 ש"ח', 'חיבור קווים חיצוניים', 'חיבור webhook', 'ללא התחייבות'],
    sort_order: 1,
  },
  {
    name: 'חבילת לעסק', subtitle: 'מתאים לעסק קטן', price: 99, original_price: 149, setup_fee: 0, is_popular: 0,
    users: 5, companies: 1, phones: 1, leads: -1, additional_minute_price: 0.20, additional_phone_price: 19,
    features: ['5 משתמשים', 'לידים ללא הגבלה', 'התראות בזמן אמת', 'קו טלפון אחד', 'הקלטת שיחות', 'חיבור webhook', 'ללא התחייבות'],
    sort_order: 2,
  },
  {
    name: 'חבילת ג׳מבו', subtitle: 'מתאים לעסק גדול / סוכנות קטנה', price: 249, original_price: 319, setup_fee: 0, is_popular: 1,
    users: -1, companies: 4, phones: 5, leads: -1, additional_minute_price: 0.20, additional_phone_price: 19,
    features: ['עד 4 חברות', '5 קווי טלפון', 'הקלטת שיחות', 'לידים ללא הגבלה', 'התראות בזמן אמת', 'חיבור webhook', 'ללא התחייבות'],
    sort_order: 3,
  },
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  // Note: run once via root if ALTER is denied to the app user.
  const cols = (await conn.query('SHOW COLUMNS FROM payment_packages'))[0].map((c) => c.Field);
  const add = [];
  if (!cols.includes('name')) add.push("ADD COLUMN name VARCHAR(100) NULL");
  if (!cols.includes('subtitle')) add.push("ADD COLUMN subtitle VARCHAR(150) NULL");
  if (!cols.includes('original_price')) add.push("ADD COLUMN original_price FLOAT NULL");
  if (!cols.includes('setup_fee')) add.push("ADD COLUMN setup_fee FLOAT NULL DEFAULT 0");
  if (!cols.includes('is_popular')) add.push("ADD COLUMN is_popular TINYINT(1) NULL DEFAULT 0");
  if (!cols.includes('companies')) add.push("ADD COLUMN companies INT NULL");
  if (!cols.includes('features')) add.push("ADD COLUMN features TEXT NULL");
  if (!cols.includes('sort_order')) add.push("ADD COLUMN sort_order INT NULL DEFAULT 0");
  if (add.length) { await conn.query('ALTER TABLE payment_packages ' + add.join(', ')); console.log('added columns:', add.length); }

  await conn.query('DELETE FROM payment_packages');
  let id = 1;
  for (const p of PACKAGES) {
    await conn.query(
      `INSERT INTO payment_packages (id, name, subtitle, price, original_price, setup_fee, is_popular, users, companies, phones, leads, additional_minute_price, additional_phone_price, features, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id++, p.name, p.subtitle, p.price, p.original_price, p.setup_fee, p.is_popular, p.users, p.companies, p.phones, p.leads, p.additional_minute_price, p.additional_phone_price, JSON.stringify(p.features), p.sort_order]);
  }
  console.log(`✅ ${PACKAGES.length} packages seeded.`);
  await conn.end();
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
