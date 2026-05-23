-- HOA Payment Checker Database Schema
-- Run with: psql -d HOA_App -f server/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Admin users
CREATE TABLE IF NOT EXISTS admin_users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(60) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(120),
    role            VARCHAR(20) NOT NULL DEFAULT 'staff',  -- 'superadmin' | 'staff'
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

-- Homeowners
CREATE TABLE IF NOT EXISTS homeowners (
    id              SERIAL PRIMARY KEY,
    qr_token        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    full_name       VARCHAR(120) NOT NULL,
    lot_number      VARCHAR(30) NOT NULL,
    block_number    VARCHAR(30),
    address         TEXT,
    contact_phone   VARCHAR(30),
    contact_email   VARCHAR(120),
    monthly_due     NUMERIC(10,2) NOT NULL DEFAULT 500.00,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monthly dues payments
CREATE TABLE IF NOT EXISTS dues_payments (
    id              SERIAL PRIMARY KEY,
    homeowner_id    INTEGER NOT NULL REFERENCES homeowners(id) ON DELETE CASCADE,
    period_year     SMALLINT NOT NULL,
    period_month    SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    amount_paid     NUMERIC(10,2) NOT NULL,
    paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by     INTEGER REFERENCES admin_users(id),
    receipt_number  VARCHAR(60),
    payment_method  VARCHAR(30) NOT NULL DEFAULT 'cash',
    notes           TEXT,
    UNIQUE (homeowner_id, period_year, period_month)
);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    body            TEXT NOT NULL,
    posted_by       INTEGER REFERENCES admin_users(id),
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    admin_id        INTEGER REFERENCES admin_users(id),
    action          VARCHAR(60) NOT NULL,
    entity_type     VARCHAR(40),
    entity_id       INTEGER,
    detail          JSONB,
    performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session store (for connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
    "sid"    VARCHAR NOT NULL COLLATE "default",
    "sess"   JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL
) WITH (OIDS=FALSE);
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Indexes
CREATE INDEX IF NOT EXISTS idx_homeowners_qr_token ON homeowners(qr_token);
CREATE INDEX IF NOT EXISTS idx_homeowners_lot ON homeowners(lot_number);
CREATE INDEX IF NOT EXISTS idx_dues_payments_homeowner ON dues_payments(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_dues_payments_period ON dues_payments(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
