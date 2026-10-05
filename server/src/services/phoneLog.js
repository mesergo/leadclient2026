// Per-number change log: assignments, transfers between companies, edits.
// Auto-creates its table (idempotent) so no manual migration is needed.
const { query } = require('../db/pool');

let ready = false;
async function ensure() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS phone_number_log (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    phone_number_id BIGINT UNSIGNED NOT NULL,
    action          VARCHAR(20) NOT NULL,
    from_company_id BIGINT UNSIGNED NULL,
    to_company_id   BIGINT UNSIGNED NULL,
    service_id      BIGINT UNSIGNED NULL,
    user_id         BIGINT UNSIGNED NULL,
    user_name       VARCHAR(120) NULL,
    note            VARCHAR(255) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pnl_number (phone_number_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ready = true;
}

// action: created | assigned | transferred | unassigned | updated | deleted
async function logPhone(numberId, action, o = {}) {
  if (!numberId) return;
  try {
    await ensure();
    await query(
      `INSERT INTO phone_number_log (phone_number_id, action, from_company_id, to_company_id, service_id, user_id, user_name, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [numberId, action, o.fromCompanyId || null, o.toCompanyId || null, o.serviceId || null,
        o.userId || null, (o.userName || '').slice(0, 120) || null, (o.note || '').slice(0, 255) || null]);
  } catch (e) { /* logging must never break the main action */ }
}

// derive the right action from an old->new company change
function companyChangeAction(oldC, newC) {
  const a = oldC || null, b = newC || null;
  if (a === b) return null;
  if (!a && b) return 'assigned';
  if (a && !b) return 'unassigned';
  return 'transferred';
}

module.exports = { ensure, logPhone, companyChangeAction };
