const express = require('express');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');

const router = express.Router();
router.use(requireSession);

// GET /api/reports/monthly-summary?year=&month=
router.get('/monthly-summary', async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);

  try {
    const result = await query(
      `SELECT
        h.id, h.full_name, h.lot_number, h.block_number, h.monthly_due,
        dp.amount_paid, dp.paid_at, dp.receipt_number, dp.payment_method,
        CASE WHEN dp.id IS NOT NULL THEN 'updated' ELSE 'outdated' END AS payment_status
       FROM homeowners h
       LEFT JOIN dues_payments dp
         ON dp.homeowner_id = h.id
         AND dp.period_year = $1
         AND dp.period_month = $2
       WHERE h.is_active = TRUE
       ORDER BY h.lot_number, h.block_number, h.full_name`,
      [year, month]
    );

    const rows = result.rows;
    const paidRows = rows.filter(r => r.payment_status === 'updated');
    const totalCollected = paidRows.reduce((sum, r) => sum + parseFloat(r.amount_paid || 0), 0);

    return res.json({
      year,
      month,
      total_homeowners: rows.length,
      paid_count: paidRows.length,
      unpaid_count: rows.length - paidRows.length,
      total_collected: totalCollected.toFixed(2),
      homeowners: rows,
    });
  } catch (err) {
    console.error('Monthly summary error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/delinquency
router.get('/delinquency', async (req, res) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  try {
    // Get all active homeowners and their last payment
    const result = await query(
      `SELECT
        h.id, h.full_name, h.lot_number, h.block_number, h.monthly_due,
        h.contact_phone, h.contact_email,
        lp.period_year AS last_paid_year,
        lp.period_month AS last_paid_month
       FROM homeowners h
       LEFT JOIN LATERAL (
         SELECT period_year, period_month FROM dues_payments
         WHERE homeowner_id = h.id
         ORDER BY period_year DESC, period_month DESC
         LIMIT 1
       ) lp ON TRUE
       WHERE h.is_active = TRUE
       ORDER BY h.lot_number, h.block_number`,
      []
    );

    const delinquent = result.rows
      .map(row => {
        let monthsBehind;
        let lastPaidPeriod = null;

        if (!row.last_paid_year) {
          monthsBehind = 1;
        } else {
          monthsBehind = (currentYear - row.last_paid_year) * 12 + (currentMonth - row.last_paid_month);
          lastPaidPeriod = `${row.last_paid_year}-${String(row.last_paid_month).padStart(2, '0')}`;
        }

        return {
          id: row.id,
          full_name: row.full_name,
          lot_number: row.lot_number,
          block_number: row.block_number,
          monthly_due: row.monthly_due,
          contact_phone: row.contact_phone,
          contact_email: row.contact_email,
          last_paid_period: lastPaidPeriod,
          months_behind: monthsBehind,
          estimated_arrears: (parseFloat(row.monthly_due) * monthsBehind).toFixed(2),
        };
      })
      .filter(row => row.months_behind > 0)
      .sort((a, b) => b.months_behind - a.months_behind);

    return res.json({ delinquent, count: delinquent.length });
  } catch (err) {
    console.error('Delinquency report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/export-csv?year=&month=
router.get('/export-csv', async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);

  try {
    const result = await query(
      `SELECT
        h.lot_number, h.block_number, h.full_name, h.monthly_due,
        CASE WHEN dp.id IS NOT NULL THEN 'Updated' ELSE 'Outdated' END AS status,
        dp.amount_paid, dp.paid_at, dp.receipt_number, dp.payment_method
       FROM homeowners h
       LEFT JOIN dues_payments dp
         ON dp.homeowner_id = h.id
         AND dp.period_year = $1
         AND dp.period_month = $2
       WHERE h.is_active = TRUE
       ORDER BY h.lot_number, h.block_number`,
      [year, month]
    );

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    let csv = 'Lot,Block,Name,Monthly Due,Status,Amount Paid,Paid Date,Receipt No.,Payment Method\r\n';

    for (const row of result.rows) {
      const paidDate = row.paid_at ? new Date(row.paid_at).toLocaleDateString('en-PH') : '';
      csv += [
        `"${row.lot_number}"`,
        `"${row.block_number || ''}"`,
        `"${row.full_name}"`,
        `"${row.monthly_due}"`,
        `"${row.status}"`,
        `"${row.amount_paid || ''}"`,
        `"${paidDate}"`,
        `"${row.receipt_number || ''}"`,
        `"${row.payment_method || ''}"`,
      ].join(',') + '\r\n';
    }

    const filename = `HOA_Dues_${monthNames[month]}_${year}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
