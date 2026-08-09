const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { issueToken } = require('../services/authService');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'חסר שם משתמש או סיסמה' });
    const rows = await query(
      'SELECT id, username, display_name, role, company_id, agency_id, password_hash, is_active FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    const user = rows[0];
    if (!user || !user.is_active || !user.password_hash) {
      return res.status(401).json({ error: 'פרטי התחברות שגויים' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'פרטי התחברות שגויים' });
    // agency_admin scope needs agency_id; legacy users often have it blank — derive from their company.
    if (user.role === 'agency_admin' && !user.agency_id && user.company_id) {
      const c = await query('SELECT agency_id FROM companies WHERE id = ?', [user.company_id]);
      if (c[0]) user.agency_id = c[0].agency_id;
    }
    const token = issueToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.display_name || user.username, role: user.role, company_id: user.company_id, agency_id: user.agency_id },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id, username, display_name, email, role, company_id, agency_id, language FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'משתמש לא נמצא' });
    res.json({ user: { ...rows[0], impersonated_by: req.user.impersonated_by } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
