-- Schema v6: Renovation Permits
-- Run in Railway PostgreSQL query editor

CREATE TABLE IF NOT EXISTS renovation_requirements (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    sample_image TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS renovation_permits (
    id               SERIAL PRIMARY KEY,
    homeowner_id     INTEGER NOT NULL REFERENCES homeowners(id) ON DELETE CASCADE,
    notes            TEXT,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    reviewed_by      INTEGER REFERENCES admin_users(id),
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS renovation_permit_files (
    id              SERIAL PRIMARY KEY,
    permit_id       INTEGER NOT NULL REFERENCES renovation_permits(id) ON DELETE CASCADE,
    requirement_id  INTEGER NOT NULL REFERENCES renovation_requirements(id),
    file_data       TEXT NOT NULL,
    file_name       VARCHAR(200),
    is_valid        BOOLEAN,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(permit_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_renovation_permits_homeowner ON renovation_permits(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_renovation_permits_status ON renovation_permits(status);
CREATE INDEX IF NOT EXISTS idx_renovation_permit_files_permit ON renovation_permit_files(permit_id);
