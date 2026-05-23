-- HOA Payment Checker v2 Schema Migration
-- Run with: psql -d HOA_App -f server/schema-v2.sql

-- App users (homeowners and guards using the Android app)
CREATE TABLE IF NOT EXISTS app_users (
    id              SERIAL PRIMARY KEY,
    homeowner_id    INTEGER REFERENCES homeowners(id) ON DELETE SET NULL,
    username        VARCHAR(60) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(120),
    role            VARCHAR(20) NOT NULL DEFAULT 'homeowner', -- 'homeowner' | 'guard'
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

-- Amenities
CREATE TABLE IF NOT EXISTS amenities (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    location    VARCHAR(100),
    capacity    INTEGER,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Amenity usage bookings / requests
CREATE TABLE IF NOT EXISTS amenity_bookings (
    id              SERIAL PRIMARY KEY,
    amenity_id      INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
    homeowner_id    INTEGER NOT NULL REFERENCES homeowners(id) ON DELETE CASCADE,
    app_user_id     INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
    requested_date  DATE NOT NULL,
    time_start      TIME NOT NULL,
    time_end        TIME NOT NULL,
    purpose         TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    reviewed_by     INTEGER REFERENCES admin_users(id),
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin notifications
CREATE TABLE IF NOT EXISTS notifications (
    id              SERIAL PRIMARY KEY,
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    message         TEXT NOT NULL,
    related_type    VARCHAR(40),
    related_id      INTEGER,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_app_users_homeowner ON app_users(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_amenity_bookings_amenity ON amenity_bookings(amenity_id);
CREATE INDEX IF NOT EXISTS idx_amenity_bookings_homeowner ON amenity_bookings(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_amenity_bookings_date ON amenity_bookings(requested_date);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

-- Seed default amenities
INSERT INTO amenities (name, description, location, capacity) VALUES
  ('Swimming Pool', 'Outdoor swimming pool available for homeowners', 'Recreation Area', 20),
  ('Function Hall', 'Air-conditioned hall for events and gatherings', 'Building A, Ground Floor', 100),
  ('Basketball Court', 'Full-sized outdoor basketball court', 'Sports Complex', 10),
  ('Gym / Fitness Center', 'Fully equipped indoor gym', 'Building B, 2nd Floor', 15),
  ('Clubhouse', 'Multi-purpose clubhouse with kitchen facilities', 'Main Gate Area', 50)
ON CONFLICT DO NOTHING;
