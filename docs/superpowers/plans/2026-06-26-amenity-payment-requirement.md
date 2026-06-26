# Amenity Payment Requirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to mark amenities as requiring a usage fee; homeowners must upload a payment receipt before booking such amenities; admins view the receipt when reviewing bookings.

**Architecture:** DB migration adds two columns to `amenities` and one to `amenity_bookings`. Server routes enforce the constraint and expose a receipt image endpoint. Web admin panel shows payment config in the amenity form and receipt in the booking review modal. Android shows a fee notice + camera/gallery UI in the booking sheet when the amenity requires payment.

**Tech Stack:** PostgreSQL, Node.js/Express, Vanilla JS/HTML, Kotlin/Android

## Global Constraints

- Web JS uses globals `esc()`, `showToast()`, `formatDate()` from `api.js` — call them directly.
- Android `registerForActivityResult` launchers must be declared at class level (before `onAttach`).
- Android FileProvider authority: `${requireContext().packageName}.provider`
- Gradle binary: `C:\Users\ASUS Vivobook\.gradle\wrapper\dists\gradle-9.4.1-bin\arn2x92ynaizyzdaamcbpbhtj\gradle-9.4.1\bin\gradle.bat`
- Keystore: storePassword=286144, keyPassword=Welcome@1234, alias=key0

---

### Task 1: Database Migration

**Files:**
- Create: `server/schema-v9.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Amenity payment configuration
ALTER TABLE amenities ADD COLUMN IF NOT EXISTS requires_payment BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE amenities ADD COLUMN IF NOT EXISTS usage_fee NUMERIC(10,2);

-- Booking payment receipt (base64 image)
ALTER TABLE amenity_bookings ADD COLUMN IF NOT EXISTS payment_image TEXT;
```

- [ ] **Step 2: Run the migration**

```bash
psql -U postgres -d paymentchecker -f server/schema-v9.sql
```
Expected: `ALTER TABLE` × 3, no errors.

---

### Task 2: Server — Amenities Route

**Files:**
- Modify: `server/routes/amenities.js`

- [ ] **Step 1: Update POST handler to accept payment fields**

Find the POST destructuring and INSERT:
```javascript
    const { name, description, location, capacity, image_data } = req.body;
    try {
      const result = await query(
        `INSERT INTO amenities (name, description, location, capacity, image_data)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, description || null, location || null, capacity || null, image_data || null]
      );
