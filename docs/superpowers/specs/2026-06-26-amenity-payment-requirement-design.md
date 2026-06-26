# Amenity Payment Requirement — Design Spec
**Date:** 2026-06-26
**Status:** Approved

## Overview

Admins can mark any amenity as requiring a separate usage fee. Homeowners who book a payment-required amenity must upload a photo of their payment receipt before the request can be submitted. Admins review the receipt alongside the booking and approve or reject with optional notes.

---

## Section 1 — Database

**Migration file:** `server/schema-v9.sql`

```sql
-- Amenity payment configuration
ALTER TABLE amenities ADD COLUMN requires_payment BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE amenities ADD COLUMN usage_fee NUMERIC(10,2);

-- Booking payment receipt
ALTER TABLE amenity_bookings ADD COLUMN payment_image TEXT;
```

- `requires_payment` defaults to `FALSE` — all existing amenities are unaffected.
- `usage_fee` is nullable; only meaningful when `requires_payment = TRUE`.
- `payment_image` is nullable (TEXT / base64); populated only when the amenity required payment at booking time.

---

## Section 2 — Server / API

### `server/routes/amenities.js`

- **`POST /api/amenities`** — accept `requires_payment` (boolean) and `usage_fee` (numeric) in request body; insert into new columns.
- **`PUT /api/amenities/:id`** — accept and update `requires_payment` and `usage_fee`.
- **`GET /api/amenities`** — no change needed; already selects `*`, new columns come through automatically.

### `server/routes/amenity-bookings.js`

- **`POST /api/amenity-bookings`** — after existing validations, query `requires_payment` from `amenities` for the requested `amenity_id`. If `requires_payment = TRUE` and `payment_image` is absent → return `400 { error: 'Payment receipt is required for this amenity' }`. Otherwise insert `payment_image` into the new column.
- **`GET /api/amenity-bookings/:id/payment-image`** (new, `requireSession`) — returns `{ payment_image }` for that booking ID. Keeps base64 data out of the bookings list response. Same pattern as `GET /api/payment-proofs/:id/image`.
- Existing **approve** and **reject** routes are unchanged.

### Validation strategy — two layers

1. **Client-side (primary):** Mobile app blocks submission before the request is sent if `requires_payment = true` and no image is captured.
2. **Server-side (safety net):** API rejects the request with `400` if the condition is violated anyway (guards against direct API calls).

---

## Section 3 — Web Admin Panel

### `web/amenities.html` + `web/js/amenities.js`

**Amenity form (Add / Edit):**
- Add a **radio button pair**: "No Payment Required" (default) / "Requires Payment" bound to `requires_payment`.
- Add a **fee amount input** (numeric, ₱ prefix) — shown only when "Requires Payment" is selected; bound to `usage_fee`.
- `saveAmenity()` includes `requires_payment` and `usage_fee` in the PUT/POST body.
- `editAmenity()` pre-fills the radio and fee field from the loaded amenity data.
- `resetForm()` resets radio to "No Payment Required" and clears the fee field.

**Amenities list table:**
- Add a **"Payment"** column: shows `—` when `requires_payment = false`, or `₱[amount]` when true.

### `web/amenity-bookings.html` + `web/js/amenity-bookings.js`

**Booking review panel:**
- When a booking has a `payment_image`, show a **"View Receipt"** button in the booking row or detail view.
- Clicking it fetches `GET /api/amenity-bookings/:id/payment-image` and displays the image in a modal — same UX as the payment proof image viewer.
- Approve / reject flows are unchanged; admin provides review notes on rejection.

---

## Section 4 — Mobile (Android)

### `AppModels.kt`

```kotlin
// In Amenity data class — add:
@SerializedName("requires_payment") val requiresPayment: Boolean = false,
@SerializedName("usage_fee") val usageFee: Double? = null,

// In BookingRequest data class — add:
@SerializedName("payment_image") val paymentImage: String? = null,
```

### `HomeownerDashboardFragment.kt` — `showBookingSheet()`

- If `amenity.requiresPayment`:
  - Show a **fee notice** at the top of the sheet:
    *"This amenity requires a usage fee of ₱[amount]. Please pay and upload your receipt before submitting."*
  - Show **Camera** and **Gallery** buttons to capture the receipt (same pattern as `PaymentProofFragment` / `VehiclesFragment`, including runtime CAMERA permission check).
  - Show a **preview area** that displays the captured image.
  - **Submit button starts disabled** when `requiresPayment = true`; it enables only after an image is attached.
- On submit, include `paymentImage` in `BookingRequest`. If `requiresPayment` and no image is attached, the button remains disabled — the request never leaves the device.
- Register `requestCameraPermission` and `takePicture` / `pickFromGallery` launchers at class level (before `onAttach`), consistent with existing camera code in the fragment.

---

## Data Flow Summary

```
Admin sets requires_payment + usage_fee on amenity
        ↓
Homeowner opens booking sheet → app shows fee notice + receipt upload UI
        ↓
Homeowner pays out-of-app → captures/uploads receipt → Submit enables
        ↓
POST /api/amenity-bookings { ..., payment_image: "<base64>" }
  Server validates: requires_payment=true → payment_image present ✓
        ↓
Booking created (status: pending)
        ↓
Admin reviews → clicks "View Receipt" → sees image
Admin approves or rejects with notes
        ↓
Homeowner sees status update in My Requests / Notifications
```

---

## Out of Scope

- Online payment processing (GCash, bank transfer) — homeowner pays externally.
- Fee amount validation by admin (admin visually inspects the receipt).
- Fee history tracking (changing the fee does not retroactively affect past bookings).
