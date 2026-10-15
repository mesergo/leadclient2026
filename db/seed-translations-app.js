// The mobile app's UI strings (keys app.*, namespace 'app') for he_IL / ar / ru / en, from
// db/translations-app/<lang>.json (the app's own dictionary: leadclient-mobile src/i18n, Hebrew = source).
// The app reads them via GET /api/public/app-strings and they can be edited in the Languages screen.
// A value is written only when it is new, empty, or still exactly what this script wrote last time
// (seeded_value) — a string someone edited by hand in the Languages screen is never overwritten.
// Safe to re-run. Usage: node db/seed-translations-app.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DIR = path.resolve(__dirname, 'translations-app');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
  // the column the server adds on start (db/init.js) — add it here too so the script can run first
  const [col] = await conn.query("SHOW COLUMNS FROM translation_strings LIKE 'seeded_value'");
  if (!col.length) await conn.query('ALTER TABLE translation_strings ADD COLUMN seeded_value TEXT NULL');

  const [langs] = await conn.query('SELECT slug FROM languages');
  const known = new Set(langs.map((r) => r.slug));
  let total = 0;
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    const lang = path.basename(file, '.json');
    if (!known.has(lang)) { console.log(`  ${lang}: no such language in the languages table — skipped`); continue; }
    const dict = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    const [cur] = await conn.query(
      "SELECT id, string_key, string_value, seeded_value FROM translation_strings WHERE lang_slug = ? AND string_key LIKE 'app.%'", [lang]);
    const byKey = new Map(cur.map((r) => [r.string_key, r]));
    let added = 0, updated = 0, kept = 0;
    for (const [key, value] of Object.entries(dict)) {
      if (!key.startsWith('app.')) continue;
      const row = byKey.get(key);
      if (!row) {
        await conn.query(
          "INSERT INTO translation_strings (lang_slug, string_key, namespace, string_value, seeded_value) VALUES (?, ?, 'app', ?, ?)",
          [lang, key, value, value]);
        added++;
      } else if (!String(row.string_value || '').trim() || row.string_value === row.seeded_value) {
        if (row.string_value !== value || row.seeded_value !== value) {
          await conn.query("UPDATE translation_strings SET string_value = ?, seeded_value = ?, namespace = 'app' WHERE id = ?", [value, value, row.id]);
          updated++;
        }
      } else {
        kept++; // edited by hand in the Languages screen
      }
    }
    console.log(`  ${lang}: ${added} added, ${updated} updated, ${kept} hand-edited kept`);
    total += added + updated;
  }
  console.log(`✅ ${total} app strings written.`);
  await conn.end();
})().catch((e) => { console.error(e); process.exit(1); });
