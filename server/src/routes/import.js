const express = require('express');
const { query, canAccessCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// bulk import of already-parsed rows: { company_id, service_id, rows:[{name,phone,email}] }
router.post('/', asyncHandler(async (req, res) => {
  const { company_id, service_id, rows } = req.body || {};
  if (!company_id || !Array.isArray(rows)) return res.status(400).json({ error: 'קלט לא תקין' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  let ok = 0, failed = 0;
  for (const r of rows) {
    if (!r.phone) { failed++; continue; }
    try {
      await query('INSERT INTO leads (company_id, service_id, lead_name, lead_phone, lead_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [company_id, service_id || null, r.name || null, r.phone, r.email || null]);
      ok++;
    } catch { failed++; }
  }
  res.json({ success: ok, failed, total: rows.length });
}));

module.exports = router;
