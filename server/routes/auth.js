const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');
const { blockDemoAdmin } = require('../middleware/demoGuard');

const router = express.Router();

// GET /api/auth/mode — public: returns server mode so clients can adjust behavior
router.get('/mode', (req, res) => {
  return res.json({ mode: process.env.NODE_ENV || 'development' });
});

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      const result = await query(
        'SELECT id, username, password_hash, full_name, role, is_active FROM admin_users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(401).json({ error: 'Account is deactivated' });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      await query(
        'UPDATE admin_users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      req.session.adminId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      req.session.fullName = user.full_name;

      // Explicitly save session before responding (required for async stores in production)
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: 'Session error. Please try again.' });
        }
        return res.json({
          user: {
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            role: user.role,
          },
        });
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully' });
  });
});

// GET /api/auth/me
router.get('/me', requireSession, (req, res) => {
  return res.json({
    user: {
      id: req.session.adminId,
      username: req.session.username,
      fullName: req.session.fullName,
      role: req.session.role,
    },
  });
});

// PUT /api/auth/change-password
router.put(
  '/change-password',
  requireSession,
  blockDemoAdmin,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const result = await query(
        'SELECT password_hash FROM admin_users WHERE id = $1',
        [req.session.adminId]
      );

      const user = result.rows[0];
      const match = await bcrypt.compare(currentPassword, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await query(
        'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
        [newHash, req.session.adminId]
      );

      return res.json({ message: 'Password changed successfully' });
    } catch (err) {
      console.error('Change password error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
