const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession, requireRole } = require('../middleware/auth');
const { blockDemoAdmin } = require('../middleware/demoGuard');

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
  blockDemoAdmin,
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
router.put('/:id/toggle-active', requireRole('superadmin'), blockDemoAdmin, async (req, res) => {
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

// GET /api/admin-users/active-sessions  (superadmin only)
router.get('/active-sessions', requireRole('superadmin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT sid, sess, expire FROM session WHERE expire > NOW() ORDER BY expire ASC`,
      []
    );
    const sessions = result.rows
      .map(row => ({
        sid: row.sid,
        username: row.sess.username || null,
        fullName: row.sess.fullName || null,
        role: row.sess.role || null,
        adminId: row.sess.adminId || null,
        expiresAt: row.expire,
        isCurrentSession: row.sid === req.sessionID,
      }))
      .filter(s => s.adminId);
    return res.json({ sessions });
  } catch (err) {
    console.error('Active sessions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin-users/active-sessions/:sid  (superadmin only)
router.delete('/active-sessions/:sid', requireRole('superadmin'), blockDemoAdmin, async (req, res) => {
  const { sid } = req.params;
  if (sid === req.sessionID) {
    return res.status(400).json({ error: 'Cannot revoke your own session' });
  }
  try {
    const result = await query(
      `DELETE FROM session WHERE sid = $1 RETURNING sid`,
      [sid]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or already expired' });
    }
    return res.json({ message: 'Session revoked' });
  } catch (err) {
    console.error('Revoke session error:', err);
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
