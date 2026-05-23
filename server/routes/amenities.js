const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

// GET /api/amenities — public for app, also used by admin
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const timeNow = now.toTimeString().slice(0, 5); // HH:MM

    const result = await query(
      `SELECT
        a.*,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM amenity_bookings ab
            WHERE ab.amenity_id = a.id
              AND ab.status = 'approved'
              AND ab.requested_date = $1
              AND ab.time_start <= $2
              AND ab.time_end > $2
          ) THEN 'in_use'
          ELSE 'available'
        END AS current_status,
        (SELECT COUNT(*) FROM amenity_bookings ab
         WHERE ab.amenity_id = a.id AND ab.status = 'pending') AS pending_requests
       FROM amenities a
       WHERE a.is_active = TRUE
       ORDER BY a.name`,
      [today, timeNow]
    );

    return res.json({ amenities: result.rows });
  } catch (err) {
    console.error('List amenities error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/amenities/:id/schedule — upcoming approved bookings for an amenity
router.get('/:id/schedule', async (req, res) => {
  const { date } = req.query;
  const filterDate = date || new Date().toISOString().split('T')[0];
  try {
    const result = await query(
      `SELECT requested_date, time_start, time_end, purpose
       FROM amenity_bookings
       WHERE amenity_id = $1
         AND status = 'approved'
         AND requested_date >= $2
       ORDER BY requested_date, time_start
       LIMIT 30`,
      [req.params.id, filterDate]
    );
    return res.json({ bookings: result.rows });
  } catch (err) {
    console.error('Schedule error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// All routes below require admin session
router.use(requireSession);

// POST /api/amenities
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, location, capacity } = req.body;
    try {
      const result = await query(
        `INSERT INTO amenities (name, description, location, capacity)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, description || null, location || null, capacity || null]
      );
      return res.status(201).json({ amenity: result.rows[0] });
    } catch (err) {
      console.error('Create amenity error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/amenities/:id
router.put('/:id', async (req, res) => {
  const { name, description, location, capacity, is_active } = req.body;
  try {
    const result = await query(
      `UPDATE amenities
       SET name = COALESCE($1, name),
           description = $2,
           location = $3,
           capacity = $4,
           is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [name || null, description ?? null, location ?? null, capacity ?? null, is_active ?? null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Amenity not found' });
    return res.json({ amenity: result.rows[0] });
  } catch (err) {
    console.error('Update amenity error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/amenities/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'UPDATE amenities SET is_active = FALSE WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Amenity not found' });
    return res.json({ message: 'Amenity deactivated' });
  } catch (err) {
    console.error('Delete amenity error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
