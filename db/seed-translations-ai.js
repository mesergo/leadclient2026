// Full UI translations for ar/de/es/fr/pt/ru (translated from the Hebrew source, 2026-10-15),
// kept in db/translations/<lang>.json. Upserts into translation_strings, but replaces a value only
// while it is still the English placeholder (or empty) — a translation someone edited by hand in
// the Languages screen is never overwritten. Safe to re-run.
// Usage: node db/seed-translations-ai.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DIR = path.resolve(__dirname, 'translations');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
  const [enRows] = await conn.query("SELECT string_key, string_value FROM translation_strings WHERE lang_slug = 'en'");
  const en = new Map(enRows.map((r) => [r.string_key, r.string_value || '']));
  let total = 0;
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    const lang = path.basename(file, '.json');
    const dict = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    const [cur] = await conn.query('SELECT id, string_key, string_value FROM translation_strings WHERE lang_slug = ?', [lang]);
    const byKey = new Map(cur.map((r) => [r.string_key, r]));
    let n = 0;
    for (const [key, value] of Object.entries(dict)) {
      const row = byKey.get(key);
      const ns = key.includes('.') ? key.split('.')[0] : null;
      if (!row) {
        await conn.query('INSERT INTO translation_strings (lang_slug, string_key, namespace, string_value) VALUES (?, ?, ?, ?)', [lang, key, ns, value]);
        n++;
      } else if (!String(row.string_value || '').trim() || row.string_value === en.get(key)) {
        await conn.query('UPDATE translation_strings SET string_value = ? WHERE id = ?', [value, row.id]);
        n++;
      }
    }
    console.log(`  ${lang}: ${n} strings`);
    total += n;
  }
  console.log(`✅ ${total} translated strings written.`);
  await conn.end();
})().catch((e) => { console.error(e); process.exit(1); });
