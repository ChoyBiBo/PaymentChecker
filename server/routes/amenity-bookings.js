const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');
const { requireAppAuth, requireAppRole } = require('../middleware/appAuth');
const { blockDemoAdmin } = require('../middleware/demoGuard');

const router = express.Router();

// GET /api/amenity-bookings — admin list all bookings
router.get('/', requireSession, async (req, res) => {
  const { status, amenity_id } = req.query;
  try {
    let sql = `
      SELECT ab.*, a.name AS amenity_name, h.full_name AS homeowner_name,
             h.lot_number, h.block_number,
             au.full_name AS reviewed_by_name
      FROM amenity_bookings ab
      JOIN amenities a ON a.id = ab.amenity_id
      JOIN homeowners h ON h.id = ab.homeowner_id
      LEFT JOIN admin_users au ON au.id = ab.reviewed_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (status) { sql += ` AND ab.status = $${idx++}`; params.push(status); }
    if (amenity_id) { sql += ` AND ab.amenity_id = $${idx++}`; params.push(amenity_id); }
    sql += ' ORDER BY ab.created_at DESC';

    const result = await query(sql, params);
    return res.json({ bookings: result.rows });
  } catch (err) {
    console.error('List bookings error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/amenity-bookings — homeowner submits request (via app JWT)
router.post('/', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  const { amenity_id, requested_date, time_start, time_end, purpose } = req.body;

  if (!amenity_id || !requested_date || !time_start || !time_end) {
    return res.status(400).json({ error: 'amenity_id, requested_date, time_start, time_end are required' });
  }

  if (time_start >= time_end) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }

  try {
    // Only "updated" homeowners (current month dues paid) may book amenities
    const nowDate = new Date();
    const curYear = nowDate.getFullYear();
    const curMonth = nowDate.getMonth() + 1;
    const payCheck = await query(
      'SELECT id FROM dues_payments WHERE homeowner_id = $1 AND period_year = $2 AND period_month = $3',
      [req.appUser.homeownerId, curYear, curMonth]
    );
    if (payCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Your account must be updated (current month dues paid) to book amenities.' });
    }

    // Check for conflicting approved bookings
    const conflict = await query(
      `SELECT id FROM amenity_bookings
       WHERE amenity_id = $1 AND requested_date = $2 AND status = 'approved'
         AND time_start < $4 AND time_end > $3`,
      [amenity_id, requested_date, time_start, time_end]
    );

    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: 'This amenity is already booked for that time slot' });
    }

    const result = await query(
      `INSERT INTO amenity_bookings
        (amenity_id, homeowner_id, app_user_id, requested_date, time_start, time_end, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        amenity_id, req.appUser.homeownerId, req.appUser.userId,
        requested_date, time_start, time_end, purpose || null,
      ]
    );

    const booking = result.rows[0];

    // Get amenity name for notification
    const amenityRes = await query('SELECT name FROM amenities WHERE id = $1', [amenity_id]);
    const amenityName = amenityRes.rows[0]?.name || 'Amenity';

    // Create admin notification
    await query(
      `INSERT INTO notifications (type, title, message, related_type, related_id)
       VALUES ('amenity_request', $1, $2, 'amenity_booking', $3)`,
      [
        'New Amenity Request',
        `${req.appUser.fullName} requested ${amenityName} on ${requested_date} ${time_start}–${time_end}`,
        booking.id,
      ]
    );

    return res.status(201).json({ booking });
  } catch (err) {
    console.error('Create booking error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/amenity-bookings/mine — homeowner's own requests
router.get('/mine', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  try {
    const result = await query(
      `SELECT ab.*, a.name AS amenity_name, a.location
       FROM amenity_bookings ab
       JOIN amenities a ON a.id = ab.amenity_id
       WHERE ab.homeowner_id = $1
       ORDER BY ab.requested_date DESC, ab.time_start DESC
       LIMIT 30`,
      [req.appUser.homeownerId]
    );
    return res.json({ bookings: result.rows });
  } catch (err) {
    console.error('My bookings error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/amenity-bookings/:id/approve — admin approves
router.put('/:id/approve', requireSession, blockDemoAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE amenity_bookings
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 RETURNING *`,
      [req.session.adminId, req.body.review_notes || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    return res.json({ booking: result.rows[0], message: 'Booking approved' });
  } catch (err) {
    console.error('Approve booking error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/amenity-bookings/:id/reject — admin rejects
router.put('/:id/reject', requireSession, blockDemoAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE amenity_bookings
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 RETURNING *`,
      [req.session.adminId, req.body.review_notes || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    return res.json({ booking: result.rows[0], message: 'Booking rejected' });
  } catch (err) {
    console.error('Reject booking error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
