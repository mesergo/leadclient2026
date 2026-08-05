const express = require('express');
const { query, companyScope, canAccessCompany } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { upload, fileUrl } = require('../services/uploads');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  if (!req.query.company_id) return res.status(400).json({ error: 'חסר company_id' });
  const s = companyScope(req.user, 'company_id');
  const rows = await query(`SELECT id, company_id, file_name, file_url, created_at FROM company_files WHERE company_id = ? AND (${s.sql}) ORDER BY created_at DESC`,
    [req.query.company_id, ...s.params]);
  res.json({ files: rows });
}));

router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  const { company_id } = req.body || {};
  if (!company_id || !req.file) return res.status(400).json({ error: 'חסר קובץ או company_id' });
  if (canAccessCompany(req.user, company_id) === false) return res.status(403).json({ error: 'אין הרשאה לחברה זו' });
  const r = await query('INSERT INTO company_files (company_id, uploaded_by_user_id, file_name, file_url, created_at) VALUES (?, ?, ?, ?, NOW())',
    [company_id, req.user.id, req.file.originalname, fileUrl(req.file.filename)]);
  res.status(201).json({ file: { id: r.insertId, file_url: fileUrl(req.file.filename) } });
}));

module.exports = router;
