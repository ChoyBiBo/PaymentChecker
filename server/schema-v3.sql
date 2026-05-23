-- HOA Payment Checker v3 Schema Migration
-- Run in Railway PostgreSQL Query editor

CREATE TABLE IF NOT EXISTS vehicles (
    id              SERIAL PRIMARY KEY,
    homeowner_id    INTEGER NOT NULL REFERENCES homeowners(id) ON DELETE CASCADE,
    plate_number    VARCHAR(20) NOT NULL UNIQUE,
    make            VARCHAR(60),
    model           VARCHAR(60),
    color           VARCHAR(40),
    year            SMALLINT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_stickers (
    id              SERIAL PRIMARY KEY,
    vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    homeowner_id    INTEGER NOT NULL REFERENCES homeowners(id) ON DELETE CASCADE,
    sticker_year    SMALLINT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    qr_token        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    amount          NUMERIC(10,2),
    receipt_number  VARCHAR(60),
    review_notes    TEXT,
    reviewed_by     INTEGER REFERENCES admin_users(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vehicle_id, sticker_year)
);

CREATE TABLE IF NOT EXISTS entry_logs (
    id              BIGSERIAL PRIMARY KEY,
    homeowner_id    INTEGER NOT NULL REFERENCES homeowners(id) ON DELETE CASCADE,
    scan_type       VARCHAR(20) NOT NULL,
    reference_id    INTEGER NOT NULL,
    scanned_by      INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
    guard_name      VARCHAR(120),
    entry_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_homeowner ON vehicles(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_stickers_vehicle ON vehicle_stickers(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_stickers_homeowner ON vehicle_stickers(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_stickers_qr ON vehicle_stickers(qr_token);
CREATE INDEX IF NOT EXISTS idx_entry_logs_homeowner ON entry_logs(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_entry_logs_entry_at ON entry_logs(entry_at DESC);