```
Replace with:
```javascript
    const { name, description, location, capacity, image_data, requires_payment, usage_fee } = req.body;
    try {
      const result = await query(
        `INSERT INTO amenities (name, description, location, capacity, image_data, requires_payment, usage_fee)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [name, description || null, location || null, capacity || null, image_data || null,
         requires_payment === true, usage_fee || null]
      );
```

- [ ] **Step 2: Update PUT handler to accept payment fields**

Find the PUT destructuring and UPDATE:
```javascript
  const { name, description, location, capacity, is_active, image_data } = req.body;
  try {
    const result = await query(
      `UPDATE amenities
       SET name = COALESCE($1, name),
           description = $2,
           location = $3,
           capacity = $4,
           is_active = COALESCE($5, is_active),
           image_data = COALESCE($6, image_data)
       WHERE id = $7 RETURNING *`,
      [name || null, description ?? null, location ?? null, capacity ?? null, is_active ?? null, image_data ?? null, req.params.id]
    );
```
Replace with:
```javascript
  const { name, description, location, capacity, is_active, image_data, requires_payment, usage_fee } = req.body;
  try {
    const result = await query(
      `UPDATE amenities
       SET name = COALESCE($1, name),
           description = $2,
           location = $3,
           capacity = $4,
           is_active = COALESCE($5, is_active),
           image_data = COALESCE($6, image_data),
           requires_payment = COALESCE($8::boolean, requires_payment),
           usage_fee = COALESCE($9::numeric, usage_fee)
       WHERE id = $7 RETURNING *`,
      [name || null, description ?? null, location ?? null, capacity ?? null, is_active ?? null,
       image_data ?? null, req.params.id, requires_payment ?? null, usage_fee ?? null]
    );
```

---

### Task 3: Server — Amenity Bookings Route

**Files:**
- Modify: `server/routes/amenity-bookings.js`

- [ ] **Step 1: Update GET list to exclude payment_image blob, add has_payment_image flag**

Find in the GET `/` handler:
```javascript
    let sql = `
      SELECT ab.*, a.name AS amenity_name, h.full_name AS homeowner_name,
             h.lot_number, h.block_number,
             au.full_name AS reviewed_by_name
      FROM amenity_bookings ab
```
Replace with:
```javascript
    let sql = `
      SELECT ab.id, ab.amenity_id, ab.homeowner_id, ab.app_user_id,
             ab.requested_date, ab.time_start, ab.time_end, ab.purpose,
             ab.status, ab.reviewed_by, ab.reviewed_at, ab.review_notes, ab.created_at,
             (ab.payment_image IS NOT NULL) AS has_payment_image,
             a.name AS amenity_name, h.full_name AS homeowner_name,
             h.lot_number, h.block_number,
             au.full_name AS reviewed_by_name
      FROM amenity_bookings ab
```

- [ ] **Step 2: Update POST handler to validate and store payment_image**

Find:
```javascript
  const { amenity_id, requested_date, time_start, time_end, purpose } = req.body;
```
Replace with:
```javascript
  const { amenity_id, requested_date, time_start, time_end, purpose, payment_image } = req.body;
```

Find the dues payment check block ending with `}` and then `// Check for conflicting approved bookings`:
```javascript
    // Check for conflicting approved bookings
    const conflict = await query(
```
Insert BEFORE that comment:
```javascript
    // Validate payment receipt requirement
    const amenityCheck = await query(
      'SELECT requires_payment FROM amenities WHERE id = $1',
      [amenity_id]
    );
    if (amenityCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Amenity not found' });
    }
    if (amenityCheck.rows[0].requires_payment && !payment_image) {
      return res.status(400).json({ error: 'Payment receipt is required for this amenity' });
    }

```

Find the INSERT query in POST:
```javascript
    const result = await query(
      `INSERT INTO amenity_bookings
        (amenity_id, homeowner_id, app_user_id, requested_date, time_start, time_end, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        amenity_id, req.appUser.homeownerId, req.appUser.userId,
        requested_date, time_start, time_end, purpose || null,
      ]
    );
```
Replace with:
```javascript
    const result = await query(
      `INSERT INTO amenity_bookings
        (amenity_id, homeowner_id, app_user_id, requested_date, time_start, time_end, purpose, payment_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        amenity_id, req.appUser.homeownerId, req.appUser.userId,
        requested_date, time_start, time_end, purpose || null, payment_image || null,
      ]
    );
```

- [ ] **Step 3: Add GET /:id/payment-image endpoint**

After the `GET /mine` route block and before the `PUT /:id/approve` route, insert:
```javascript
// GET /api/amenity-bookings/:id/payment-image — admin: view payment receipt
router.get('/:id/payment-image', requireSession, async (req, res) => {
  try {
    const result = await query(
      'SELECT payment_image FROM amenity_bookings WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    if (!result.rows[0].payment_image) return res.status(404).json({ error: 'No receipt for this booking' });
    return res.json({ payment_image: result.rows[0].payment_image });
  } catch (err) {
    console.error('Get booking receipt error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

---

### Task 4: Server — Dashboard Amenities Query

**Files:**
- Modify: `server/routes/app-api.js`

- [ ] **Step 1: Add requires_payment and usage_fee to dashboard amenities SELECT**

Find in the `GET /dashboard` handler:
```javascript
    const amenities = await query(
      `SELECT a.id, a.name, a.description, a.location, a.capacity, a.image_data,
```
Replace with:
```javascript
    const amenities = await query(
      `SELECT a.id, a.name, a.description, a.location, a.capacity, a.image_data,
         a.requires_payment, a.usage_fee,
```

---

### Task 5: Web Admin — Amenities Page

**Files:**
- Modify: `web/amenities.html`
- Modify: `web/js/amenities.js`

- [ ] **Step 1: Add payment radio and fee field to amenities.html**

Find:
```html
          <div style="display:flex;gap:8px;margin-top:4px;">
            <button class="btn btn-primary" onclick="saveAmenity()">Save</button>
            <button class="btn btn-ghost" onclick="resetForm()">Clear</button>
          </div>
```
Replace with:
```html
          <div class="form-group">
            <label class="form-label">Payment</label>
            <div style="display:flex;gap:16px;align-items:center;margin-top:4px;">
              <label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-size:14px;">
                <input type="radio" name="f-payment" id="f-payment-no" value="no" checked onchange="toggleFeeField()"> No Payment Required
              </label>
              <label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-size:14px;">
                <input type="radio" name="f-payment" id="f-payment-yes" value="yes" onchange="toggleFeeField()"> Requires Payment
              </label>
            </div>
          </div>
          <div class="form-group" id="f-fee-group" style="display:none;">
            <label class="form-label">Usage Fee (₱)</label>
            <input id="f-fee" type="number" class="form-control" placeholder="e.g. 500" min="0" step="0.01">
          </div>
          <div style="display:flex;gap:8px;margin-top:4px;">
            <button class="btn btn-primary" onclick="saveAmenity()">Save</button>
            <button class="btn btn-ghost" onclick="resetForm()">Clear</button>
          </div>
```

- [ ] **Step 2: Add toggleFeeField to amenities.js**

After the `clearAmenityImg()` function, add:
```javascript
function toggleFeeField() {
  const requiresPayment = document.getElementById('f-payment-yes').checked;
  document.getElementById('f-fee-group').style.display = requiresPayment ? 'block' : 'none';
}
```

- [ ] **Step 3: Update saveAmenity to include payment fields**

Find:
```javascript
  const body = {
    name,
    description: document.getElementById('f-desc').value.trim() || null,
    location: document.getElementById('f-loc').value.trim() || null,
    capacity: document.getElementById('f-cap').value ? parseInt(document.getElementById('f-cap').value) : null,
    image_data: pendingImgBase64 || null,
  };
```
Replace with:
```javascript
  const requiresPayment = document.getElementById('f-payment-yes').checked;
  const body = {
    name,
    description: document.getElementById('f-desc').value.trim() || null,
    location: document.getElementById('f-loc').value.trim() || null,
    capacity: document.getElementById('f-cap').value ? parseInt(document.getElementById('f-cap').value) : null,
    image_data: pendingImgBase64 || null,
    requires_payment: requiresPayment,
    usage_fee: requiresPayment ? (parseFloat(document.getElementById('f-fee').value) || null) : null,
  };
```

- [ ] **Step 4: Update editAmenity to pre-fill payment fields**

In `editAmenity(id)`, find the line:
```javascript
  document.getElementById('f-name').focus();
```
Insert BEFORE it:
```javascript
  if (a.requires_payment) {
    document.getElementById('f-payment-yes').checked = true;
    document.getElementById('f-fee').value = a.usage_fee || '';
    document.getElementById('f-fee-group').style.display = 'block';
  } else {
    document.getElementById('f-payment-no').checked = true;
    document.getElementById('f-fee').value = '';
    document.getElementById('f-fee-group').style.display = 'none';
  }
```

- [ ] **Step 5: Update resetForm to clear payment fields**

In `resetForm()`, find:
```javascript
  clearAmenityImg();
```
Insert AFTER it:
```javascript
  document.getElementById('f-payment-no').checked = true;
  document.getElementById('f-fee').value = '';
  document.getElementById('f-fee-group').style.display = 'none';
```

- [ ] **Step 6: Add Payment column to the amenities table in renderAmenities**

Find the table header:
```javascript
      <thead><tr>
        <th>Photo</th><th>Name</th><th>Location</th><th>Capacity</th><th>Status</th><th>Actions</th>
      </tr></thead>
```
Replace with:
```javascript
      <thead><tr>
        <th>Photo</th><th>Name</th><th>Location</th><th>Capacity</th><th>Payment</th><th>Status</th><th>Actions</th>
      </tr></thead>
```

Find in the row template:
```javascript
            <td>${a.capacity ? a.capacity + ' pax' : '—'}</td>
            <td>
              <span class="badge ${a.current_status === 'in_use' ? 'badge-in_use' : 'badge-available'}">
```
Replace with:
```javascript
            <td>${a.capacity ? a.capacity + ' pax' : '—'}</td>
            <td>${a.requires_payment ? `<span style="color:#1A6B7B;font-weight:600;">₱${Number(a.usage_fee || 0).toFixed(2)}</span>` : '<span style="color:#94A3B8;">—</span>'}</td>
            <td>
              <span class="badge ${a.current_status === 'in_use' ? 'badge-in_use' : 'badge-available'}">
```

---

### Task 6: Web Admin — Amenity Bookings Page

**Files:**
- Modify: `web/amenity-bookings.html`
- Modify: `web/js/amenity-bookings.js`

- [ ] **Step 1: Add receipt modal to amenity-bookings.html**

Find:
```html
<script src="/js/api.js"></script>
```
Insert BEFORE it:
```html
<!-- Receipt image modal -->
<div class="modal-overlay" id="receipt-modal" style="display:none;">
  <div class="modal" style="max-width:500px;">
    <div class="modal-header">
      <div class="modal-title">Payment Receipt</div>
      <button class="modal-close" onclick="closeReceiptModal()">×</button>
    </div>
    <div class="modal-body" style="text-align:center;padding:16px;">
      <img id="receipt-img" src="" alt="Payment Receipt" style="max-width:100%;max-height:400px;object-fit:contain;border-radius:6px;">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeReceiptModal()">Close</button>
    </div>
  </div>
</div>

```

- [ ] **Step 2: Add Receipt column to bookings table in renderBookings**

Find the header:
```javascript
      <thead><tr>
        <th>Homeowner</th><th>Amenity</th><th>Date</th><th>Time</th><th>Purpose</th><th>Status</th><th>Actions</th>
      </tr></thead>
```
Replace with:
```javascript
      <thead><tr>
        <th>Homeowner</th><th>Amenity</th><th>Date</th><th>Time</th><th>Purpose</th><th>Receipt</th><th>Status</th><th>Actions</th>
      </tr></thead>
```

Find in the row template:
```javascript
            <td>${b.purpose ? esc(b.purpose) : '—'}</td>
            <td><span class="badge badge-${b.status}">${b.status}</span></td>
```
Replace with:
```javascript
            <td>${b.purpose ? esc(b.purpose) : '—'}</td>
            <td>${b.has_payment_image ? `<button class="btn btn-ghost btn-sm" onclick="viewReceipt(${b.id})">View</button>` : '—'}</td>
            <td><span class="badge badge-${b.status}">${b.status}</span></td>
```

- [ ] **Step 3: Show receipt link in review modal**

In `openReview(id)`, find:
```javascript
      ${b.purpose ? `<tr><td style="padding:3px 8px 3px 0;color:var(--text-muted)">Purpose</td><td>${esc(b.purpose)}</td></tr>` : ''}
    </table>`;
```
Replace with:
```javascript
      ${b.purpose ? `<tr><td style="padding:3px 8px 3px 0;color:var(--text-muted)">Purpose</td><td>${esc(b.purpose)}</td></tr>` : ''}
      ${b.has_payment_image ? `<tr><td colspan="2" style="padding-top:10px;"><button class="btn btn-ghost btn-sm" onclick="viewReceipt(${b.id})">View Payment Receipt</button></td></tr>` : ''}
    </table>`;
```

- [ ] **Step 4: Add viewReceipt and closeReceiptModal functions**

After the `markAllRead` function, add:
```javascript
async function viewReceipt(id) {
  try {
    const data = await api.get(`/api/amenity-bookings/${id}/payment-image`);
    const imgSrc = data.payment_image.startsWith('data:') ? data.payment_image : `data:image/jpeg;base64,${data.payment_image}`;
    document.getElementById('receipt-img').src = imgSrc;
    document.getElementById('receipt-modal').style.display = 'flex';
  } catch (err) {
    showToast('Could not load receipt image', 'error');
  }
}

function closeReceiptModal() {
  document.getElementById('receipt-modal').style.display = 'none';
  document.getElementById('receipt-img').src = '';
}
```

---

### Task 7: Android — AppModels.kt

**Files:**
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/data/model/AppModels.kt`

- [ ] **Step 1: Add requiresPayment and usageFee to Amenity**

Find:
```kotlin
data class Amenity(
    val id: Int,
    val name: String,
    val description: String?,
    val location: String?,
    val capacity: Int?,
    @SerializedName("current_status") val currentStatus: String,
    @SerializedName("image_data") val imageData: String? = null,
    @SerializedName("upcoming_schedule") val upcomingSchedule: List<AmenityScheduleSlot>? = null
)
```
Replace with:
```kotlin
data class Amenity(
    val id: Int,
    val name: String,
    val description: String?,
    val location: String?,
    val capacity: Int?,
    @SerializedName("current_status") val currentStatus: String,
    @SerializedName("image_data") val imageData: String? = null,
    @SerializedName("upcoming_schedule") val upcomingSchedule: List<AmenityScheduleSlot>? = null,
    @SerializedName("requires_payment") val requiresPayment: Boolean = false,
    @SerializedName("usage_fee") val usageFee: Double? = null
)
```

- [ ] **Step 2: Add paymentImage to BookingRequest**

Find:
```kotlin
data class BookingRequest(
    @SerializedName("amenity_id") val amenityId: Int,
    @SerializedName("requested_date") val requestedDate: String,
    @SerializedName("time_start") val timeStart: String,
    @SerializedName("time_end") val timeEnd: String,
    val purpose: String?
)
```
Replace with:
```kotlin
data class BookingRequest(
    @SerializedName("amenity_id") val amenityId: Int,
    @SerializedName("requested_date") val requestedDate: String,
    @SerializedName("time_start") val timeStart: String,
    @SerializedName("time_end") val timeEnd: String,
    val purpose: String?,
    @SerializedName("payment_image") val paymentImage: String? = null
)
```

---

### Task 8: Android — HomeownerDashboardFragment.kt

**Files:**
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/ui/homeowner/HomeownerDashboardFragment.kt`

- [ ] **Step 1: Add missing imports**

After the existing import block (after `import java.util.Calendar`), add:
```kotlin
import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
```

- [ ] **Step 2: Add class-level state vars and activity result launchers**

After:
```kotlin
    private lateinit var prefs: PreferencesManager
    private var vehicleCurrentYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
```
Add:
```kotlin
    private var bookingCapturedImageBase64: String? = null
    private var bookingCameraImageUri: Uri? = null
    private var currentBookingPreviewIv: android.widget.ImageView? = null
    private var currentBookingSubmitBtn: android.widget.Button? = null

    private val bookingTakePicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success && bookingCameraImageUri != null) processBookingImage(bookingCameraImageUri!!)
    }

    private val bookingPickFromGallery = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) processBookingImage(uri)
    }

    private val bookingRequestCameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            bookingTakePicture.launch(bookingCameraImageUri)
        } else {
            Toast.makeText(requireContext(), "Camera permission is required to take a photo", Toast.LENGTH_SHORT).show()
        }
    }
