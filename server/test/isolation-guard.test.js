const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROUTES = path.resolve(__dirname, '../src/routes');
// routers that legitimately do NOT use company/agency scope:
const EXEMPT = new Set(['auth.js', 'public.js', 'profile.js', 'notifications.js', 'languages.js', 'index.js']);
const SCOPE_RE = /(companyScope|agencyScope|canAccessCompany)/;

test('every business router enforces tenant scope', () => {
  const files = fs.readdirSync(ROUTES).filter((f) => f.endsWith('.js'));
  const offenders = [];
  for (const f of files) {
    if (EXEMPT.has(f)) continue;
    const src = fs.readFileSync(path.join(ROUTES, f), 'utf8');
    if (!SCOPE_RE.test(src)) offenders.push(f);
  }
  assert.deepStrictEqual(offenders, [], `routers missing tenant scope: ${offenders.join(', ')}`);
});

test('profile/notifications scope by req.user.id (not cross-user)', () => {
  for (const f of ['profile.js', 'notifications.js']) {
    const src = fs.readFileSync(path.join(ROUTES, f), 'utf8');
    assert.match(src, /req\.user\.id/, `${f} must scope queries to req.user.id`);
  }
});

test('no business router omits requireAuth', () => {
  const files = fs.readdirSync(ROUTES).filter((f) => f.endsWith('.js') && f !== 'index.js' && f !== 'public.js');
  const missing = files.filter((f) => !/requireAuth/.test(fs.readFileSync(path.join(ROUTES, f), 'utf8')));
  assert.deepStrictEqual(missing, [], `routers missing requireAuth: ${missing.join(', ')}`);
});
