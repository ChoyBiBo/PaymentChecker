const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');

const router = express.Router();
router.use(requireSession);

// GET /api/announcements
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, au.full_name AS posted_by_name
       FROM announcements a
       LEFT JOIN admin_users au ON au.id = a.posted_by
       WHERE a.expires_at IS NULL OR a.expires_at > NOW()
       ORDER BY a.posted_at DESC`,
      []
    );
    return res.json({ announcements: result.rows });
  } catch (err) {
    console.error('List announcements error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/announcements
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('body').trim().notEmpty().withMessage('Body is required'),
    body('expires_at').optional({ nullable: true }).isISO8601().withMessage('Invalid expiry date'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, body: bodyText, expires_at } = req.body;

    try {
      const result = await query(
        `INSERT INTO announcements (title, body, posted_by, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [title, bodyText, req.session.adminId, expires_at || null]
      );
      return res.status(201).json({ announcement: result.rows[0] });
    } catch (err) {
      console.error('Create announcement error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/announcements/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM announcements WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    return res.json({ message: 'Announcement deleted' });
  } catch (err) {
    console.error('Delete announcement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
