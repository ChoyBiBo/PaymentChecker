const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireSession, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireSession);

// GET /api/payments
router.get('/', async (req, res) => {
  const { homeowner_id, year, month } = req.query;

  try {
    let sql = `
      SELECT
        dp.id, dp.homeowner_id, dp.period_year, dp.period_month,
        dp.amount_paid, dp.paid_at, dp.receipt_number, dp.payment_method,
        dp.notes, dp.recorded_by,
        h.full_name, h.lot_number, h.block_number,
        au.username AS recorded_by_username
      FROM dues_payments dp
      JOIN homeowners h ON h.id = dp.homeowner_id
      LEFT JOIN admin_users au ON au.id = dp.recorded_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (homeowner_id) {
      sql += ` AND dp.homeowner_id = $${idx++}`;
      params.push(homeowner_id);
    }
    if (year) {
      sql += ` AND dp.period_year = $${idx++}`;
      params.push(year);
    }
    if (month) {
      sql += ` AND dp.period_month = $${idx++}`;
      params.push(month);
    }

    sql += ` ORDER BY dp.paid_at DESC LIMIT 200`;

    const result = await query(sql, params);
    return res.json({ payments: result.rows });
  } catch (err) {
    console.error('List payments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/payments
router.post(
  '/',
  [
    body('homeowner_id').isInt().withMessage('Homeowner ID is required'),
    body('period_year').isInt({ min: 2000, max: 2100 }).withMessage('Valid year is required'),
    body('period_month').isInt({ min: 1, max: 12 }).withMessage('Valid month (1-12) is required'),
    body('amount_paid').isNumeric().withMessage('Amount paid is required'),
    body('payment_method').optional().isIn(['cash', 'gcash', 'bank', 'check', 'other']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      homeowner_id, period_year, period_month,
      amount_paid, receipt_number, payment_method, notes,
    } = req.body;

    try {
      const result = await query(
        `INSERT INTO dues_payments
          (homeowner_id, period_year, period_month, amount_paid, receipt_number, payment_method, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          homeowner_id, period_year, period_month, amount_paid,
          receipt_number || null, payment_method || 'cash', notes || null,
          req.session.adminId,
        ]
      );

      await query(
        `INSERT INTO audit_log (admin_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'PAYMENT_RECORDED', 'payment', $2, $3)`,
        [
          req.session.adminId,
          result.rows[0].id,
          JSON.stringify({ homeowner_id, period_year, period_month, amount_paid }),
        ]
      );

      return res.status(201).json({ payment: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({
          error: `Payment for ${period_month}/${period_year} is already recorded for this homeowner`,
        });
      }
      if (err.code === '23503') {
        return res.status(404).json({ error: 'Homeowner not found' });
      }
      console.error('Record payment error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/payments/:id (superadmin only)
router.delete('/:id', requireRole('superadmin'), async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await query(
      'SELECT dp.*, h.full_name FROM dues_payments dp JOIN homeowners h ON h.id = dp.homeowner_id WHERE dp.id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = existing.rows[0];
    await query('DELETE FROM dues_payments WHERE id = $1', [id]);

    await query(
      `INSERT INTO audit_log (admin_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'PAYMENT_VOIDED', 'payment', $2, $3)`,
      [
        req.session.adminId,
        id,
        JSON.stringify({
          homeowner: payment.full_name,
          period: `${payment.period_month}/${payment.period_year}`,
          amount: payment.amount_paid,
        }),
      ]
    );

    return res.json({ message: 'Payment voided successfully' });
  } catch (err) {
    console.error('Delete payment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
