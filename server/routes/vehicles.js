const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');
const { requireAppAuth, requireAppRole } = require('../middleware/appAuth');

const router = express.Router();

// GET /api/vehicles — admin: all vehicles with sticker status for current year
router.get('/', requireSession, async (req, res) => {
  const currentYear = new Date().getFullYear();
  try {
    const result = await query(
      `SELECT v.*, h.full_name AS homeowner_name, h.lot_number, h.block_number,
              vs.id AS sticker_id, vs.status AS sticker_status, vs.sticker_year,
              vs.amount, vs.receipt_number, vs.created_at AS sticker_requested_at
       FROM vehicles v
       JOIN homeowners h ON h.id = v.homeowner_id
       LEFT JOIN vehicle_stickers vs ON vs.vehicle_id = v.id AND vs.sticker_year = $1
       WHERE v.is_active = TRUE
       ORDER BY h.full_name, v.plate_number`,
      [currentYear]
    );
    return res.json({ vehicles: result.rows, current_year: currentYear });
  } catch (err) {
    console.error('List vehicles error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vehicles/mine — homeowner: their own vehicles with sticker info
router.get('/mine', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  const currentYear = new Date().getFullYear();
  try {
    const result = await query(
      `SELECT v.*, vs.id AS sticker_id, vs.status AS sticker_status,
              vs.sticker_year, vs.qr_token, vs.amount, vs.receipt_number,
              vs.review_notes, vs.reviewed_at, vs.created_at AS sticker_requested_at
       FROM vehicles v
       LEFT JOIN vehicle_stickers vs ON vs.vehicle_id = v.id AND vs.sticker_year = $2
       WHERE v.homeowner_id = $1 AND v.is_active = TRUE
       ORDER BY v.created_at DESC`,
      [req.appUser.homeownerId, currentYear]
    );
    return res.json({ vehicles: result.rows, current_year: currentYear });
  } catch (err) {
    console.error('My vehicles error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/vehicles — homeowner: add vehicle
router.post('/', requireAppAuth, requireAppRole('homeowner'),
  [body('plate_number').trim().notEmpty().withMessage('Plate number is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { plate_number, make, model, color, year } = req.body;
    try {
      const result = await query(
        `INSERT INTO vehicles (homeowner_id, plate_number, make, model, color, year)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.appUser.homeownerId, plate_number.toUpperCase().trim(),
         make || null, model || null, color || null, year || null]
      );
      return res.status(201).json({ vehicle: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Plate number already registered' });
      console.error('Add vehicle error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/vehicles/:id — homeowner: edit vehicle
router.put('/:id', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  const { plate_number, make, model, color, year } = req.body;
  try {
    const result = await query(
      `UPDATE vehicles
       SET plate_number = COALESCE($1, plate_number),
           make = $2, model = $3, color = $4, year = $5
       WHERE id = $6 AND homeowner_id = $7 RETURNING *`,
      [plate_number?.toUpperCase().trim() || null, make ?? null,
       model ?? null, color ?? null, year ?? null,
       req.params.id, req.appUser.homeownerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
    return res.json({ vehicle: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Plate number already registered' });
    console.error('Update vehicle error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/vehicles/:id — homeowner: soft delete
router.delete('/:id', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE vehicles SET is_active = FALSE WHERE id = $1 AND homeowner_id = $2 RETURNING id`,
      [req.params.id, req.appUser.homeownerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
    return res.json({ message: 'Vehicle removed' });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
