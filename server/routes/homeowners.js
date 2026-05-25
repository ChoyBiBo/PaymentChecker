const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');
const { blockDemoAdmin } = require('../middleware/demoGuard');

const router = express.Router();
router.use(requireSession);

// Helper: compute payment status for current month
function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// GET /api/homeowners
router.get('/', async (req, res) => {
  const { search, status } = req.query;
  const { year, month } = currentPeriod();

  try {
    let sql = `
      SELECT
        h.id, h.full_name, h.lot_number, h.block_number, h.address,
        h.contact_phone, h.contact_email, h.monthly_due, h.is_active,
        h.notes, h.created_at, h.qr_token,
        CASE WHEN dp.id IS NOT NULL THEN 'updated' ELSE 'outdated' END AS payment_status
      FROM homeowners h
      LEFT JOIN dues_payments dp
        ON dp.homeowner_id = h.id
        AND dp.period_year = $1
        AND dp.period_month = $2
      WHERE h.is_active = TRUE
    `;
    const params = [year, month];
    let idx = 3;

    if (search) {
      sql += ` AND (h.full_name ILIKE $${idx} OR h.lot_number ILIKE $${idx} OR h.block_number ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    if (status === 'updated') {
      sql += ` AND dp.id IS NOT NULL`;
    } else if (status === 'outdated') {
      sql += ` AND dp.id IS NULL`;
    }

    sql += ` ORDER BY h.lot_number, h.block_number, h.full_name`;

    const result = await query(sql, params);
    return res.json({ homeowners: result.rows, period: { year, month } });
  } catch (err) {
    console.error('List homeowners error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/homeowners
router.post(
  '/',
  blockDemoAdmin,
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required'),
    body('lot_number').trim().notEmpty().withMessage('Lot number is required'),
    body('monthly_due').optional().isNumeric().withMessage('Monthly due must be a number'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      full_name, lot_number, block_number, address,
      contact_phone, contact_email, monthly_due, notes,
    } = req.body;

    try {
      const result = await query(
        `INSERT INTO homeowners
          (full_name, lot_number, block_number, address, contact_phone, contact_email, monthly_due, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          full_name, lot_number, block_number || null, address || null,
          contact_phone || null, contact_email || null,
          monthly_due || process.env.DEFAULT_MONTHLY_DUE || 500.00,
          notes || null,
        ]
      );

      await query(
        `INSERT INTO audit_log (admin_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'HOMEOWNER_ADDED', 'homeowner', $2, $3)`,
        [req.session.adminId, result.rows[0].id, JSON.stringify({ full_name, lot_number })]
      );

      return res.status(201).json({ homeowner: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Lot number already exists' });
      }
      console.error('Create homeowner error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/homeowners/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const homResult = await query('SELECT * FROM homeowners WHERE id = $1', [id]);
    if (homResult.rows.length === 0) {
      return res.status(404).json({ error: 'Homeowner not found' });
    }

    const paymentsResult = await query(
      `SELECT dp.*, au.username AS recorded_by_username
       FROM dues_payments dp
       LEFT JOIN admin_users au ON au.id = dp.recorded_by
       WHERE dp.homeowner_id = $1
       ORDER BY dp.period_year DESC, dp.period_month DESC
       LIMIT 24`,
      [id]
    );

    return res.json({
      homeowner: homResult.rows[0],
      payments: paymentsResult.rows,
    });
  } catch (err) {
    console.error('Get homeowner error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/homeowners/:id
router.put('/:id', blockDemoAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    full_name, lot_number, block_number, address,
    contact_phone, contact_email, monthly_due, notes,
  } = req.body;

  try {
    const result = await query(
      `UPDATE homeowners
       SET full_name = COALESCE($1, full_name),
           lot_number = COALESCE($2, lot_number),
           block_number = $3,
           address = $4,
           contact_phone = $5,
           contact_email = $6,
           monthly_due = COALESCE($7, monthly_due),
           notes = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        full_name || null, lot_number || null, block_number || null,
        address || null, contact_phone || null, contact_email || null,
        monthly_due || null, notes || null, id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Homeowner not found' });
    }

    return res.json({ homeowner: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Lot number already exists' });
    }
    console.error('Update homeowner error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/homeowners/:id (soft delete)
router.delete('/:id', blockDemoAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      'UPDATE homeowners SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, full_name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Homeowner not found' });
    }

    await query(
      `INSERT INTO audit_log (admin_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'HOMEOWNER_DEACTIVATED', 'homeowner', $2, $3)`,
      [req.session.adminId, id, JSON.stringify({ full_name: result.rows[0].full_name })]
    );

    return res.json({ message: 'Homeowner deactivated successfully' });
  } catch (err) {
    console.error('Delete homeowner error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/homeowners/:id/regenerate-qr
router.post('/:id/regenerate-qr', blockDemoAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      `UPDATE homeowners SET qr_token = gen_random_uuid(), updated_at = NOW()
       WHERE id = $1 RETURNING id, full_name, qr_token`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Homeowner not found' });
    }

    await query(
      `INSERT INTO audit_log (admin_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'QR_REGENERATED', 'homeowner', $2, $3)`,
      [req.session.adminId, id, JSON.stringify({ full_name: result.rows[0].full_name })]
    );

    return res.json({ message: 'QR token regenerated. Old printed QR codes are now invalid.' });
  } catch (err) {
    console.error('Regenerate QR error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
