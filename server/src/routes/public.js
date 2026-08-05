const express = require('express');
const { query } = require('../db/pool');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

// public lead intake by service hash (embed widget). No auth.
router.post('/leads/service/:hash', asyncHandler(async (req, res) => {
  const svc = await query('SELECT id, company_id FROM services WHERE public_hash = ? LIMIT 1', [req.params.hash]);
  if (!svc[0]) return res.status(404).json({ error: 'no_channel_id' });
  const { name, phone, email } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'missing_phone' });
  await query('INSERT INTO leads (company_id, service_id, lead_name, lead_phone, lead_email, lead_through, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [svc[0].company_id, svc[0].id, name || null, phone, email || null, 'widget']);
  res.status(201).json({ ok: true });
}));

// intake by company token — picks company's earliest service
router.post('/leads/company/:token', asyncHandler(async (req, res) => {
  const co = await query('SELECT id FROM companies WHERE public_token = ? LIMIT 1', [req.params.token]);
  if (!co[0]) return res.status(404).json({ error: 'no_company' });
  const svc = await query('SELECT id FROM services WHERE company_id = ? ORDER BY created_at ASC LIMIT 1', [co[0].id]);
  if (!svc[0]) return res.status(404).json({ error: 'no_channel_id' });
  const { name, phone, email } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'missing_phone' });
  await query('INSERT INTO leads (company_id, service_id, lead_name, lead_phone, lead_email, lead_through, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [co[0].id, svc[0].id, name || null, phone, email || null, 'widget']);
  res.status(201).json({ ok: true });
}));

module.exports = router;
