-- Schema v4: Payment Proof Submissions
-- Run this in the Railway PostgreSQL query editor

CREATE TABLE IF NOT EXISTS payment_proofs (
    id              SERIAL PRIMARY KEY,
    homeowner_id    INTEGER NOT NULL REFERENCES homeowners(id) ON DELETE CASCADE,
    period_year     SMALLINT NOT NULL,
    period_month    SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    image_data      TEXT NOT NULL,  -- base64-encoded JPEG image
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by     INTEGER REFERENCES admin_users(id),
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_homeowner ON payment_proofs(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_period ON payment_proofs(period_year, period_month);
