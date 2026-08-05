const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const rows = await query('SELECT slug, language, language_english, dir, is_rtl, is_active FROM languages ORDER BY language');
  res.json({ languages: rows });
}));

router.patch('/:slug', requireRole('super_admin'), asyncHandler(async (req, res) => {
  await query('UPDATE languages SET is_active = COALESCE(?, is_active) WHERE slug = ?', [req.body.is_active ?? null, req.params.slug]);
  res.json({ ok: true });
}));

router.get('/:slug/strings', asyncHandler(async (req, res) => {
  const rows = await query('SELECT string_key, string_value FROM translation_strings WHERE lang_slug = ?', [req.params.slug]);
  res.json({ strings: rows });
}));

module.exports = router;
