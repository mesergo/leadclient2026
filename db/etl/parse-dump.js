// mysqldump INSERT parser (columns included). Char-code based; trims separators.
const fs = require('fs');
const BS = 92, QUOTE = 39, COMMA = 44, OPEN = 40, CLOSE = 41, SEMI = 59;

function tokenizeValues(body) {
  const rows = [];
  let i = 0;
  const n = body.length;
  while (i < n) {
    while (i < n && body.charCodeAt(i) !== OPEN) i++;
    if (i >= n) break;
    i++;
    const row = [];
    let val = '';
    let inStr = false;
    let quoted = false;
    const push = () => { row.push(coerce(val, quoted)); val = ''; quoted = false; };
    while (i < n) {
      const cc = body.charCodeAt(i);
      if (inStr) {
        if (cc === BS) { val += body[i + 1]; i += 2; continue; }
        if (cc === QUOTE) { inStr = false; i++; continue; }
        val += body[i]; i++; continue;
      }
      if (cc === QUOTE) { if (val.trim() === '') val = ''; inStr = true; quoted = true; i++; continue; }
      if (cc === COMMA) { push(); i++; continue; }
      if (cc === CLOSE) { push(); i++; break; }
      val += body[i]; i++;
    }
    rows.push(row);
    while (i < n && body.charCodeAt(i) !== OPEN && body.charCodeAt(i) !== SEMI) i++;
  }
  return rows;
}

function coerce(raw, quoted) {
  if (quoted) return raw;
  const t = raw.trim();
  if (t.toUpperCase() === 'NULL' || t === '') return null;
  return t;
}

function* parseInserts(sql) {
  const re = /INSERT INTO [`"]?(\w+)[`"']?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);\s*(?:\n|$)/gi;
  let m;
  while ((m = re.exec(sql))) {
    yield {
      table: m[1],
      columns: m[2].split(',').map((c) => c.replace(/[^\w]/g, '')),
      rows: tokenizeValues(m[3]),
    };
  }
}

function loadTable(sql, tableName) {
  const out = [];
  for (const blk of parseInserts(sql)) {
    if (blk.table !== tableName) continue;
    for (const r of blk.rows) {
      const obj = {};
      blk.columns.forEach((c, idx) => (obj[c] = r[idx]));
      out.push(obj);
    }
  }
  return out;
}

module.exports = { parseInserts, loadTable };

if (require.main === module) {
  const sql = fs.readFileSync(process.argv[2], 'utf8');
  const rows = loadTable(sql, process.argv[3]);
  console.log(`${process.argv[3]}: ${rows.length} rows`);
  const slim = rows.slice(0, 3).map((r) => {
    const o = {};
    for (const k of Object.keys(r)) o[k] = typeof r[k] === 'string' && r[k].length > 30 ? r[k].slice(0, 30) + '…' : r[k];
    return o;
  });
  console.log(JSON.stringify(slim, null, 1));
}