```

- [ ] **Step 3: Add processBookingImage and scaleBitmap helpers**

After the `makeInitialsCircle` function (before `loadVehiclesForDashboard`), add:
```kotlin
    private fun processBookingImage(uri: Uri) {
        try {
            val inputStream = requireContext().contentResolver.openInputStream(uri) ?: return
            val originalBitmap = BitmapFactory.decodeStream(inputStream)
            inputStream.close()
            val compressed = scaleBitmap(originalBitmap, 900)
            val out = ByteArrayOutputStream()
            compressed.compress(Bitmap.CompressFormat.JPEG, 75, out)
            bookingCapturedImageBase64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            currentBookingPreviewIv?.setImageBitmap(compressed)
            currentBookingPreviewIv?.visibility = View.VISIBLE
            currentBookingSubmitBtn?.isEnabled = true
        } catch (e: Exception) {
            Toast.makeText(requireContext(), "Failed to load image", Toast.LENGTH_SHORT).show()
        }
    }

    private fun scaleBitmap(bitmap: Bitmap, maxPx: Int): Bitmap {
        val w = bitmap.width
        val h = bitmap.height
        if (w <= maxPx && h <= maxPx) return bitmap
        val ratio = maxPx.toFloat() / maxOf(w, h)
        return Bitmap.createScaledBitmap(bitmap, (w * ratio).toInt(), (h * ratio).toInt(), true)
    }
