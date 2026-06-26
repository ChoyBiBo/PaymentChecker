-- Amenity payment configuration
ALTER TABLE amenities ADD COLUMN IF NOT EXISTS requires_payment BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE amenities ADD COLUMN IF NOT EXISTS usage_fee NUMERIC(10,2);

-- Booking payment receipt (base64 image data)
ALTER TABLE amenity_bookings ADD COLUMN IF NOT EXISTS payment_image TEXT;
