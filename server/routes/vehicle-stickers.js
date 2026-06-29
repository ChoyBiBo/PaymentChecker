const express = require('express');
const crypto = require('crypto');
const { query, pool } = require('../db');
const { requireSession } = require('../middleware/auth');
const { blockDemoAdmin, blockDemoAppUser } = require('../middleware/demoGuard');
const { requireAppAuth, requireAppRole } = require('../middleware/appAuth');

function dailyQrValue(stickerId) {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
  const secret = process.env.QR_DAILY_SECRET || process.env.JWT_SECRET || 'fallback-secret';
  const hmac = crypto.createHmac('sha256', secret)
    .update(`${stickerId}:${today}`)
    .digest('hex')
    .slice(0, 16);
  return `HOA-${stickerId}-${today}-${hmac}`;
}

const router = express.Router();

// GET /api/vehicle-stickers/requirements — public: list active requirements
router.get('/requirements', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, is_required, sort_order
       FROM sticker_requirements
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      []
    );
    return res.json({ requirements: result.rows });
  } catch (err) {
    console.error('List sticker requirements error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/vehicle-stickers/requirements — admin: create requirement
router.post('/requirements', requireSession, blockDemoAdmin, async (req, res) => {
  const { name, is_required, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await query(
      `INSERT INTO sticker_requirements (name, is_required, sort_order)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, is_required !== false, sort_order || 0]
    );
    return res.status(201).json({ requirement: result.rows[0] });
  } catch (err) {
    console.error('Create sticker requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/vehicle-stickers/requirements/:id — admin: update requirement
router.put('/requirements/:id', requireSession, blockDemoAdmin, async (req, res) => {
  const { name, is_required, sort_order, is_active } = req.body;
  const fields = [];
  const params = [];
  let idx = 1;
  if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
  if (is_required !== undefined) { fields.push(`is_required = $${idx++}`); params.push(is_required); }
  if (sort_order !== undefined) { fields.push(`sort_order = $${idx++}`); params.push(sort_order); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(is_active); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  try {
    const result = await query(
      `UPDATE sticker_requirements SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });
    return res.json({ requirement: result.rows[0] });
  } catch (err) {
    console.error('Update sticker requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/vehicle-stickers/requirements/:id — admin: soft-delete
router.delete('/requirements/:id', requireSession, blockDemoAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE sticker_requirements SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });
    return res.json({ message: 'Requirement removed' });
  } catch (err) {
    console.error('Delete sticker requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

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
router.post('/', requireAppAuth, requireAppRole('homeowner'), blockDemoAppUser, async (req, res) => {
  const { vehicle_id, sticker_year, amount, receipt_number, image_data, docs } = req.body;
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

    // Validate required requirement docs
    const reqsResult = await query(
      `SELECT id FROM sticker_requirements WHERE is_active = TRUE AND is_required = TRUE`,
      []
    );
    const requiredIds = reqsResult.rows.map(r => r.id);
    const missing = requiredIds.filter(id => {
      const doc = Array.isArray(docs) ? docs.find(d => Number(d.requirement_id) === id) : undefined;
      return !doc || !doc.file_data;
    });
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required documents for requirement IDs: ${missing.join(', ')}` });
    }

    const client = await pool.connect();
    let sticker;
    try {
      await client.query('BEGIN');

      // Upsert sticker
      const result = await client.query(
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

      sticker = result.rows[0];

      // Delete old docs for this sticker (re-submission on rejected) then insert new ones
      if (Array.isArray(docs) && docs.length > 0) {
        await client.query('DELETE FROM sticker_req_docs WHERE vehicle_sticker_id = $1', [sticker.id]);
        for (const doc of docs) {
          if (doc.requirement_id && doc.file_data) {
            await client.query(
              `INSERT INTO sticker_req_docs (vehicle_sticker_id, requirement_id, file_data)
               VALUES ($1, $2, $3)`,
              [sticker.id, doc.requirement_id, doc.file_data]
            );
          }
        }
      }

      if (sticker.status === 'pending') {
        const vInfo = await client.query('SELECT plate_number FROM vehicles WHERE id = $1', [vehicle_id]);
        const plate = vInfo.rows[0]?.plate_number || '';
        await client.query(
          `INSERT INTO notifications (type, title, message, related_type, related_id)
           VALUES ('vehicle_sticker', $1, $2, 'vehicle_sticker', $3)`,
          [
            'Vehicle Sticker Request',
            `${req.appUser.fullName} requested a ${sticker_year} sticker for ${plate}`,
            sticker.id,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.status(201).json({ sticker });
  } catch (err) {
    console.error('Request sticker error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vehicle-stickers/:id/qr — homeowner: get daily-rotating QR value for approved sticker
router.get('/:id/qr', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, status, sticker_year FROM vehicle_stickers
       WHERE id = $1 AND homeowner_id = $2`,
      [req.params.id, req.appUser.homeownerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sticker not found' });
    const sticker = result.rows[0];
    if (sticker.status !== 'approved') {
      return res.status(403).json({ error: 'Sticker not yet approved' });
    }
    return res.json({ qr_value: dailyQrValue(sticker.id), sticker_year: sticker.sticker_year });
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

// GET /api/vehicle-stickers/:id/docs — admin: get submitted requirement docs
router.get('/:id/docs', requireSession, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.id, d.requirement_id, sr.name, sr.is_required, d.file_data
       FROM sticker_req_docs d
       JOIN sticker_requirements sr ON sr.id = d.requirement_id
       WHERE d.vehicle_sticker_id = $1
       ORDER BY sr.sort_order ASC, sr.id ASC`,
      [req.params.id]
    );
    return res.json({ docs: result.rows });
  } catch (err) {
    console.error('Sticker docs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/vehicle-stickers/:id/approve — admin
router.put('/:id/approve', requireSession, blockDemoAdmin, async (req, res) => {
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
router.put('/:id/reject', requireSession, blockDemoAdmin, async (req, res) => {
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
