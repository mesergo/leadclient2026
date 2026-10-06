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

// run a step independently so one failure never blocks the rest
async function safe(label, fn) {
  try { await fn(); } catch (e) { console.error(`ensureSchema[${label}]:`, e.message); }
}

async function ensureSchema() {
  // call lifecycle for phone leads: active -> answered | missed
  await safe('leads.call_status', () => ensureColumn('leads', 'call_status', "call_status VARCHAR(12) NULL"));
  // when a user's phone was verified via OTP (enables phone login)
  await safe('users.phone_verified_at', () => ensureColumn('users', 'phone_verified_at', "phone_verified_at DATETIME NULL"));
  // public self-registration: a per-agency signup token
  await safe('agencies.public_token', async () => {
    await ensureColumn('agencies', 'public_token', "public_token CHAR(36) NULL");
    await query('UPDATE agencies SET public_token = UUID() WHERE public_token IS NULL OR public_token = ""');
  });
  // the agency that tokenless /register falls back to
  await safe('agencies.is_default_signup', () => ensureColumn('agencies', 'is_default_signup', "is_default_signup TINYINT(1) NOT NULL DEFAULT 0"));
  // trial accounts + per-customer quotas (display only; NULL = unlimited)
  await safe('companies.is_trial', () => ensureColumn('companies', 'is_trial', "is_trial TINYINT(1) NOT NULL DEFAULT 0"));
  await safe('companies.quota_users', () => ensureColumn('companies', 'quota_users', "quota_users INT NULL"));
  await safe('companies.quota_numbers', () => ensureColumn('companies', 'quota_numbers', "quota_numbers INT NULL"));
  await safe('companies.quota_leads', () => ensureColumn('companies', 'quota_leads', "quota_leads INT NULL"));
  await safe('companies.quota_channels', () => ensureColumn('companies', 'quota_channels', "quota_channels INT NULL"));
  await safe('companies.package_id', () => ensureColumn('companies', 'package_id', "package_id BIGINT UNSIGNED NULL"));
  // billing packages: quotas + monthly price + per-quota overage price
  await safe('packages.table', () => query(`CREATE TABLE IF NOT EXISTS packages (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      quota_users INT NULL, quota_numbers INT NULL, quota_leads INT NULL, quota_channels INT NULL,
      overage_users DECIMAL(10,2) NULL, overage_numbers DECIMAL(10,2) NULL,
      overage_leads DECIMAL(10,2) NULL, overage_channels DECIMAL(10,2) NULL,
      is_trial_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
  await safe('packages.seed', seedPackages);
  // which languages appear in the UI language picker
  await safe('languages.in_menu', () => ensureColumn('languages', 'in_menu', "in_menu TINYINT(1) NOT NULL DEFAULT 1"));
}

// Seed starter packages once (only when the table is empty). NULL quota = unlimited.
async function seedPackages() {
  const [{ c }] = await query('SELECT COUNT(*) c FROM packages');
  if (c > 0) return;
  const rows = [
    // name, monthly, users, numbers, leads, channels, ov_users, ov_numbers, ov_leads, ov_channels, trial_default
    ['חבילת ניסיון', 0, 1, 0, 100, 3, null, null, null, null, 1],
    ['חבילת בסיס', 69, 2, 1, 500, null, null, 19, null, null, 0],
    ['חבילה לעסק', 99, 5, 1, null, null, null, null, null, null, 0],
    ["חבילת ג'מבו", 249, null, 5, null, null, null, null, null, null, 0],
  ];
  for (const r of rows) {
    await query(
      `INSERT INTO packages (name, monthly_price, quota_users, quota_numbers, quota_leads, quota_channels,
         overage_users, overage_numbers, overage_leads, overage_channels, is_trial_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, r);
  }
  console.log('seeded starter packages');
}

module.exports = { ensureSchema, ensureColumn };
