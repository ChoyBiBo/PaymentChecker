const express = require('express');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

// GET /api/payment-proofs — admin: list all submissions with filters
router.get('/', requireSession, async (req, res) => {
  const { status, homeowner_id } = req.query;
  try {
    let sql = `
      SELECT pp.id, pp.homeowner_id, pp.period_year, pp.period_month,
             pp.status, pp.submitted_at, pp.reviewed_at, pp.review_notes,
             h.full_name AS homeowner_name, h.lot_number, h.block_number,
             au.full_name AS reviewed_by_name
      FROM payment_proofs pp
      JOIN homeowners h ON h.id = pp.homeowner_id
      LEFT JOIN admin_users au ON au.id = pp.reviewed_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (status) { sql += ` AND pp.status = $${idx++}`; params.push(status); }
    if (homeowner_id) { sql += ` AND pp.homeowner_id = $${idx++}`; params.push(homeowner_id); }
    sql += ' ORDER BY pp.submitted_at DESC';

    const result = await query(sql, params);
    return res.json({ proofs: result.rows });
  } catch (err) {
    console.error('List payment proofs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/payment-proofs/:id/image — admin: get the image data
router.get('/:id/image', requireSession, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      'SELECT image_data FROM payment_proofs WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ image_data: result.rows[0].image_data });
  } catch (err) {
    console.error('Get proof image error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/payment-proofs/:id/approve — admin: approve and create dues_payment
router.post('/:id/approve', requireSession, async (req, res) => {
  const { id } = req.params;
  const { amount, notes } = req.body;
  const adminId = req.session.adminId;
  try {
    const proofResult = await query(
      `SELECT * FROM payment_proofs WHERE id = $1 AND status = 'pending'`,
      [id]
    );
    if (proofResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pending proof not found' });
    }
    const proof = proofResult.rows[0];

    // Mark proof approved
    await query(
      `UPDATE payment_proofs
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3`,
      [adminId, notes || null, id]
    );

    // Upsert dues_payment record for the period
    await query(
      `INSERT INTO dues_payments (homeowner_id, period_year, period_month, paid_at, amount, notes)
       VALUES ($1, $2, $3, NOW(), $4, $5)
       ON CONFLICT (homeowner_id, period_year, period_month)
       DO UPDATE SET paid_at = NOW(), amount = EXCLUDED.amount, notes = EXCLUDED.notes`,
      [proof.homeowner_id, proof.period_year, proof.period_month, amount || null, notes || null]
    );

    return res.json({ message: 'Proof approved and payment recorded' });
  } catch (err) {
    console.error('Approve proof error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/payment-proofs/:id/reject — admin: reject
router.post('/:id/reject', requireSession, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const adminId = req.session.adminId;
  try {
    const result = await query(
      `UPDATE payment_proofs
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING id`,
      [adminId, notes || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending proof not found' });
    }
    return res.json({ message: 'Proof rejected' });
  } catch (err) {
    console.error('Reject proof error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
