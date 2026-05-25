-- schema-v8: Renovation permit workers
CREATE TABLE IF NOT EXISTS renovation_permit_workers (
    id              SERIAL PRIMARY KEY,
    permit_id       INTEGER NOT NULL REFERENCES renovation_permits(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    id_card_image   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
