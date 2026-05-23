const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const router = express.Router();

// Accept either x-api-key (legacy) OR Bearer JWT for guard role
function requireScanAuth(req, res, next) {
  // Check Bearer JWT first
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role !== 'guard') {
        return res.status(403).json({ status: 'invalid', message: 'Guard access only' });
      }
      req.appUser = decoded;
      return next();
    } catch (e) {
      return res.status(401).json({ status: 'invalid', message: 'Session expired' });
    }
  }

  // Fall back to API key
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.SCAN_API_KEY) {
    return res.status(401).json({ status: 'invalid', message: 'Unauthorized' });
  }
  next();
}

// Helper: calculate months behind
function monthsBehind(fromYear, fromMonth, toYear, toMonth) {
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

// GET /api/scan/:token
router.get('/:token', requireScanAuth, async (req, res) => {
  const { token } = req.params;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  try {
    // Look up homeowner by qr_token (UUID)
    const homResult = await query(
      `SELECT id, full_name, lot_number, block_number, is_active
       FROM homeowners WHERE qr_token = $1`,
      [token]
    );

    if (homResult.rows.length === 0) {
      return res.json({ status: 'invalid', message: 'QR code not recognized' });
    }

    const homeowner = homResult.rows[0];

    if (!homeowner.is_active) {
      return res.json({ status: 'invalid', message: 'Inactive homeowner' });
    }

    const homeownerInfo = {
      full_name: homeowner.full_name,
      lot_number: homeowner.lot_number,
      block_number: homeowner.block_number,
    };

    // Check current month payment
    const payResult = await query(
      `SELECT id, paid_at FROM dues_payments
       WHERE homeowner_id = $1 AND period_year = $2 AND period_month = $3`,
      [homeowner.id, currentYear, currentMonth]
    );

    const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    if (payResult.rows.length > 0) {
      return res.json({
        status: 'updated',
        homeowner: homeownerInfo,
        current_period: currentPeriod,
        paid_at: payResult.rows[0].paid_at,
      });
    }

    // Find last paid period
    const lastPayResult = await query(
      `SELECT period_year, period_month FROM dues_payments
       WHERE homeowner_id = $1
       ORDER BY period_year DESC, period_month DESC
       LIMIT 1`,
      [homeowner.id]
    );

    let lastPaidPeriod = null;
    let behind = 0;

    if (lastPayResult.rows.length > 0) {
      const lp = lastPayResult.rows[0];
      lastPaidPeriod = `${lp.period_year}-${String(lp.period_month).padStart(2, '0')}`;
      behind = monthsBehind(lp.period_year, lp.period_month, currentYear, currentMonth);
    } else {
      // Never paid — count from current month as 1 month behind
      behind = 1;
    }

    return res.json({
      status: 'outdated',
      homeowner: homeownerInfo,
      current_period: currentPeriod,
      last_paid_period: lastPaidPeriod,
      months_behind: behind,
    });
  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

module.exports = router;
