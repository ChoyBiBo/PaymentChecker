const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession, requireRole } = require('../middleware/auth');
const { blockDemoAdmin } = require('../middleware/demoGuard');

const router = express.Router();
router.use(requireSession);

// GET /api/app-users
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT au.id, au.username, au.full_name, au.role, au.is_active,
              au.created_at, au.last_login_at,
              au.homeowner_id, h.full_name AS homeowner_name,
              h.lot_number, h.block_number
       FROM app_users au
       LEFT JOIN homeowners h ON h.id = au.homeowner_id
       ORDER BY au.role, au.created_at DESC`,
      []
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('List app users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app-users
router.post(
  '/',
  blockDemoAdmin,
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username min 3 chars'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
    body('role').isIn(['homeowner', 'guard']).withMessage('Role must be homeowner or guard'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, full_name, role, homeowner_id } = req.body;

    if (role === 'homeowner' && !homeowner_id) {
      return res.status(400).json({ error: 'homeowner_id is required for homeowner role' });
    }

    try {
      const hash = await bcrypt.hash(password, 12);
      const result = await query(
        `INSERT INTO app_users (username, password_hash, full_name, role, homeowner_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, full_name, role, is_active, homeowner_id, created_at`,
        [username, hash, full_name || null, role, homeowner_id || null]
      );
      return res.status(201).json({ user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
      console.error('Create app user error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/app-users/:id/toggle-active — superadmin only
router.put('/:id/toggle-active', requireRole('superadmin'), blockDemoAdmin, async (req, res) => {
  try {
    const result = await query(
      'UPDATE app_users SET is_active = NOT is_active WHERE id = $1 RETURNING id, username, is_active',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Toggle app user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/app-users/:id/reset-password — superadmin only
router.put('/:id/reset-password', requireRole('superadmin'), blockDemoAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
