const express = require('express');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');
const { requireAppAuth, requireAppRole } = require('../middleware/appAuth');

const router = express.Router();

// GET /api/vehicle-stickers — admin: all requests with filters
router.get('/', requireSession, async (req, res) => {
  const { status, sticker_year, homeowner_id } = req.query;
  const currentYear = new Date().getFullYear();
  try {
    let sql = `
      SELECT vs.*, v.plate_number, v.make, v.model, v.color, v.year AS vehicle_year,
             h.full_name AS homeowner_name, h.lot_number, h.block_number,
             au.full_name AS reviewed_by_name
      FROM vehicle_stickers vs
      JOIN vehicles v ON v.id = vs.vehicle_id
      JOIN homeowners h ON h.id = vs.homeowner_id
      LEFT JOIN admin_users au ON au.id = vs.reviewed_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (status) { sql += ` AND vs.status = $${idx++}`; params.push(status); }
    if (sticker_year) { sql += ` AND vs.sticker_year = $${idx++}`; params.push(sticker_year); }
    if (homeowner_id) { sql += ` AND vs.homeowner_id = $${idx++}`; params.push(homeowner_id); }
    sql += ' ORDER BY vs.created_at DESC';

    const result = await query(sql, params);
    return res.json({ stickers: result.rows, current_year: currentYear });
  } catch (err) {
    console.error('List stickers error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vehicle-stickers/mine — homeowner: own sticker records
router.get('/mine', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  try {
    const result = await query(
      `SELECT vs.*, v.plate_number, v.make, v.model, v.color, v.year AS vehicle_year
       FROM vehicle_stickers vs
       JOIN vehicles v ON v.id = vs.vehicle_id
       WHERE vs.homeowner_id = $1
       ORDER BY vs.sticker_year DESC, vs.created_at DESC`,
      [req.appUser.homeownerId]
    );
    return res.json({ stickers: result.rows });
  } catch (err) {
    console.error('My stickers error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/vehicle-stickers — homeowner: request sticker (upsert on rejected)
router.post('/', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  const { vehicle_id, sticker_year, amount, receipt_number, image_data } = req.body;
  if (!vehicle_id || !sticker_year) {
    return res.status(400).json({ error: 'vehicle_id and sticker_year are required' });
  }

  try {
    // Verify vehicle belongs to homeowner
    const vCheck = await query(
      'SELECT id FROM vehicles WHERE id = $1 AND homeowner_id = $2 AND is_active = TRUE',
      [vehicle_id, req.appUser.homeownerId]
    );
    if (vCheck.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    // Upsert: if rejected exists, reset to pending; if pending/approved, return 409
    const result = await query(
      `INSERT INTO vehicle_stickers (vehicle_id, homeowner_id, sticker_year, amount, receipt_number, image_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (vehicle_id, sticker_year) DO UPDATE
         SET status = CASE WHEN vehicle_stickers.status = 'rejected' THEN 'pending' ELSE vehicle_stickers.status END,
             amount = COALESCE(EXCLUDED.amount, vehicle_stickers.amount),
             receipt_number = COALESCE(EXCLUDED.receipt_number, vehicle_stickers.receipt_number),
             image_data = COALESCE(EXCLUDED.image_data, vehicle_stickers.image_data),
             review_notes = NULL,
             reviewed_by = NULL,
             reviewed_at = NULL
       RETURNING *`,
      [vehicle_id, req.appUser.homeownerId, sticker_year,
       amount || null, receipt_number || null, image_data || null]
    );

    const sticker = result.rows[0];
    if (sticker.status === 'pending') {
      // Create admin notification
      const vInfo = await query('SELECT plate_number FROM vehicles WHERE id = $1', [vehicle_id]);
      const plate = vInfo.rows[0]?.plate_number || '';
      await query(
        `INSERT INTO notifications (type, title, message, related_type, related_id)
         VALUES ('vehicle_sticker', $1, $2, 'vehicle_sticker', $3)`,
        [
          'Vehicle Sticker Request',
          `${req.appUser.fullName} requested a ${sticker_year} sticker for ${plate}`,
          sticker.id,
        ]
      );
    }

    return res.status(201).json({ sticker });
  } catch (err) {
    console.error('Request sticker error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vehicle-stickers/:id/qr — homeowner: get QR value for approved sticker
router.get('/:id/qr', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  try {
    const result = await query(
      `SELECT qr_token, status, sticker_year FROM vehicle_stickers
       WHERE id = $1 AND homeowner_id = $2`,
      [req.params.id, req.appUser.homeownerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sticker not found' });
    const sticker = result.rows[0];
    if (sticker.status !== 'approved') {
      return res.status(403).json({ error: 'Sticker not yet approved' });
    }
    return res.json({ qr_value: `VEHICLE-${sticker.qr_token}`, sticker_year: sticker.sticker_year });
  } catch (err) {
    console.error('Sticker QR error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vehicle-stickers/:id/image — admin: get submitted receipt image
router.get('/:id/image', requireSession, async (req, res) => {
  try {
    const result = await query(
      'SELECT image_data FROM vehicle_stickers WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ image_data: result.rows[0].image_data });
  } catch (err) {
    console.error('Sticker image error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/vehicle-stickers/:id/approve — admin
router.put('/:id/approve', requireSession, async (req, res) => {
  try {
    const result = await query(
      `UPDATE vehicle_stickers
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 RETURNING *`,
      [req.session.adminId, req.body.review_notes || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sticker not found' });
    return res.json({ sticker: result.rows[0], message: 'Sticker approved' });
  } catch (err) {
    console.error('Approve sticker error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/vehicle-stickers/:id/reject — admin
router.put('/:id/reject', requireSession, async (req, res) => {
  try {
    const result = await query(
      `UPDATE vehicle_stickers
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 RETURNING *`,
      [req.session.adminId, req.body.review_notes || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sticker not found' });
    return res.json({ sticker: result.rows[0], message: 'Sticker rejected' });
  } catch (err) {
    console.error('Reject sticker error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
