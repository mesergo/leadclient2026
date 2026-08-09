// Seed translation_strings from the app's canonical UI dictionary (client/src/i18n.js).
// he/en get their real values; the other active languages are seeded with the
// English value as a starting point for translators. namespace = key prefix.
//
// Usage: node db/seed-translations.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadDict() {
  const src = fs.readFileSync(path.resolve(__dirname, '../client/src/i18n.js'), 'utf8');
  const start = src.indexOf('const DICT');
  const eq = src.indexOf('=', start);
  const end = src.indexOf('export function translate', eq);
  let objText = src.slice(eq + 1, end).trim();
  if (objText.endsWith(';')) objText = objText.slice(0, -1);
  // Trusted, first-party file — evaluate the object literal.
  // eslint-disable-next-line no-eval
  return eval('(' + objText + ')');
}

const nsOf = (key) => (key.includes('.') ? key.split('.')[0] : 'general');

async function main() {
  const dict = loadDict();
  const he = dict.he || {}, en = dict.en || {};
  const keys = [...new Set([...Object.keys(he), ...Object.keys(en)])];
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const langs = (await conn.query('SELECT slug FROM languages'))[0].map((r) => r.slug);
  // map an app dict code (he/en) to the language slug used in the languages table
  const valueFor = (slug, key) => {
    if (slug === 'he_IL' || slug === 'he') return he[key] ?? en[key] ?? '';
    return en[key] ?? '';               // en + all others start from English
  };
  let n = 0;
  for (const slug of langs) {
    const rows = keys.map((k) => [slug, k, nsOf(k), valueFor(slug, k)]);
    const CHUNK = 300;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      await conn.query(
        'INSERT INTO translation_strings (lang_slug, string_key, namespace, string_value) VALUES ' +
        slice.map(() => '(?,?,?,?)').join(',') +
        ' ON DUPLICATE KEY UPDATE string_value = VALUES(string_value)',
        slice.flat());
      n += slice.length;
    }
  }
  console.log(`✅ seeded ${n} strings across ${langs.length} languages (${keys.length} keys each).`);
  await conn.end();
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