```

- [ ] **Step 4: Inject payment UI in showBookingSheet when amenity.requiresPayment**

In `showBookingSheet`, find this block (after the schedule slot insertion block):
```kotlin
        if (dateIndex >= 0 && parent != null) {
            parent.addView(tvScheduleLabel, dateIndex + 1)
            parent.addView(llScheduleSlots, dateIndex + 2)
        }

        fun loadScheduleForDate(date: String) {
```
Insert BETWEEN those two blocks:
```kotlin
        // Payment receipt section — only when amenity requires payment
        if (amenity.requiresPayment) {
            bookingCapturedImageBase64 = null
            val btnSubmit = sheetView.findViewById<android.widget.Button>(R.id.btn_submit_request)
            currentBookingSubmitBtn = btnSubmit
            btnSubmit.isEnabled = false

            val density = resources.displayMetrics.density

            val tvFeeNotice = TextView(requireContext()).apply {
                text = "This amenity requires a usage fee of ₱${String.format("%,.2f", amenity.usageFee ?: 0.0)}. " +
                        "Please pay first and upload your receipt below."
                textSize = 13f
                setTextColor(Color.parseColor("#92400E"))
                setBackgroundColor(Color.parseColor("#FEF3C7"))
                setPadding(24, 20, 24, 20)
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.bottomMargin = (12 * density).toInt()
                layoutParams = lp
            }

            val llBtns = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.bottomMargin = (8 * density).toInt()
                layoutParams = lp
            }
            val btnCamera = android.widget.Button(requireContext()).apply {
                text = "Take Photo"
                val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                lp.marginEnd = (8 * density).toInt()
                layoutParams = lp
                setOnClickListener {
                    val file = File(requireContext().cacheDir, "booking_receipt_${System.currentTimeMillis()}.jpg")
                    bookingCameraImageUri = FileProvider.getUriForFile(
                        requireContext(), "${requireContext().packageName}.provider", file
                    )
                    if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED) {
                        bookingTakePicture.launch(bookingCameraImageUri)
                    } else {
                        bookingRequestCameraPermission.launch(Manifest.permission.CAMERA)
                    }
                }
            }
            val btnGallery = android.widget.Button(requireContext()).apply {
                text = "Choose Photo"
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener { bookingPickFromGallery.launch("image/*") }
            }
            llBtns.addView(btnCamera)
            llBtns.addView(btnGallery)

            val ivPreview = android.widget.ImageView(requireContext()).apply {
                visibility = View.GONE
                scaleType = android.widget.ImageView.ScaleType.CENTER_CROP
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, (200 * density).toInt()
                )
                lp.bottomMargin = (8 * density).toInt()
                layoutParams = lp
            }
            currentBookingPreviewIv = ivPreview

            val tvErr = sheetView.findViewById<TextView>(R.id.tv_request_error)
            val rootLayout = tvErr.parent as? LinearLayout
            val errIdx = (0 until (rootLayout?.childCount ?: 0))
                .firstOrNull { rootLayout?.getChildAt(it) == tvErr } ?: (rootLayout?.childCount ?: 0)
            rootLayout?.addView(tvFeeNotice, errIdx)
            rootLayout?.addView(llBtns, errIdx + 1)
            rootLayout?.addView(ivPreview, errIdx + 2)
        }

