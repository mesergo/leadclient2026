// One-time cleanup: decode HTML entities that the legacy system stored literally
// (e.g. "בע&quot;מ" -> 'בע"מ', "a&#64;b" -> "a@b"). Safe to re-run — it only
// touches rows that still contain an entity, and decoding is idempotent.
//
// Usage: node db/decode-entities.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

function decodeOnce(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return _; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // decode &amp; last
}

// Some values are double-encoded (e.g. "&amp;#39;"); decode until stable.
function decodeEntities(s) {
  if (s == null) return s;
  let cur = String(s);
  for (let i = 0; i < 5; i++) {
    const next = decodeOnce(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

const TARGETS = [
  ['agencies', 'id', ['name']],
  ['companies', 'id', ['name']],
  ['services', 'id', ['name', 'description']],
  ['lead_statuses', 'id', ['text']],
  ['tags', 'id', ['label']],
  ['users', 'id', ['first_name', 'last_name', 'display_name']],
  ['contacts', 'id', ['first_name', 'last_name']],
  ['leads', 'id', ['lead_name', 'lead_email']],
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  let grand = 0;
  for (const [table, idcol, cols] of TARGETS) {
    for (const col of cols) {
      let cols2;
      try { cols2 = (await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${col}'`))[0]; }
      catch { continue; }
      if (!cols2.length) continue;
      const [rows] = await conn.query(`SELECT \`${idcol}\` id, \`${col}\` v FROM \`${table}\` WHERE \`${col}\` LIKE '%&%;%'`);
      let changed = 0;
      for (const r of rows) {
        const dec = decodeEntities(r.v);
        if (dec !== r.v) { await conn.query(`UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${idcol}\` = ?`, [dec, r.id]); changed++; }
      }
      if (changed) console.log(`${table}.${col}: ${changed} decoded`);
      grand += changed;
    }
  }
  console.log(`✅ done — ${grand} values decoded.`);
  await conn.end();
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
