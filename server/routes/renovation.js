const express = require('express');
const { query } = require('../db');
const { requireSession } = require('../middleware/auth');
const { requireAppAuth, requireAppRole } = require('../middleware/appAuth');

const router = express.Router();

// GET /api/renovation/requirements — public, returns active requirements
router.get('/requirements', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, description, sample_image, sort_order
       FROM renovation_requirements
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      []
    );
    return res.json({ requirements: result.rows });
  } catch (err) {
    console.error('List requirements error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/renovation/requirements — admin: create requirement
router.post('/requirements', requireSession, async (req, res) => {
  const { title, description, sample_image, sort_order } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const result = await query(
      `INSERT INTO renovation_requirements (title, description, sample_image, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, description || null, sample_image || null, sort_order || 0]
    );
    return res.status(201).json({ requirement: result.rows[0] });
  } catch (err) {
    console.error('Create requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/renovation/requirements/:id — admin: update requirement
router.put('/requirements/:id', requireSession, async (req, res) => {
  const { title, description, sample_image, sort_order, is_active } = req.body;
  try {
    const fields = [];
    const params = [];
    let idx = 1;
    if (title !== undefined) { fields.push(`title = $${idx++}`); params.push(title); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); params.push(description); }
    if (sample_image !== undefined) { fields.push(`sample_image = $${idx++}`); params.push(sample_image); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${idx++}`); params.push(sort_order); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(is_active); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const result = await query(
      `UPDATE renovation_requirements SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });
    return res.json({ requirement: result.rows[0] });
  } catch (err) {
    console.error('Update requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/renovation/requirements/:id — admin: soft-delete (set is_active=false)
router.delete('/requirements/:id', requireSession, async (req, res) => {
  try {
    const result = await query(
      `UPDATE renovation_requirements SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });
    return res.json({ message: 'Requirement removed' });
  } catch (err) {
    console.error('Delete requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/renovation/permits — admin: list all permits with homeowner info + file count + invalid count
router.get('/permits', requireSession, async (req, res) => {
  const { status } = req.query;
  try {
    let sql = `
      SELECT rp.id, rp.homeowner_id, rp.notes, rp.status, rp.rejection_reason,
             rp.reviewed_by, rp.reviewed_at, rp.created_at, rp.updated_at,
             h.full_name AS homeowner_name, h.lot_number, h.block_number,
             COUNT(rpf.id) AS file_count,
             COUNT(CASE WHEN rpf.is_valid = FALSE THEN 1 END) AS invalid_count
      FROM renovation_permits rp
      JOIN homeowners h ON h.id = rp.homeowner_id
      LEFT JOIN renovation_permit_files rpf ON rpf.permit_id = rp.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (status) { sql += ` AND rp.status = $${idx++}`; params.push(status); }
    sql += ' GROUP BY rp.id, h.full_name, h.lot_number, h.block_number ORDER BY rp.created_at DESC';

    const result = await query(sql, params);
    return res.json({ permits: result.rows });
  } catch (err) {
    console.error('List permits error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/renovation/permits/mine — homeowner: own permits with files array
router.get('/permits/mine', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  try {
    const permitsResult = await query(
      `SELECT rp.id, rp.notes, rp.status, rp.rejection_reason, rp.reviewed_at, rp.created_at, rp.updated_at
       FROM renovation_permits rp
       WHERE rp.homeowner_id = $1
       ORDER BY rp.created_at DESC`,
      [req.appUser.homeownerId]
    );

    const permits = permitsResult.rows;

    // Fetch files for each permit
    for (const permit of permits) {
      const filesResult = await query(
        `SELECT rpf.id, rpf.requirement_id, rpf.file_name, rpf.is_valid, rpf.reviewed_at,
                rr.title AS requirement_title
         FROM renovation_permit_files rpf
         JOIN renovation_requirements rr ON rr.id = rpf.requirement_id
         WHERE rpf.permit_id = $1
         ORDER BY rr.sort_order ASC, rr.id ASC`,
        [permit.id]
      );
      permit.files = filesResult.rows;
    }

    return res.json({ permits });
  } catch (err) {
    console.error('My permits error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/renovation/permits — homeowner: submit permit
router.post('/permits', requireAppAuth, requireAppRole('homeowner'), async (req, res) => {
  const { notes, files } = req.body;
  const homeownerId = req.appUser.homeownerId;

  // Check payment: current month dues must be paid
  const nowDate = new Date();
  const curYear = nowDate.getFullYear();
  const curMonth = nowDate.getMonth() + 1;
  try {
    const payCheck = await query(
      'SELECT id FROM dues_payments WHERE homeowner_id = $1 AND period_year = $2 AND period_month = $3',
      [homeownerId, curYear, curMonth]
    );
    if (payCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Your account must be updated (current month dues paid) to submit a renovation permit request.' });
    }

    // Insert permit
    const permitResult = await query(
      `INSERT INTO renovation_permits (homeowner_id, notes) VALUES ($1, $2) RETURNING *`,
      [homeownerId, notes || null]
    );
    const permit = permitResult.rows[0];

    // Insert files
    if (Array.isArray(files) && files.length > 0) {
      for (const f of files) {
        await query(
          `INSERT INTO renovation_permit_files (permit_id, requirement_id, file_data, file_name)
           VALUES ($1, $2, $3, $4)`,
          [permit.id, f.requirement_id, f.file_data, f.file_name || null]
        );
      }
    }

    // Create admin notification
    await query(
      `INSERT INTO notifications (type, title, message, related_type, related_id)
       VALUES ('renovation_permit', $1, $2, 'renovation_permit', $3)`,
      [
        'Renovation Permit Request',
        `${req.appUser.fullName} submitted a renovation permit request`,
        permit.id,
      ]
    );

    return res.status(201).json({ permit });
  } catch (err) {
    console.error('Submit permit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/renovation/permits/:id — admin: full detail
router.get('/permits/:id', requireSession, async (req, res) => {
  try {
    const permitResult = await query(
      `SELECT rp.*, h.full_name AS homeowner_name, h.lot_number, h.block_number,
              au.full_name AS reviewed_by_name
       FROM renovation_permits rp
       JOIN homeowners h ON h.id = rp.homeowner_id
       LEFT JOIN admin_users au ON au.id = rp.reviewed_by
       WHERE rp.id = $1`,
      [req.params.id]
    );
    if (permitResult.rows.length === 0) return res.status(404).json({ error: 'Permit not found' });
    const permit = permitResult.rows[0];

    const filesResult = await query(
      `SELECT rpf.id, rpf.requirement_id, rpf.file_data, rpf.file_name, rpf.is_valid, rpf.reviewed_at,
              rr.title AS requirement_title
       FROM renovation_permit_files rpf
       JOIN renovation_requirements rr ON rr.id = rpf.requirement_id
       WHERE rpf.permit_id = $1
       ORDER BY rr.sort_order ASC, rr.id ASC`,
      [req.params.id]
    );

    return res.json({ permit, files: filesResult.rows });
  } catch (err) {
    console.error('Get permit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/renovation/permits/:id/review — admin: review permit
router.put('/permits/:id/review', requireSession, async (req, res) => {
  const { status, rejection_reason, file_reviews } = req.body;
  const allowedStatuses = ['pending', 'complete', 'incomplete', 'rejected'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowedStatuses.join(', ')}` });
  }

  try {
    const permitResult = await query(
      `UPDATE renovation_permits
       SET status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, rejection_reason || null, req.session.adminId, req.params.id]
    );
    if (permitResult.rows.length === 0) return res.status(404).json({ error: 'Permit not found' });
    const permit = permitResult.rows[0];

    // Update file reviews
    if (Array.isArray(file_reviews) && file_reviews.length > 0) {
      for (const fr of file_reviews) {
        await query(
          `UPDATE renovation_permit_files
           SET is_valid = $1, reviewed_at = NOW()
           WHERE id = $2 AND permit_id = $3`,
          [fr.is_valid, fr.file_id, req.params.id]
        );
      }
    }

    return res.json({ permit, message: 'Review submitted' });
  } catch (err) {
    console.error('Review permit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
