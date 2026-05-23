const express = require('express');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');

const router = express.Router();
router.use(requireSession);

// GET /api/entry-logs
router.get('/', async (req, res) => {
  const { scan_type, homeowner_id, date_from, date_to } = req.query;
  try {
    let sql = `
      SELECT el.*, h.full_name AS homeowner_name, h.lot_number, h.block_number,
             CASE
               WHEN el.scan_type = 'vehicle_sticker' THEN v.plate_number
               ELSE NULL
             END AS plate_number,
             CASE
               WHEN el.scan_type = 'vehicle_sticker' THEN vs.sticker_year::text
               ELSE NULL
             END AS sticker_year
      FROM entry_logs el
      JOIN homeowners h ON h.id = el.homeowner_id
      LEFT JOIN vehicle_stickers vs ON vs.id = el.reference_id AND el.scan_type = 'vehicle_sticker'
      LEFT JOIN vehicles v ON v.id = vs.vehicle_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (scan_type) { sql += ` AND el.scan_type = $${idx++}`; params.push(scan_type); }
    if (homeowner_id) { sql += ` AND el.homeowner_id = $${idx++}`; params.push(homeowner_id); }
    if (date_from) { sql += ` AND el.entry_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND el.entry_at < ($${idx++}::date + interval '1 day')`; params.push(date_to); }
    sql += ' ORDER BY el.entry_at DESC LIMIT 200';

    const result = await query(sql, params);
    return res.json({ logs: result.rows });
  } catch (err) {
    console.error('Entry logs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
