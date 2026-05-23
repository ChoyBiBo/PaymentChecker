const express = require('express');
const QRCode = require('qrcode');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');

const router = express.Router();
router.use(requireSession);

async function getHomeownerToken(id) {
  const result = await query(
    'SELECT id, full_name, lot_number, block_number, qr_token FROM homeowners WHERE id = $1 AND is_active = TRUE',
    [id]
  );
  return result.rows[0] || null;
}

// GET /api/qr/:id  — returns PNG
router.get('/:id', async (req, res) => {
  try {
    const homeowner = await getHomeownerToken(req.params.id);
    if (!homeowner) {
      return res.status(404).json({ error: 'Homeowner not found' });
    }

    const qrData = `HOA-${homeowner.qr_token}`;
    const buffer = await QRCode.toBuffer(qrData, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    console.error('QR PNG error:', err);
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// GET /api/qr/:id/svg  — returns SVG
router.get('/:id/svg', async (req, res) => {
  try {
    const homeowner = await getHomeownerToken(req.params.id);
    if (!homeowner) {
      return res.status(404).json({ error: 'Homeowner not found' });
    }

    const qrData = `HOA-${homeowner.qr_token}`;
    const svg = await QRCode.toString(qrData, {
      type: 'svg',
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(svg);
  } catch (err) {
    console.error('QR SVG error:', err);
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

module.exports = router;
