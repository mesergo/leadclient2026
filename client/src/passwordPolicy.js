// Mirror of server/src/services/passwordPolicy.js — drives the live checklist.
// The server is authoritative; keep the two rule lists in sync.

const COMMON = new Set([
  '12345678', '123456789', '1234567890', '11111111', '00000000', '12341234', '87654321', '12121212',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'qwerty123', 'qwertyui', 'qwerty12',
  'abcd1234', 'abc12345', 'a1234567', 'aa123456', 'admin123', 'admin1234', 'welcome1', 'iloveyou1',
  'leadclient', 'leadclient1', 'leadclient123', 'shalom123', 'israel123', '1q2w3e4r', 'zaq12wsx',
]);

function personalTokens(ctx = {}) {
  const out = new Set();
  for (const v of [ctx.username, ctx.email, ctx.display_name]) {
    if (!v) continue;
    const s = String(v).toLowerCase();
    out.add(s.split('@')[0]);
    s.split(/[\s@._-]+/).forEach((w) => out.add(w));
  }
  return [...out].filter((t) => t.length >= 3);
}

export const PASSWORD_RULES = [
  { key: 'length', test: (p) => p.length >= 8 },
  { key: 'letter', test: (p) => /[A-Za-zא-ת]/.test(p) },
  { key: 'digit', test: (p) => /\d/.test(p) },
  { key: 'personal', test: (p, ctx) => personalTokens(ctx).every((t) => !p.toLowerCase().includes(t)) },
  { key: 'common', test: (p) => !COMMON.has(p.toLowerCase()) },
];

// -> [{ key, ok }]
export function checkPassword(password, ctx) {
  const p = String(password || '');
  return PASSWORD_RULES.map((r) => ({ key: r.key, ok: r.test(p, ctx) }));
}

export const isStrongPassword = (password, ctx) => checkPassword(password, ctx).every((r) => r.ok);
