// Verifies seed.sql: duplicate PKs + referential integrity (orphan FKs).
const fs = require('fs');
const path = require('path');
const { parseInserts } = require('./parse-dump');

const seed = fs.readFileSync(path.resolve(__dirname, '../seed.sql'), 'utf8');

// collect rows per target table (as {col:val})
const data = {};
for (const blk of parseInserts(seed)) {
  const arr = (data[blk.table] = data[blk.table] || []);
  for (const r of blk.rows) {
    const o = {};
    blk.columns.forEach((c, i) => (o[c] = r[i]));
    arr.push(o);
  }
}

const idSet = (t) => new Set((data[t] || []).map((r) => String(r.id)));
const problems = [];

// duplicate PK check (tables with an id column)
for (const [t, rows] of Object.entries(data)) {
  if (!rows.length || rows[0].id === undefined) continue;
  const seen = new Set();
  let dups = 0;
  for (const r of rows) {
    const k = String(r.id);
    if (seen.has(k)) dups++;
    seen.add(k);
  }
  if (dups) problems.push(`DUP PK: ${t} has ${dups} duplicate id(s)`);
}

// FK integrity: child.col must exist in parent ids (ignoring NULLs)
const FKS = [
  ['companies', 'agency_id', 'agencies'],
  ['services', 'company_id', 'companies'],
  ['users', 'company_id', 'companies'],
  ['leads', 'company_id', 'companies'],
  ['leads', 'service_id', 'services'],
  ['leads', 'status_id', 'lead_statuses'],
  ['leads', 'current_agent_id', 'users'],
  ['lead_statuses', 'company_id', 'companies'],
  ['tags', 'company_id', 'companies'],
  ['contacts', 'company_id', 'companies'],
  ['lead_conversations', 'lead_id', 'leads'],
  ['lead_tags', 'lead_id', 'leads'],
  ['lead_tags', 'tag_id', 'tags'],
  ['reminders', 'lead_id', 'leads'],
  ['message_templates', 'agency_id', 'agencies'],
  ['contact_conversations', 'contact_id', 'contacts'],
];

const summary = [];
for (const [child, col, parent] of FKS) {
  const rows = data[child] || [];
  const parentIds = idSet(parent);
  let orphans = 0;
  for (const r of rows) {
    const v = r[col];
    if (v === null || v === undefined || v === 'NULL' || v === '') continue;
    if (!parentIds.has(String(v))) orphans++;
  }
  summary.push(`${child}.${col} -> ${parent}: ${rows.length} rows, ${orphans} orphan(s)`);
  if (orphans > 0) problems.push(`ORPHAN FK: ${child}.${col} -> ${parent}: ${orphans}`);
}

console.log('=== table row counts ===');
console.log(
  Object.entries(data)
    .map(([t, r]) => `${t}: ${r.length}`)
    .join('\n')
);
console.log('\n=== FK integrity ===');
console.log(summary.join('\n'));
console.log('\n=== result ===');
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(2);
}
console.log('OK: no duplicate PKs, no orphan FKs.');
