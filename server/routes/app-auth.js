const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireAppAuth } = require('../middleware/appAuth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      homeownerId: user.homeowner_id || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// POST /api/app/auth/login
router.post(
  '/login',
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Username and password required' });

    const { username, password } = req.body;

    try {
      const result = await query(
        `SELECT au.*, h.full_name AS homeowner_name
         FROM app_users au
         LEFT JOIN homeowners h ON h.id = au.homeowner_id
         WHERE au.username = $1`,
        [username]
      );

      if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid username or password' });

      const user = result.rows[0];
      if (!user.is_active) return res.status(401).json({ error: 'Account is deactivated' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Invalid username or password' });

      await query('UPDATE app_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      const token = signToken(user);
      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
          homeownerId: user.homeowner_id,
        },
      });
    } catch (err) {
      console.error('App login error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/app/auth/me
router.get('/me', requireAppAuth, (req, res) => {
  res.json({ user: req.appUser });
});

module.exports = router;
