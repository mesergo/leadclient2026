// Password strength policy — one source of truth for every place a password is set.
// The client mirrors the same rules (client/src/passwordPolicy.js) for the live checklist;
// the server is authoritative.

const COMMON = new Set([
  '12345678', '123456789', '1234567890', '11111111', '00000000', '12341234', '87654321', '12121212',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'qwerty123', 'qwertyui', 'qwerty12',
  'abcd1234', 'abc12345', 'a1234567', 'aa123456', 'admin123', 'admin1234', 'welcome1', 'iloveyou1',
  'leadclient', 'leadclient1', 'leadclient123', 'shalom123', 'israel123', '1q2w3e4r', 'zaq12wsx',
]);

const RULES = [
  { key: 'length', label: 'לפחות 8 תווים', test: (p) => p.length >= 8 },
  { key: 'letter', label: 'לפחות אות אחת (עברית או אנגלית)', test: (p) => /[A-Za-zא-ת]/.test(p) },
  { key: 'digit', label: 'לפחות ספרה אחת', test: (p) => /\d/.test(p) },
  {
    key: 'personal',
    label: 'לא מכילה את שם המשתמש או כתובת המייל',
    test: (p, ctx) => {
      const lower = p.toLowerCase();
      return personalTokens(ctx).every((t) => !lower.includes(t));
    },
  },
  { key: 'common', label: 'לא סיסמה נפוצה (כמו 12345678 או password1)', test: (p) => !COMMON.has(p.toLowerCase()) },
];

// username, the email's local part and name words — anything 3+ chars a guesser would try first
function personalTokens(ctx = {}) {
  const raw = [ctx.username, ctx.email, ctx.display_name];
  const out = new Set();
  for (const v of raw) {
    if (!v) continue;
    const s = String(v).toLowerCase();
    out.add(s.split('@')[0]);
    s.split(/[\s@._-]+/).forEach((w) => out.add(w));
  }
  return [...out].filter((t) => t.length >= 3);
}

// -> { ok, failed: [{ key, label }] }
function check(password, ctx = {}) {
  const p = String(password || '');
  const failed = RULES.filter((r) => !r.test(p, ctx)).map(({ key, label }) => ({ key, label }));
  return { ok: failed.length === 0, failed };
}

function errorMessage(failed) {
  return 'הסיסמה לא עומדת בכללים: ' + failed.map((f) => f.label).join(', ');
}

// Throws a 400-shaped error when the password is weak (for route handlers).
function assertStrong(password, ctx) {
  const r = check(password, ctx);
  if (!r.ok) throw Object.assign(new Error(errorMessage(r.failed)), { status: 400, expose: true, failed: r.failed });
}

module.exports = { RULES: RULES.map(({ key, label }) => ({ key, label })), check, assertStrong, errorMessage };
