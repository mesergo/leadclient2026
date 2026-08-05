const test = require('node:test');
const assert = require('node:assert');
const { companyScope, agencyScope, canAccessCompany } = require('../src/db/scope');

test('super_admin sees everything', () => {
  const s = companyScope({ role: 'super_admin' });
  assert.strictEqual(s.sql, '1 = 1');
  assert.deepStrictEqual(s.params, []);
});

test('company_user scoped to own company', () => {
  const s = companyScope({ role: 'company_user', company_id: 42 }, 'l.company_id');
  assert.strictEqual(s.sql, 'l.company_id = ?');
  assert.deepStrictEqual(s.params, [42]);
});

test('agency_admin scoped via subquery to agency companies', () => {
  const s = companyScope({ role: 'agency_admin', agency_id: 7 });
  assert.match(s.sql, /IN \(SELECT id FROM companies WHERE agency_id = \?\)/);
  assert.deepStrictEqual(s.params, [7]);
});

test('unknown/no role is denied (0=1)', () => {
  assert.strictEqual(companyScope(null).sql, '0 = 1');
  assert.strictEqual(companyScope({ role: 'x' }).sql, '0 = 1');
});

test('agencyScope: agency_admin only own agency', () => {
  const s = agencyScope({ role: 'agency_admin', agency_id: 3 });
  assert.strictEqual(s.sql, 'id = ?');
  assert.deepStrictEqual(s.params, [3]);
});

test('canAccessCompany: company_user only own company', () => {
  assert.strictEqual(canAccessCompany({ role: 'company_user', company_id: 5 }, 5), true);
  assert.strictEqual(canAccessCompany({ role: 'company_user', company_id: 5 }, 9), false);
  assert.strictEqual(canAccessCompany({ role: 'super_admin' }, 999), true);
});

test('cross-tenant isolation: company A cannot target company B', () => {
  const a = { role: 'company_admin', company_id: 100 };
  assert.strictEqual(canAccessCompany(a, 200), false);
  const s = companyScope(a);
  assert.deepStrictEqual(s.params, [100]); // never leaks other company ids
});

test('agency_admin subquery never uses company_id directly', () => {
  const s = companyScope({ role: 'agency_admin', agency_id: 5 }, 'x.company_id');
  assert.ok(!s.params.includes(undefined));
  assert.strictEqual(s.params.length, 1);
});

test('company scope with custom column expression', () => {
  const s = companyScope({ role: 'company_admin', company_id: 3 }, 'l.company_id');
  assert.strictEqual(s.sql, 'l.company_id = ?');
});

test('translator treated as company-scoped', () => {
  const s = companyScope({ role: 'translator', company_id: 8 });
  assert.deepStrictEqual(s.params, [8]);
});
