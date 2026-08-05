const fs = require('fs');
const path = require('path');
const { Parser } = require('node-sql-parser');

const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const parser = new Parser();
const opt = { database: 'mysql' };

const stripComments = (s) =>
  s
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .trim();

const statements = sql
  .split(/;\s*\n/)
  .map(stripComments)
  .map((s) => s.replace(/^SET FOREIGN_KEY_CHECKS = \d\s*/i, '').trim())
  .filter((s) => s && !/^SET\s/i.test(s));

const tables = {};
let errors = [];
let parsed = 0;

for (const stmt of statements) {
  if (!/create table/i.test(stmt)) continue;
  try {
    const ast = parser.astify(stmt + ';', opt);
    parsed++;
    const node = Array.isArray(ast) ? ast[0] : ast;
    const tname = node.table[0].table;
    const cols = new Set();
    for (const d of node.create_definitions || []) {
      if (d.resource === 'column') {
        const cn = d.column.column;
        if (cols.has(cn)) errors.push(`DUP COLUMN ${tname}.${cn}`);
        cols.add(cn);
      }
    }
    if (tables[tname]) errors.push(`DUP TABLE ${tname}`);
    tables[tname] = cols;
  } catch (e) {
    errors.push(`PARSE FAIL: ${stmt.slice(0, 70).replace(/\n/g, ' ')} :: ${e.message.slice(0, 90)}`);
  }
}

const fkRe = /REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/gi;
let m;
const fkTargets = [];
while ((m = fkRe.exec(sql))) fkTargets.push([m[1], m[2]]);
for (const [t, c] of fkTargets) {
  if (!tables[t]) errors.push(`FK -> missing table ${t}`);
  else if (!tables[t].has(c)) errors.push(`FK -> ${t}.${c} column missing`);
}

console.log(`Parsed CREATE TABLE: ${parsed} | Distinct tables: ${Object.keys(tables).length} | FKs checked: ${fkTargets.length}`);
if (errors.length) {
  console.log(`\n❌ ${errors.length} ISSUES:`);
  errors.forEach((e) => console.log('  - ' + e));
  process.exit(1);
}
console.log('\n✅ schema valid: all parse, no dup tables/columns, all FK targets resolve.');
console.log('Tables:', Object.keys(tables).sort().join(', '));
