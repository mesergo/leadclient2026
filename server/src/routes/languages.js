const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// Languages list with per-language string + translated counts.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT l.slug, l.language, l.language_english, l.dir, l.is_rtl, l.is_active,
            COUNT(ts.id) AS total,
            SUM(ts.string_value IS NOT NULL AND ts.string_value <> '') AS translated
     FROM languages l
     LEFT JOIN translation_strings ts ON ts.lang_slug = l.slug
     GROUP BY l.slug ORDER BY l.language`);
  res.json({ languages: rows });
}));

router.patch('/:slug', requireRole('super_admin'), asyncHandler(async (req, res) => {
  await query('UPDATE languages SET is_active = COALESCE(?, is_active) WHERE slug = ?', [req.body.is_active ?? null, req.params.slug]);
  res.json({ ok: true });
}));

// Strings for a language, optionally filtered to one namespace (file).
router.get('/:slug/strings', asyncHandler(async (req, res) => {
  const lang = await query('SELECT slug, language FROM languages WHERE slug = ?', [req.params.slug]);
  if (!lang[0]) return res.status(404).json({ error: 'שפה לא נמצאה' });
  const params = [req.params.slug];
  let extra = '';
  if (req.query.namespace) { extra = ' AND namespace = ?'; params.push(req.query.namespace); }
  const rows = await query(
    `SELECT string_key, namespace, string_value FROM translation_strings
     WHERE lang_slug = ?${extra} ORDER BY string_key`, params);
  // Namespaces (files) with counts for the file list.
  const files = await query(
    `SELECT namespace, COUNT(*) total, SUM(string_value IS NOT NULL AND string_value <> '') translated
     FROM translation_strings WHERE lang_slug = ? GROUP BY namespace ORDER BY namespace`, [req.params.slug]);
  res.json({ language: lang[0], files, strings: rows });
}));

// Bulk upsert edited strings for a language.
router.put('/:slug/strings', requireRole('super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.strings) ? req.body.strings : [];
  for (const it of items) {
    if (!it || !it.string_key) continue;
    const ns = it.namespace ?? (it.string_key.includes('.') ? it.string_key.split('.')[0] : 'general');
    await query(
      `INSERT INTO translation_strings (lang_slug, string_key, namespace, string_value)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE string_value = VALUES(string_value)`,
      [req.params.slug, it.string_key, ns, it.string_value ?? '']);
  }
  res.json({ ok: true, saved: items.length });
}));

module.exports = router;
