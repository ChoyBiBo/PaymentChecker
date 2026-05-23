const express = require('express');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');

const router = express.Router();
router.use(requireSession);

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`,
      []
    );
    const unread = result.rows.filter(n => !n.is_read).length;
    return res.json({ notifications: result.rows, unread_count: unread });
  } catch (err) {
    console.error('Notifications error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE', []);
    return res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Read all notifications error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [req.params.id]);
    return res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Read notification error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
