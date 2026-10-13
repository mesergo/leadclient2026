// Company-defined "actions" (הצעת מחיר, בירור משלוח…) — quick treatment entries the agent marks
// after a call (the phone's after-call card) or from the lead. A company with none gets defaults.
const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

const DEFAULTS = ['הצעת מחיר', 'בירור משלוח', 'נקבעה פגישה', 'חזרה ללקוח'];
const ADMIN = ['super_admin', 'agency_admin', 'company_admin'];

// The company's actions; creates the defaults the first time a company has none.
async function actionsFor(companyId) {
  let rows = await query('SELECT id, label, sort_order FROM lead_actions WHERE company_id = ? ORDER BY sort_order ASC, id ASC', [companyId]);
  if (!rows.length) {
    const seeded = (await query('SELECT seeded FROM lead_actions_seeded WHERE company_id = ?', [companyId]))[0];
    if (!seeded) {
      await query('INSERT IGNORE INTO lead_actions_seeded (company_id) VALUES (?)', [companyId]);
      for (let i = 0; i < DEFAULTS.length; i++) {
        await query('INSERT INTO lead_actions (company_id, label, sort_order) VALUES (?, ?, ?)', [companyId, DEFAULTS[i], i + 1]);
      }
      rows = await query('SELECT id, label, sort_order FROM lead_actions WHERE company_id = ? ORDER BY sort_order ASC, id ASC', [companyId]);
    }
  }
  return rows;
}

// may this user manage / see this company?
async function canSee(user, companyId) {
  const s = companyScope(user, 'id');
  return (await query(`SELECT id FROM companies WHERE id = ? AND (${s.sql})`, [companyId, ...s.params]))[0];
}

// GET /api/lead-actions?company_id= (company users: their own company)
router.get('/', asyncHandler(async (req, res) => {
  const companyId = Number(req.query.company_id) || req.user.company_id;
  if (!companyId || !(await canSee(req.user, companyId))) return res.json({ actions: [] });
  res.json({ actions: await actionsFor(companyId) });
}));

router.post('/', requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const companyId = Number(req.body && req.body.company_id) || req.user.company_id;
  const label = String((req.body && req.body.label) || '').trim().slice(0, 60);
  if (!companyId || !label) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (!(await canSee(req.user, companyId))) return res.status(404).json({ error: 'חברה לא נמצאה' });
  await actionsFor(companyId); // keep the defaults if this is the first change
  const max = (await query('SELECT COALESCE(MAX(sort_order), 0) m FROM lead_actions WHERE company_id = ?', [companyId]))[0].m;
  const r = await query('INSERT INTO lead_actions (company_id, label, sort_order) VALUES (?, ?, ?)', [companyId, label, max + 1]);
  res.status(201).json({ action: { id: r.insertId, label, sort_order: max + 1 } });
}));

router.patch('/:id', requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const owned = (await query(`SELECT id FROM lead_actions WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]))[0];
  if (!owned) return res.status(404).json({ error: 'פעולה לא נמצאה' });
  const label = req.body && req.body.label != null ? String(req.body.label).trim().slice(0, 60) : null;
  const sort = req.body && req.body.sort_order != null ? Number(req.body.sort_order) : null;
  await query('UPDATE lead_actions SET label = COALESCE(NULLIF(?, \'\'), label), sort_order = COALESCE(?, sort_order) WHERE id = ?', [label, sort, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/:id', requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const s = companyScope(req.user, 'company_id');
  const r = await query(`DELETE FROM lead_actions WHERE id = ? AND (${s.sql})`, [req.params.id, ...s.params]);
  if (!r.affectedRows) return res.status(404).json({ error: 'פעולה לא נמצאה' });
  res.json({ ok: true });
}));

module.exports = router;
module.exports.actionsFor = actionsFor;
