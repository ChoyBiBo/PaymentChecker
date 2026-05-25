-- Schema v7: Amenity photo support
-- Run in Railway PostgreSQL query editor

ALTER TABLE amenities ADD COLUMN IF NOT EXISTS image_data TEXT;
