-- Sticker requirements maintained by admin
CREATE TABLE IF NOT EXISTS sticker_requirements (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents submitted by homeowner per sticker application
CREATE TABLE IF NOT EXISTS sticker_req_docs (
    id                  SERIAL PRIMARY KEY,
    vehicle_sticker_id  INTEGER NOT NULL REFERENCES vehicle_stickers(id) ON DELETE CASCADE,
    requirement_id      INTEGER NOT NULL REFERENCES sticker_requirements(id),
    file_data           TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
