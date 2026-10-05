// Idempotent schema touch-ups run once at startup, so columns the app relies on
// exist even on databases created before they were added (no manual migration).
const { query } = require('./pool');

async function ensureColumn(table, column, ddl) {
  const r = await query(
    `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column]);
  if (!r[0]) await query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
}

async function ensureSchema() {
  try {
    // call lifecycle for phone leads: active -> answered | missed
    await ensureColumn('leads', 'call_status', "call_status VARCHAR(12) NULL");
    // when a user's phone was verified via OTP (enables phone login)
    await ensureColumn('users', 'phone_verified_at', "phone_verified_at DATETIME NULL");
  } catch (e) {
    console.error('ensureSchema:', e.message);
  }
}

module.exports = { ensureSchema, ensureColumn };
