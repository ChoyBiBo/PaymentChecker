require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const path = require('path');
const { pool } = require('./db');

const authRoutes = require('./routes/auth');
const homeownersRoutes = require('./routes/homeowners');
const paymentsRoutes = require('./routes/payments');
const qrRoutes = require('./routes/qr');
const scanRoutes = require('./routes/scan');
const reportsRoutes = require('./routes/reports');
const announcementsRoutes = require('./routes/announcements');
const adminUsersRoutes = require('./routes/admin-users');
const appAuthRoutes = require('./routes/app-auth');
const appApiRoutes = require('./routes/app-api');
const amenitiesRoutes = require('./routes/amenities');
const amenityBookingsRoutes = require('./routes/amenity-bookings');
const appUsersRoutes = require('./routes/app-users');
const notificationsRoutes = require('./routes/notifications');
const vehiclesRoutes = require('./routes/vehicles');
const vehicleStickersRoutes = require('./routes/vehicle-stickers');
const vehicleScanRoutes = require('./routes/vehicle-scan');
const entryLogsRoutes = require('./routes/entry-logs');
const paymentProofsRoutes = require('./routes/payment-proofs');
const renovationRoutes = require('./routes/renovation');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway/Render proxy for secure cookies
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  })
);

// Body parser — 5MB limit to accommodate base64-encoded OR images
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));

// Session
app.use(
  session({
    store: new PgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'hoa-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { status: 'error', message: 'Rate limit exceeded' },
});

// API routes — rate limit only the login endpoint, not /me or /logout
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/homeowners', homeownersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/scan', scanLimiter, scanRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/admin-users', adminUsersRoutes);
app.use('/api/app/auth', appAuthRoutes);
app.use('/api/app', appApiRoutes);
app.use('/api/amenities', amenitiesRoutes);
app.use('/api/amenity-bookings', amenityBookingsRoutes);
app.use('/api/app-users', appUsersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/vehicle-stickers', vehicleStickersRoutes);
app.use('/api/vehicle-scan', scanLimiter, vehicleScanRoutes);
app.use('/api/entry-logs', entryLogsRoutes);
app.use('/api/payment-proofs', paymentProofsRoutes);
app.use('/api/renovation', renovationRoutes);

// Serve static web files
const webDir = path.join(__dirname, '..', 'web');
app.use(express.static(webDir));

// Root — landing page (served automatically by express.static as index.html)

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Fallback: serve landing page for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\nHOA Payment Checker running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