```

- [ ] **Step 5: Pass paymentImage in the createBooking call**

Find:
```kotlin
                    service.createBooking(
                        prefs.getBearerToken(),
                        BookingRequest(
                            amenityId = amenity.id,
                            requestedDate = date,
                            timeStart = start,
                            timeEnd = end,
                            purpose = purpose.ifEmpty { null }
                        )
                    )
```
Replace with:
```kotlin
                    service.createBooking(
                        prefs.getBearerToken(),
                        BookingRequest(
                            amenityId = amenity.id,
                            requestedDate = date,
                            timeStart = start,
                            timeEnd = end,
                            purpose = purpose.ifEmpty { null },
                            paymentImage = if (amenity.requiresPayment) bookingCapturedImageBase64 else null
                        )
                    )
```

- [ ] **Step 6: Clear class-level state when booking dialog is dismissed**

Find:
```kotlin
        dialog.setContentView(sheetView)
        dialog.show()
```
Replace with:
```kotlin
        dialog.setContentView(sheetView)
        dialog.setOnDismissListener {
            bookingCapturedImageBase64 = null
            currentBookingPreviewIv = null
            currentBookingSubmitBtn = null
        }
        dialog.show()
```

---

### Task 9: Build and Deploy APK

**Files:**
- Update: `web/downloads/hoa-connect.apk`

- [ ] **Step 1: Build release APK** (run from `android/` directory)

```powershell
& "C:\Users\ASUS Vivobook\.gradle\wrapper\dists\gradle-9.4.1-bin\arn2x92ynaizyzdaamcbpbhtj\gradle-9.4.1\bin\gradle.bat" assembleRelease
```
Expected: `BUILD SUCCESSFUL`, APK at `app/release/app-release.apk`

- [ ] **Step 2: Copy APK to web downloads**

```powershell
Copy-Item "app\release\app-release.apk" "..\web\downloads\hoa-connect.apk" -Force
```

- [ ] **Step 3: Commit all changes**

```bash
git add server/schema-v9.sql \
        server/routes/amenities.js \
        server/routes/amenity-bookings.js \
        server/routes/app-api.js \
        web/amenities.html \
        web/js/amenities.js \
        web/amenity-bookings.html \
        web/js/amenity-bookings.js \
        "android/app/src/main/java/com/hoa/paymentchecker/data/model/AppModels.kt" \
        "android/app/src/main/java/com/hoa/paymentchecker/ui/homeowner/HomeownerDashboardFragment.kt" \
        web/downloads/hoa-connect.apk
git commit -m "feat: add amenity payment requirement with receipt upload"
```
