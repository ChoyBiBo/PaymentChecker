const bcrypt = require('bcrypt');
const { query } = require('./db');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@1234';

async function seedDemoAccounts() {
  try {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // Demo admin (web panel — role: staff, not superadmin)
    await query(
      `INSERT INTO admin_users (username, password_hash, full_name, role, is_active)
       VALUES ('demo_admin', $1, 'Demo Admin', 'staff', true)
       ON CONFLICT (username) DO NOTHING`,
      [hash]
    );

    // Demo homeowner record — identified by a fixed email so we can find it if it already exists
    let homeownerId;
    const existingHo = await query(
      `SELECT id FROM homeowners WHERE contact_email = 'demo@hoa-connect.app'`
    );
    if (existingHo.rows.length > 0) {
      homeownerId = existingHo.rows[0].id;
    } else {
      const inserted = await query(
        `INSERT INTO homeowners
           (full_name, lot_number, block_number, contact_email, monthly_due)
         VALUES ('Demo Homeowner', 'DEMO', 'DEMO', 'demo@hoa-connect.app', 500.00)
         RETURNING id`
      );
      homeownerId = inserted.rows[0].id;
    }

    // Demo homeowner app user
    await query(
      `INSERT INTO app_users (username, password_hash, full_name, role, is_active, homeowner_id)
       VALUES ('demo_homeowner', $1, 'Demo Homeowner', 'homeowner', true, $2)
       ON CONFLICT (username) DO NOTHING`,
      [hash, homeownerId]
    );

    // Demo guard app user
    await query(
      `INSERT INTO app_users (username, password_hash, full_name, role, is_active)
       VALUES ('demo_guard', $1, 'Demo Guard', 'guard', true, NULL)
       ON CONFLICT (username) DO NOTHING`,
      [hash]
    );

    console.log('Demo accounts ready (password: Demo@1234)');
  } catch (err) {
    console.error('Demo seed error (non-fatal):', err.message);
  }
}

module.exports = { seedDemoAccounts };
