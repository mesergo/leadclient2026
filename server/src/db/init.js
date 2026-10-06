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
    // public self-registration: a per-agency signup token
    await ensureColumn('agencies', 'public_token', "public_token CHAR(36) NULL");
    await query('UPDATE agencies SET public_token = UUID() WHERE public_token IS NULL OR public_token = ""');
    // the agency that tokenless /register falls back to
    await ensureColumn('agencies', 'is_default_signup', "is_default_signup TINYINT(1) NOT NULL DEFAULT 0");
    // trial accounts + per-customer quotas (display only; NULL = unlimited)
    await ensureColumn('companies', 'is_trial', "is_trial TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn('companies', 'quota_users', "quota_users INT NULL");
    await ensureColumn('companies', 'quota_numbers', "quota_numbers INT NULL");
    await ensureColumn('companies', 'quota_leads', "quota_leads INT NULL");
    await ensureColumn('companies', 'quota_channels', "quota_channels INT NULL");
    // billing packages: quotas + monthly price + per-quota overage price
    await query(`CREATE TABLE IF NOT EXISTS packages (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      quota_users INT NULL, quota_numbers INT NULL, quota_leads INT NULL, quota_channels INT NULL,
      overage_users DECIMAL(10,2) NULL, overage_numbers DECIMAL(10,2) NULL,
      overage_leads DECIMAL(10,2) NULL, overage_channels DECIMAL(10,2) NULL,
      is_trial_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await ensureColumn('companies', 'package_id', "package_id BIGINT UNSIGNED NULL");
  } catch (e) {
    console.error('ensureSchema:', e.message);
  }
}

module.exports = { ensureSchema, ensureColumn };
