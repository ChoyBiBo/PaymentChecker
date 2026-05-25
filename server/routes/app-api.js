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
      `SELECT period_year, period_month, paid_at, amount_paid AS amount
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
      `SELECT COALESCE(SUM(amount_paid), 0) AS total
       FROM dues_payments
       WHERE homeowner_id = $1 AND period_year = $2`,
      [homeownerId, currentYear]
    );

    // Latest 5 announcements
    const announcements = await query(
      `SELECT id, title, body, posted_at AS created_at
       FROM announcements
       ORDER BY posted_at DESC
       LIMIT 5`,
      []
    );

    // Amenities with current status
    const today = now.toISOString().split('T')[0];
    const timeNow = now.toTimeString().slice(0, 5);
    const amenities = await query(
      `SELECT a.id, a.name, a.description, a.location, a.capacity, a.image_data,
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
         COALESCE(
           (SELECT json_agg(
              json_build_object(
                'requested_date', ab.requested_date::text,
                'time_start', ab.time_start::text,
                'time_end', ab.time_end::text,
                'purpose', ab.purpose
              ) ORDER BY ab.requested_date, ab.time_start
            )
            FROM amenity_bookings ab
            WHERE ab.amenity_id = a.id
              AND ab.status = 'approved'
              AND ab.requested_date >= $1
            LIMIT 5
           ), '[]'::json
         ) AS upcoming_schedule
       FROM amenities a
       WHERE a.is_active = TRUE
       ORDER BY a.name`,
      [today, timeNow]
    );

    // My pending/upcoming bookings
    const myBookings = await query(
      `SELECT ab.id, ab.amenity_id, a.name AS amenity_name,
              ab.requested_date, ab.time_start, ab.time_end,
              ab.purpose, ab.status, ab.review_notes, ab.created_at
       FROM amenity_bookings ab
       JOIN amenities a ON a.id = ab.amenity_id
       WHERE ab.homeowner_id = $1
         AND ab.requested_date >= $2
       ORDER BY ab.requested_date ASC, ab.time_start ASC
       LIMIT 5`,
      [homeownerId, today]
    );

    // My recent requests — all statuses, ordered by when submitted
    const myRequests = await query(
      `SELECT ab.id, ab.amenity_id, a.name AS amenity_name,
              ab.requested_date, ab.time_start, ab.time_end,
              ab.purpose, ab.status, ab.review_notes, ab.created_at
       FROM amenity_bookings ab
       JOIN amenities a ON a.id = ab.amenity_id
       WHERE ab.homeowner_id = $1
       ORDER BY ab.created_at DESC
       LIMIT 5`,
      [homeownerId]
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
      my_requests: myRequests.rows,
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
      `SELECT period_year, period_month, paid_at, amount_paid AS amount, notes
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
      `SELECT id, title, body, posted_at AS created_at FROM announcements ORDER BY posted_at DESC LIMIT 20`,
      []
    );
    return res.json({ announcements: result.rows });
  } catch (err) {
    console.error('Announcements error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/my-notifications — homeowner: recent sticker/booking status changes + announcements
router.get('/my-notifications', requireAppRole('homeowner'), async (req, res) => {
  const homeownerId = req.appUser.homeownerId;
  const since = req.query.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const stickers = await query(
      `SELECT vs.status, vs.sticker_year, vs.reviewed_at, vs.review_notes, v.plate_number
       FROM vehicle_stickers vs
       JOIN vehicles v ON v.id = vs.vehicle_id
       WHERE vs.homeowner_id = $1
         AND vs.status IN ('approved', 'rejected')
         AND vs.reviewed_at IS NOT NULL
         AND vs.reviewed_at > $2
       ORDER BY vs.reviewed_at DESC`,
      [homeownerId, since]
    );

    const bookings = await query(
      `SELECT ab.status, ab.requested_date, ab.reviewed_at, ab.review_notes, a.name AS amenity_name
       FROM amenity_bookings ab
       JOIN amenities a ON a.id = ab.amenity_id
       WHERE ab.homeowner_id = $1
         AND ab.status IN ('approved', 'rejected')
         AND ab.reviewed_at IS NOT NULL
         AND ab.reviewed_at > $2
       ORDER BY ab.reviewed_at DESC`,
      [homeownerId, since]
    );

    const renovations = await query(
      `SELECT rp.status, rp.rejection_reason, rp.reviewed_at, rp.updated_at
       FROM renovation_permits rp
       WHERE rp.homeowner_id = $1
         AND rp.status IN ('complete', 'incomplete', 'rejected')
         AND rp.reviewed_at IS NOT NULL
         AND rp.reviewed_at > $2
       ORDER BY rp.reviewed_at DESC`,
      [homeownerId, since]
    );

    const announcements = await query(
      `SELECT id, title, body, posted_at
       FROM announcements
       WHERE posted_at > $1
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY posted_at DESC`,
      [since]
    );

    const notifications = [];
    stickers.rows.forEach(s => {
      notifications.push({
        id: `sticker_${s.sticker_year}_${s.plate_number}`,
        type: `sticker_${s.status}`,
        title: s.status === 'approved' ? 'Vehicle Sticker Approved' : 'Vehicle Sticker Rejected',
        message: s.status === 'approved'
          ? `Your ${s.sticker_year} sticker for ${s.plate_number} has been approved.`
          : `Your ${s.sticker_year} sticker for ${s.plate_number} was rejected.${s.review_notes ? ' ' + s.review_notes : ''}`,
        created_at: s.reviewed_at,
      });
    });
    bookings.rows.forEach(b => {
      notifications.push({
        id: `booking_${b.requested_date}_${b.amenity_name}`,
        type: `booking_${b.status}`,
        title: b.status === 'approved' ? 'Amenity Booking Approved' : 'Amenity Booking Rejected',
        message: b.status === 'approved'
          ? `Your booking for ${b.amenity_name} on ${b.requested_date} has been approved.`
          : `Your booking for ${b.amenity_name} on ${b.requested_date} was rejected.${b.review_notes ? ' ' + b.review_notes : ''}`,
        created_at: b.reviewed_at,
      });
    });
    renovations.rows.forEach(r => {
      notifications.push({
        id: `renovation_${r.reviewed_at}`,
        type: `renovation_${r.status}`,
        title: r.status === 'complete' ? 'Renovation Permit Approved' :
               r.status === 'incomplete' ? 'Renovation Permit Incomplete' : 'Renovation Permit Rejected',
        message: r.status === 'complete'
          ? 'Your renovation permit request has been approved.'
          : r.status === 'incomplete'
          ? 'Your renovation permit is incomplete. Please submit missing requirements.'
          : `Your renovation permit was rejected.${r.rejection_reason ? ' Reason: ' + r.rejection_reason : ''}`,
        created_at: r.reviewed_at,
      });
    });
    announcements.rows.forEach(a => {
      notifications.push({
        id: `announcement_${a.id}`,
        type: 'announcement',
        title: `📢 ${a.title}`,
        message: a.body,
        created_at: a.posted_at,
      });
    });
    notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json({ notifications });
  } catch (err) {
    console.error('My notifications error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/payment-proofs/mine — homeowner: own proof submissions
router.get('/payment-proofs/mine', requireAppRole('homeowner'), async (req, res) => {
  const homeownerId = req.appUser.homeownerId;
  try {
    const result = await query(
      `SELECT id, period_year, period_month, status, submitted_at, reviewed_at, review_notes
       FROM payment_proofs
       WHERE homeowner_id = $1
       ORDER BY submitted_at DESC
       LIMIT 20`,
      [homeownerId]
    );
    return res.json({ proofs: result.rows });
  } catch (err) {
    console.error('My payment proofs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/payment-proofs — homeowner: submit OR photo
router.post('/payment-proofs', requireAppRole('homeowner'), async (req, res) => {
  const homeownerId = req.appUser.homeownerId;
  const { period_year, period_month, image_data } = req.body;

  if (!period_year || !period_month || !image_data) {
    return res.status(400).json({ error: 'period_year, period_month, and image_data are required' });
  }
  if (period_year < 2000 || period_year > 2100) {
    return res.status(400).json({ error: 'Invalid period_year' });
  }
  if (period_month < 1 || period_month > 12) {
    return res.status(400).json({ error: 'Invalid period_month' });
  }

  try {
    // Reject if already paid for that period
    const existing = await query(
      `SELECT id FROM dues_payments WHERE homeowner_id = $1 AND period_year = $2 AND period_month = $3`,
      [homeownerId, period_year, period_month]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Payment already recorded for this period' });
    }
    // Reject if there is already a pending proof for that period
    const pending = await query(
      `SELECT id FROM payment_proofs WHERE homeowner_id = $1 AND period_year = $2 AND period_month = $3 AND status = 'pending'`,
      [homeownerId, period_year, period_month]
    );
    if (pending.rows.length > 0) {
      return res.status(409).json({ error: 'A pending proof already exists for this period' });
    }
    const result = await query(
      `INSERT INTO payment_proofs (homeowner_id, period_year, period_month, image_data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status, submitted_at`,
      [homeownerId, period_year, period_month, image_data]
    );
    return res.status(201).json({ proof: result.rows[0] });
  } catch (err) {
    console.error('Submit payment proof error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
