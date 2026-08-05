// Generates db/seed-admin.sql — a super_admin with a bcrypt password so the new
// app can actually log in (legacy passwords are MD5-crypt, incompatible).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERNAME = process.env.ADMIN_USER || 'admin';
const PASSWORD = process.env.ADMIN_PASS || 'admin1234';
const hash = bcrypt.hashSync(PASSWORD, 10);
const SQ = String.fromCharCode(39);
const q = (s) => SQ + String(s).split(SQ).join(SQ + SQ) + SQ;

const sql = `-- Admin login seed (bcrypt). Username: ${USERNAME}
INSERT INTO users (username, role, display_name, password_hash, is_active, created_at)
VALUES (${q(USERNAME)}, 'super_admin', 'System Admin', ${q(hash)}, 1, NOW())
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'super_admin', is_active = 1;
`;
fs.writeFileSync(path.resolve(__dirname, '../seed-admin.sql'), sql);
console.log(`Wrote db/seed-admin.sql — login: ${USERNAME} / ${PASSWORD}`);
