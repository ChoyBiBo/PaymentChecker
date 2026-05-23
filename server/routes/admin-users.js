const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireSession);

// GET /api/admin-users  (superadmin only)
router.get('/', requireRole('superadmin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, full_name, role, is_active, created_at, last_login_at
       FROM admin_users ORDER BY created_at ASC`,
      []
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('List admin users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin-users  (superadmin only)
router.post(
  '/',
  requireRole('superadmin'),
  [
    body('username').trim().notEmpty().isLength({ min: 3 }),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['superadmin', 'staff']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, full_name, role } = req.body;

    try {
      const hash = await bcrypt.hash(password, 12);
      const result = await query(
        `INSERT INTO admin_users (username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, full_name, role, is_active, created_at`,
        [username, hash, full_name || null, role]
      );
      return res.status(201).json({ user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Username already exists' });
      }
      console.error('Create admin user error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/admin-users/:id/toggle-active  (superadmin only)
router.put('/:id/toggle-active', requireRole('superadmin'), async (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.session.adminId) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  try {
    const result = await query(
      `UPDATE admin_users SET is_active = NOT is_active WHERE id = $1
       RETURNING id, username, is_active`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Toggle admin user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin-users/audit-log  (superadmin only)
router.get('/audit-log', requireRole('superadmin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT al.*, au.username AS admin_username
       FROM audit_log al
       LEFT JOIN admin_users au ON au.id = al.admin_id
       ORDER BY al.performed_at DESC
       LIMIT 100`,
      []
    );
    return res.json({ logs: result.rows });
  } catch (err) {
    console.error('Audit log error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
