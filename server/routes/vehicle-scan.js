const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const router = express.Router();

function requireScanAuth(req, res, next) {
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
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.SCAN_API_KEY) {
    return res.status(401).json({ status: 'invalid', message: 'Unauthorized' });
  }
  next();
}

// GET /api/vehicle-scan/:token
router.get('/:token', requireScanAuth, async (req, res) => {
  const { token } = req.params;
  const currentYear = new Date().getFullYear();

  try {
    const result = await query(
      `SELECT vs.*, v.plate_number, v.make, v.model, v.color, v.year AS vehicle_year,
              h.full_name AS homeowner_name, h.lot_number, h.block_number, h.id AS homeowner_id
       FROM vehicle_stickers vs
       JOIN vehicles v ON v.id = vs.vehicle_id
       JOIN homeowners h ON h.id = vs.homeowner_id
       WHERE vs.qr_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'invalid', message: 'QR code not recognized' });
    }

    const s = result.rows[0];

    if (s.status !== 'approved') {
      return res.json({
        status: 'invalid',
        message: `Sticker is ${s.status}`,
        sticker: {
          plate_number: s.plate_number,
          homeowner_name: s.homeowner_name,
          lot_number: s.lot_number,
          block_number: s.block_number,
          sticker_year: s.sticker_year,
        },
      });
    }

    if (s.sticker_year !== currentYear) {
      // Log the expired scan attempt
      await logEntry(s.homeowner_id, 'vehicle_sticker', s.id, req.appUser);
      return res.json({
        status: 'expired',
        message: `Sticker is for ${s.sticker_year}, current year is ${currentYear}`,
        sticker: buildStickerInfo(s),
      });
    }

    // Valid — log entry
    await logEntry(s.homeowner_id, 'vehicle_sticker', s.id, req.appUser);

    return res.json({
      status: 'valid',
      sticker: buildStickerInfo(s),
    });
  } catch (err) {
    console.error('Vehicle scan error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

function buildStickerInfo(s) {
  return {
    plate_number: s.plate_number,
    make: s.make,
    model: s.model,
    color: s.color,
    vehicle_year: s.vehicle_year,
    sticker_year: s.sticker_year,
    homeowner_name: s.homeowner_name,
    lot_number: s.lot_number,
    block_number: s.block_number,
  };
}

async function logEntry(homeownerId, scanType, referenceId, appUser) {
  try {
    await query(
      `INSERT INTO entry_logs (homeowner_id, scan_type, reference_id, scanned_by, guard_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [homeownerId, scanType, referenceId,
       appUser?.userId || null, appUser?.fullName || 'API Key']
    );
  } catch (e) {
    console.error('Entry log error:', e);
  }
}

module.exports = router;
