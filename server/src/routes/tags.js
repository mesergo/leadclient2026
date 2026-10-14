const express = require('express');
const { query, companyScope, targetCompanyId, ownsCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const params = [...s.params];
  let extra = '';
  if (req.query.company_id) { extra = ' AND company_id = ?'; params.push(req.query.company_id); }
  const rows = await query(`SELECT id, company_id, label, is_hidden FROM tags WHERE (${s.sql})${extra} ORDER BY label`, params);
  res.json({ tags: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { label } = req.body || {};
  const company_id = targetCompanyId(req.user, (req.body || {}).company_id);
  if (!company_id || !label) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (!(await ownsCompany(req.user, company_id))) return res.status(404).json({ error: 'חברה לא נמצאה' });
  const r = await query('INSERT INTO tags (company_id, label) VALUES (?, ?)', [company_id, label]);
  res.status(201).json({ tag: { id: r.insertId, company_id, label } });
}));

module.exports = router;
