require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool, query } = require('./db');

async function setup() {
  console.log('Setting up HOA Payment Checker database...\n');

  // Run schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  console.log('Creating tables...');
  await pool.query(schema);
  console.log('Tables created.\n');

  // Check if admin user already exists
  const existing = await query('SELECT id FROM admin_users WHERE username = $1', ['admin']);
  if (existing.rows.length > 0) {
    console.log('Admin user already exists. Skipping admin creation.');
  } else {
    const passwordHash = await bcrypt.hash('admin123', 12);
    await query(
      `INSERT INTO admin_users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)`,
      ['admin', passwordHash, 'System Administrator', 'superadmin']
    );
    console.log('Initial admin user created:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('\n  *** IMPORTANT: Change the password after first login! ***\n');
  }

  console.log('Database setup complete.');
  await pool.end();
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
