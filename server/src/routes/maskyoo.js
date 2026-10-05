const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const maskyoo = require('../services/maskyoo');

const router = express.Router();
// allow ?token= so these can be opened directly in the browser for testing
router.use((req, res, next) => { if (!req.headers.authorization && req.query.token) req.headers.authorization = `Bearer ${req.query.token}`; next(); });
router.use(requireAuth, requireRole('super_admin'));

// 1) auth + IP connectivity check
router.get('/test', asyncHandler(async (req, res) => res.json(await maskyoo.call('test'))));

// 2) read a number's settings:  GET /api/maskyoo/number/0776670000
router.get('/number/:num', asyncHandler(async (req, res) => res.json(await maskyoo.call('get_maskyoo', { maskyoo: req.params.num }))));

// 3) edit a number:  PATCH /api/maskyoo/number/0776670000  { ...fields }
router.patch('/number/:num', asyncHandler(async (req, res) =>
  res.json(await maskyoo.call('update_maskyoo', { maskyoo: req.params.num, ...(req.body || {}) }, 'POST'))));

// generic passthrough for exploring other services: GET /api/maskyoo/call?service=get_available_maskyoo
router.get('/call', asyncHandler(async (req, res) => {
  const { service, ...params } = req.query;
  if (!service) return res.status(400).json({ error: 'missing service' });
  res.json(await maskyoo.call(service, params));
}));

module.exports = router;
