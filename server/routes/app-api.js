const express = require('express');
const { query } = require('../db');
const { requireAppAuth, requireAppRole } = require('../middleware/appAuth');

const router = express.Router();
router.use(requireAppAuth);

// GET /api/app/dashboard — homeowner's dashboard data
router.get('/dashboard', requireAppRole('homeowner'), async (req, res) => {
  const homeownerId = req.appUser.homeownerId;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  try {
    // Payment status for current month
    const currentPayment = await query(
      `SELECT id, paid_at FROM dues_payments
       WHERE homeowner_id = $1 AND period_year = $2 AND period_month = $3`,
      [homeownerId, currentYear, currentMonth]
    );

    // Last 12 months payment history
    const history = await query(
      `SELECT period_year, period_month, paid_at, amount
       FROM dues_payments
       WHERE homeowner_id = $1
       ORDER BY period_year DESC, period_month DESC
       LIMIT 12`,
      [homeownerId]
    );

    // Last payment details
    const lastPaid = history.rows.length > 0 ? history.rows[0] : null;
    let monthsBehind = 0;
    if (currentPayment.rows.length === 0) {
      if (lastPaid) {
        monthsBehind = (currentYear - lastPaid.period_year) * 12 + (currentMonth - lastPaid.period_month);
      } else {
        monthsBehind = 1;
      }
    }

    // Total paid this year
    const yearTotal = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM dues_payments
       WHERE homeowner_id = $1 AND period_year = $2`,
      [homeownerId, currentYear]
    );

    // Latest 5 announcements
    const announcements = await query(
      `SELECT id, title, body, created_at
       FROM announcements
       ORDER BY created_at DESC
       LIMIT 5`,
      []
    );

    // Amenities with current status
    const today = now.toISOString().split('T')[0];
    const timeNow = now.toTimeString().slice(0, 5);
    const amenities = await query(
      `SELECT a.id, a.name, a.description, a.location, a.capacity,
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
         END AS current_status
       FROM amenities a
       WHERE a.is_active = TRUE
       ORDER BY a.name`,
      [today, timeNow]
    );

    // My pending/upcoming bookings
    const myBookings = await query(
      `SELECT ab.*, a.name AS amenity_name
       FROM amenity_bookings ab
       JOIN amenities a ON a.id = ab.amenity_id
       WHERE ab.homeowner_id = $1
         AND ab.requested_date >= $2
       ORDER BY ab.requested_date ASC, ab.time_start ASC
       LIMIT 5`,
      [homeownerId, today]
    );

    const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const isPaid = currentPayment.rows.length > 0;

    return res.json({
      payment_status: {
        current_period: currentPeriod,
        is_paid: isPaid,
        paid_at: isPaid ? currentPayment.rows[0].paid_at : null,
        months_behind: monthsBehind,
        last_paid_period: lastPaid
          ? `${lastPaid.period_year}-${String(lastPaid.period_month).padStart(2, '0')}`
          : null,
        total_paid_this_year: parseFloat(yearTotal.rows[0].total),
      },
      payment_history: history.rows,
      announcements: announcements.rows,
      amenities: amenities.rows,
      upcoming_bookings: myBookings.rows,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/payments/mine — full payment history
router.get('/payments/mine', requireAppRole('homeowner'), async (req, res) => {
  const homeownerId = req.appUser.homeownerId;
  try {
    const result = await query(
      `SELECT period_year, period_month, paid_at, amount, notes
       FROM dues_payments
       WHERE homeowner_id = $1
       ORDER BY period_year DESC, period_month DESC`,
      [homeownerId]
    );
    return res.json({ payments: result.rows });
  } catch (err) {
    console.error('My payments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/announcements — all announcements
router.get('/announcements', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC LIMIT 20`,
      []
    );
    return res.json({ announcements: result.rows });
  } catch (err) {
    console.error('Announcements error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
