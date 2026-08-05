const express = require('express');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT id, content, lead_id, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
    [req.user.id]);
  const [unread] = await query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ notifications: rows, unread: unread.n });
}));

router.post('/read', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
