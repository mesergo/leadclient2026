// Multi-tenant isolation — the security core (see docs/ARCHITECTURE.md).
// MySQL has no RLS; every business query MUST be scoped through here.

const ROLES = ['super_admin', 'agency_admin', 'company_admin', 'company_user', 'translator'];

// Returns a WHERE fragment { sql, params } restricting `col` (a company_id
// expression) to what `user` may see.
function companyScope(user, col = 'company_id') {
  if (!user || !user.role) return { sql: '0 = 1', params: [] };
  switch (user.role) {
    case 'super_admin':
      return { sql: '1 = 1', params: [] };
    case 'agency_admin':
      return {
        sql: `${col} IN (SELECT id FROM companies WHERE agency_id = ?)`,
        params: [user.agency_id],
      };
    case 'company_admin':
    case 'company_user':
    case 'translator':
      return { sql: `${col} = ?`, params: [user.company_id] };
    default:
      return { sql: '0 = 1', params: [] };
  }
}

// Scope for the `agencies` table itself.
function agencyScope(user, col = 'id') {
  if (!user || !user.role) return { sql: '0 = 1', params: [] };
  if (user.role === 'super_admin') return { sql: '1 = 1', params: [] };
  if (user.role === 'agency_admin') return { sql: `${col} = ?`, params: [user.agency_id] };
  // company roles: only their own agency (via their company)
  return {
    sql: `${col} IN (SELECT agency_id FROM companies WHERE id = ?)`,
    params: [user.company_id],
  };
}

// Whether `user` may write to / access a specific company id (for INSERT/UPDATE guards).
function canAccessCompany(user, companyId) {
  if (!user || !user.role) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'agency_admin') return { needsCheck: 'agency', agency_id: user.agency_id };
  return String(user.company_id) === String(companyId);
}

module.exports = { ROLES, companyScope, agencyScope, canAccessCompany };
