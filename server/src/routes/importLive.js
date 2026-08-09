const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const live = require('../services/liveImport');

const router = express.Router();
router.use(requireAuth, requireRole('super_admin'));

router.get('/config', asyncHandler(async (req, res) => res.json({ config: await live.getConfig() })));

router.post('/config', asyncHandler(async (req, res) => {
  const { host, port, user, password, database } = req.body || {};
  if (!host || !user || !database) return res.status(400).json({ error: 'חסרים פרטי חיבור' });
  const config = await live.saveConfig({ host, port, user, password, database });
  res.json({ ok: true, config });
}));

router.post('/test', asyncHandler(async (req, res) => {
  const { host, port, user, password, database } = req.body || {};
  try { res.json({ ok: true, counts: await live.testConnection(host ? { host, port, user, password, database } : null) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));

router.post('/sync', asyncHandler(async (req, res) => {
  try { res.json({ ok: true, job: live.sync() }); }
  catch (e) { res.status(409).json({ error: e.message }); }
}));

router.get('/status', asyncHandler(async (req, res) => res.json(live.status())));

module.exports = router;
