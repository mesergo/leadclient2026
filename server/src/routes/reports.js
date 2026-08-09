const express = require('express');
const { query, companyScope } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// Company-activity report: leads per channel, a channel×status matrix,
// device breakdown, and a (currently empty) campaigns table — mirroring the
// legacy /reports screen.
router.get('/', asyncHandler(async (req, res) => {
  const { company_id, start, end } = req.query;
  if (!company_id) return res.json({ company: null, channels: [], statusCols: [], matrix: [], colTotals: {}, total: 0, devices: [], campaigns: [] });

  const s = companyScope(req.user, 'id');
  const owned = await query(`SELECT id, name FROM companies WHERE id = ? AND (${s.sql})`, [company_id, ...s.params]);
  if (!owned[0]) return res.status(404).json({ error: 'חברה לא נמצאה' });

  const dateParams = [];
  let dateSql = '';
  if (start) { dateSql += ' AND created_at >= ?'; dateParams.push(start + ' 00:00:00'); }
  if (end) { dateSql += ' AND created_at <= ?'; dateParams.push(end + ' 23:59:59'); }

  const statuses = await query('SELECT id, text FROM lead_statuses WHERE company_id = ? ORDER BY sort_order, id', [company_id]);
  const channels = await query('SELECT id, name FROM services WHERE company_id = ? ORDER BY name', [company_id]);
  const grouped = await query(
    `SELECT service_id, status_id, COUNT(*) n FROM leads WHERE company_id = ?${dateSql} GROUP BY service_id, status_id`,
    [company_id, ...dateParams]);
  const devices = await query(
    `SELECT COALESCE(NULLIF(platform,''), 'לא ידוע') AS platform, COUNT(*) n FROM leads WHERE company_id = ?${dateSql} GROUP BY platform ORDER BY n DESC`,
    [company_id, ...dateParams]);

  const NO_STATUS = 'none';
  const statusCols = statuses.map((st) => ({ key: String(st.id), label: st.text }));
  let hasNoStatus = false;
  const rowMap = new Map();
  const channelName = new Map(channels.map((c) => [String(c.id), c.name]));
  const rowFor = (svcId) => {
    const key = svcId == null ? 'none' : String(svcId);
    if (!rowMap.has(key)) rowMap.set(key, { service_id: svcId, name: svcId == null ? 'ללא ערוץ' : (channelName.get(String(svcId)) || '—'), counts: {}, total: 0 });
    return rowMap.get(key);
  };
  for (const g of grouped) {
    const row = rowFor(g.service_id);
    const sk = g.status_id == null ? NO_STATUS : String(g.status_id);
    if (g.status_id == null) hasNoStatus = true;
    row.counts[sk] = (row.counts[sk] || 0) + Number(g.n);
    row.total += Number(g.n);
  }
  for (const c of channels) rowFor(c.id); // ensure 0-lead channels still show

  const cols = [...statusCols];
  if (hasNoStatus) cols.push({ key: NO_STATUS, label: 'ללא סטטוס' });

  const matrix = [...rowMap.values()].sort((a, b) => b.total - a.total);
  const total = matrix.reduce((acc, r) => acc + r.total, 0);
  const colTotals = {};
  for (const c of cols) colTotals[c.key] = matrix.reduce((acc, r) => acc + (r.counts[c.key] || 0), 0);

  res.json({ company: owned[0], channels, statusCols: cols, matrix, colTotals, total, devices, campaigns: [] });
}));

module.exports = router;
