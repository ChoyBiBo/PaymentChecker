-- Schema v5: Add image_data to vehicle_stickers
-- Run in Railway PostgreSQL query editor

ALTER TABLE vehicle_stickers ADD COLUMN IF NOT EXISTS image_data TEXT;
