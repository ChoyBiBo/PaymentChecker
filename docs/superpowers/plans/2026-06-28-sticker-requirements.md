# Vehicle Sticker Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin can maintain a list of requirements for sticker registration; homeowners must upload a file or photo for each requirement when applying for a vehicle sticker.

**Architecture:** New DB tables store requirements and submitted docs. The existing `vehicle-stickers.js` server route gains CRUD endpoints for requirements plus doc acceptance on sticker submission. A new admin web page manages requirements. The Android `VehiclesFragment` fetches requirements at sheet-open time and builds one upload slot per requirement, gating the Submit button until all required slots are fulfilled.

**Tech Stack:** Node.js/Express, PostgreSQL, Android Kotlin (minSdk 26, targetSdk 34), Material Components 1.11.0, Retrofit2/Gson, HTML/CSS/JS (no framework).

## Global Constraints

- All new server routes follow the existing pattern in `server/routes/vehicle-stickers.js` (requireSession for admin, requireAppAuth + requireAppRole('homeowner') for app).
- Admin web pages share the same sidebar HTML block as existing pages; add `<a href="/sticker-requirements.html" data-nav="sticker-requirements"><span class="nav-icon">🏷️</span> Sticker Reqs</a>` immediately after the `vehicles.html` nav entry in every HTML page.
- Android image processing: scale to max 900 px on longest side, JPEG quality 75, Base64.NO_WRAP.
- No new Gradle dependencies — use only what is already in the project.
- DB migrations are additive SQL files (`schema-v10.sql`). Never modify existing schema files.
- Teal color for primary buttons: `#1A6B7B`. Green for enabled-submit: `#16A34A`. Gray for disabled-submit: `#94A3B8`.
- `blockDemoAdmin` / `blockDemoAppUser` middleware must be applied on all write endpoints.

---

### Task 1: Database Schema

**Files:**
- Create: `server/schema-v10.sql`

**Interfaces:**
- Produces: tables `sticker_requirements(id, name, is_required, sort_order, is_active, created_at)` and `sticker_req_docs(id, vehicle_sticker_id, requirement_id, file_data, created_at)`

- [ ] **Step 1: Write schema-v10.sql**

```sql
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
```

- [ ] **Step 2: Apply schema to the database**

```bash
psql $DATABASE_URL -f server/schema-v10.sql
```

Expected: `CREATE TABLE` twice, no errors.

If `DATABASE_URL` is not set, use the connection string from `server/.env`.

- [ ] **Step 3: Verify tables exist**

```bash
psql $DATABASE_URL -c "\dt sticker_req*"
```

Expected output includes `sticker_requirements` and `sticker_req_docs`.

- [ ] **Step 4: Commit**

```bash
git add server/schema-v10.sql
git commit -m "feat: add sticker_requirements and sticker_req_docs tables"
```

---

### Task 2: Server — Sticker Requirements API

**Files:**
- Modify: `server/routes/vehicle-stickers.js`

**Interfaces:**
- Consumes: tables from Task 1
- Produces:
  - `GET  /api/vehicle-stickers/requirements` → `{ requirements: [{id, name, is_required, sort_order}] }` (public, no auth)
  - `POST /api/vehicle-stickers/requirements` → `{ requirement }` (admin, requireSession + blockDemoAdmin)
  - `PUT  /api/vehicle-stickers/requirements/:id` → `{ requirement }` (admin)
  - `DELETE /api/vehicle-stickers/requirements/:id` → `{ message }` soft-delete (admin)
  - `GET  /api/vehicle-stickers/:id/docs` → `{ docs: [{id, requirement_id, name, is_required, file_data}] }` (admin, requireSession)
  - `POST /api/vehicle-stickers` — extended to accept `docs: [{requirement_id, file_data}]`; server validates all required requirements are present and inserts into `sticker_req_docs`

- [ ] **Step 1: Add GET /requirements before the /:id routes**

Open `server/routes/vehicle-stickers.js`. Insert the following block after `const router = express.Router();` (line 18) and before the existing `router.get('/', ...)` (line 21):

```js
// GET /api/vehicle-stickers/requirements — public: list active requirements
router.get('/requirements', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, is_required, sort_order
       FROM sticker_requirements
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      []
    );
    return res.json({ requirements: result.rows });
  } catch (err) {
    console.error('List sticker requirements error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/vehicle-stickers/requirements — admin: create requirement
router.post('/requirements', requireSession, blockDemoAdmin, async (req, res) => {
  const { name, is_required, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await query(
      `INSERT INTO sticker_requirements (name, is_required, sort_order)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, is_required !== false, sort_order || 0]
    );
    return res.status(201).json({ requirement: result.rows[0] });
  } catch (err) {
    console.error('Create sticker requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/vehicle-stickers/requirements/:id — admin: update requirement
router.put('/requirements/:id', requireSession, blockDemoAdmin, async (req, res) => {
  const { name, is_required, sort_order, is_active } = req.body;
  const fields = [];
  const params = [];
  let idx = 1;
  if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
  if (is_required !== undefined) { fields.push(`is_required = $${idx++}`); params.push(is_required); }
  if (sort_order !== undefined) { fields.push(`sort_order = $${idx++}`); params.push(sort_order); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(is_active); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  try {
    const result = await query(
      `UPDATE sticker_requirements SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });
    return res.json({ requirement: result.rows[0] });
  } catch (err) {
    console.error('Update sticker requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/vehicle-stickers/requirements/:id — admin: soft-delete
router.delete('/requirements/:id', requireSession, blockDemoAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE sticker_requirements SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });
    return res.json({ message: 'Requirement removed' });
  } catch (err) {
    console.error('Delete sticker requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2: Update POST / to validate and save docs**

Replace the existing `router.post('/', ...)` block (lines 69–121) with the following (note: the sticker insert logic is identical, we add doc validation + insertion after the sticker insert):

```js
// POST /api/vehicle-stickers — homeowner: request sticker (upsert on rejected)
router.post('/', requireAppAuth, requireAppRole('homeowner'), blockDemoAppUser, async (req, res) => {
  const { vehicle_id, sticker_year, amount, receipt_number, image_data, docs } = req.body;
  if (!vehicle_id || !sticker_year) {
    return res.status(400).json({ error: 'vehicle_id and sticker_year are required' });
  }

  try {
    // Verify vehicle belongs to homeowner
    const vCheck = await query(
      'SELECT id FROM vehicles WHERE id = $1 AND homeowner_id = $2 AND is_active = TRUE',
      [vehicle_id, req.appUser.homeownerId]
    );
    if (vCheck.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    // Validate required requirement docs
    const reqsResult = await query(
      `SELECT id FROM sticker_requirements WHERE is_active = TRUE AND is_required = TRUE`,
      []
    );
    const requiredIds = reqsResult.rows.map(r => r.id);
    const submittedIds = Array.isArray(docs) ? docs.map(d => d.requirement_id) : [];
    const missing = requiredIds.filter(id => !submittedIds.includes(id));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required documents for requirement IDs: ${missing.join(', ')}` });
    }

    // Upsert sticker
    const result = await query(
      `INSERT INTO vehicle_stickers (vehicle_id, homeowner_id, sticker_year, amount, receipt_number, image_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (vehicle_id, sticker_year) DO UPDATE
         SET status = CASE WHEN vehicle_stickers.status = 'rejected' THEN 'pending' ELSE vehicle_stickers.status END,
             amount = COALESCE(EXCLUDED.amount, vehicle_stickers.amount),
             receipt_number = COALESCE(EXCLUDED.receipt_number, vehicle_stickers.receipt_number),
             image_data = COALESCE(EXCLUDED.image_data, vehicle_stickers.image_data),
             review_notes = NULL,
             reviewed_by = NULL,
             reviewed_at = NULL
       RETURNING *`,
      [vehicle_id, req.appUser.homeownerId, sticker_year,
       amount || null, receipt_number || null, image_data || null]
    );

    const sticker = result.rows[0];

    // Delete old docs for this sticker (re-submission on rejected) then insert new ones
    if (Array.isArray(docs) && docs.length > 0) {
      await query('DELETE FROM sticker_req_docs WHERE vehicle_sticker_id = $1', [sticker.id]);
      for (const doc of docs) {
        if (doc.requirement_id && doc.file_data) {
          await query(
            `INSERT INTO sticker_req_docs (vehicle_sticker_id, requirement_id, file_data)
             VALUES ($1, $2, $3)`,
            [sticker.id, doc.requirement_id, doc.file_data]
          );
        }
      }
    }

    if (sticker.status === 'pending') {
      const vInfo = await query('SELECT plate_number FROM vehicles WHERE id = $1', [vehicle_id]);
      const plate = vInfo.rows[0]?.plate_number || '';
      await query(
        `INSERT INTO notifications (type, title, message, related_type, related_id)
         VALUES ('vehicle_sticker', $1, $2, 'vehicle_sticker', $3)`,
        [
          'Vehicle Sticker Request',
          `${req.appUser.fullName} requested a ${sticker_year} sticker for ${plate}`,
          sticker.id,
        ]
      );
    }

    return res.status(201).json({ sticker });
  } catch (err) {
    console.error('Request sticker error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 3: Add GET /:id/docs endpoint**

Insert the following block immediately after the existing `router.get('/:id/image', ...)` block (after line 156):

```js
// GET /api/vehicle-stickers/:id/docs — admin: get submitted requirement docs
router.get('/:id/docs', requireSession, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.id, d.requirement_id, sr.name, sr.is_required, d.file_data
       FROM sticker_req_docs d
       JOIN sticker_requirements sr ON sr.id = d.requirement_id
       WHERE d.vehicle_sticker_id = $1
       ORDER BY sr.sort_order ASC, sr.id ASC`,
      [req.params.id]
    );
    return res.json({ docs: result.rows });
  } catch (err) {
    console.error('Sticker docs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 4: Test with curl (manual)**

Start the server (`node server/index.js`) and run:

```bash
# List requirements (should be empty initially)
curl http://localhost:3000/api/vehicle-stickers/requirements
# Expected: { "requirements": [] }
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/vehicle-stickers.js
git commit -m "feat: add sticker requirements CRUD and doc submission endpoints"
```

---

### Task 3: Admin Web — Sticker Requirements Page

**Files:**
- Create: `web/sticker-requirements.html`
- Create: `web/js/sticker-requirements.js`
- Modify: all 16 existing HTML pages in `web/` — add `<a href="/sticker-requirements.html" data-nav="sticker-requirements"><span class="nav-icon">🏷️</span> Sticker Reqs</a>` immediately after the `<a href="/vehicles.html" ...>` nav entry.

**Interfaces:**
- Consumes: `GET /api/vehicle-stickers/requirements`, `POST`, `PUT`, `DELETE /api/vehicle-stickers/requirements/:id`
- Produces: functional admin page to add/edit/delete requirements

- [ ] **Step 1: Create `web/sticker-requirements.html`**

Model after `web/renovation-requirements.html`. Full content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sticker Requirements — HOA Connect</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <svg width="34" height="34" viewBox="0 0 68 68" fill="none"><rect width="68" height="68" rx="16" fill="#0D9488"/><rect width="68" height="68" rx="16" fill="url(#sg)" opacity="0.35"/><path d="M34 13L16 27h4v22h12v-11h4v11h12V27h4L34 13z" fill="white"/><defs><linearGradient id="sg" x1="0" y1="0" x2="68" y2="68" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#5EEAD4"/><stop offset="100%" stop-color="#0F766E"/></linearGradient></defs></svg>
      <div class="sidebar-logo-text">HOA Connect<span>Community Management</span></div>
    </div>
    <nav class="sidebar-nav">
      <a href="/dashboard.html" data-nav="dashboard"><span class="nav-icon">⊞</span> Dashboard</a>
      <a href="/homeowners.html" data-nav="homeowners"><span class="nav-icon">👥</span> Homeowners</a>
      <a href="/payments.html" data-nav="payments"><span class="nav-icon">💳</span> Payments</a>
      <a href="/payment-proofs.html" data-nav="payment-proofs"><span class="nav-icon">🧾</span> Payment Proofs</a>
      <a href="/qr-print.html" data-nav="qr"><span class="nav-icon">⬛</span> QR Codes</a>
      <a href="/reports.html" data-nav="reports"><span class="nav-icon">📊</span> Reports</a>
      <a href="/announcements.html" data-nav="announcements"><span class="nav-icon">📢</span> Announcements</a>
      <a href="/amenities.html" data-nav="amenities"><span class="nav-icon">🏊</span> Amenities</a>
      <a href="/amenity-bookings.html" data-nav="bookings"><span class="nav-icon">📅</span> Bookings</a>
      <a href="/app-users.html" data-nav="app-users"><span class="nav-icon">📱</span> App Users</a>
      <a href="/vehicles.html" data-nav="vehicles"><span class="nav-icon">🚗</span> Vehicles</a>
      <a href="/sticker-requirements.html" data-nav="sticker-requirements"><span class="nav-icon">🏷️</span> Sticker Reqs</a>
      <a href="/renovation-requirements.html" data-nav="renovation-requirements"><span class="nav-icon">🏠</span> Reno Requirements</a>
      <a href="/renovation-permits.html" data-nav="renovation-permits"><span class="nav-icon">📋</span> Reno Permits</a>
      <a href="/entry-logs.html" data-nav="entry-logs"><span class="nav-icon">📋</span> Entry Logs</a>
      <a href="/settings.html" data-nav="settings"><span class="nav-icon">⚙</span> Settings</a>
      <a href="/active-sessions.html" data-nav="active-sessions" class="superadmin-only"><span class="nav-icon">🟢</span> Active Sessions</a>
    </nav>
    <div class="sidebar-footer">
      <div class="user-info"><strong id="header-user">—</strong><span id="header-role"></span></div>
      <a href="#" onclick="logout()" class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:6px;">Sign Out</a>
    </div>
  </aside>

  <div class="main-content">
    <header class="top-header"><h1>Sticker Requirements</h1></header>
    <div class="page-content">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Sticker Requirements</div>
          <button class="btn btn-primary btn-sm" onclick="openAdd()">+ Add Requirement</button>
        </div>
        <div id="requirements-list"><div class="loading-overlay">Loading...</div></div>
      </div>
    </div>
  </div>
</div>

<!-- Add/Edit Modal -->
<div class="modal-overlay" id="req-modal" style="display:none;">
  <div class="modal" style="max-width:420px;">
    <div class="modal-header">
      <div class="modal-title" id="modal-title">Add Requirement</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" id="f-name" class="form-control" placeholder="e.g. Official Receipt (OR)">
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select id="f-required" class="form-control">
          <option value="true">Required</option>
          <option value="false">Optional</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Sort Order</label>
        <input type="number" id="f-order" class="form-control" value="0" min="0">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveRequirement()">Save</button>
    </div>
  </div>
</div>

<script src="/js/auth.js"></script>
<script src="/js/api.js"></script>
<script src="/js/sticker-requirements.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `web/js/sticker-requirements.js`**

```js
initPage('sticker-requirements');

let editingId = null;

async function loadRequirements() {
  const el = document.getElementById('requirements-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';
  try {
    const data = await api.get('/api/vehicle-stickers/requirements');
    renderRequirements(data.requirements);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);padding:12px">${err.message}</p>`;
  }
}

function renderRequirements(reqs) {
  const el = document.getElementById('requirements-list');
  if (!reqs.length) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">No requirements defined yet. Click + Add Requirement.</p>';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead><tr><th>#</th><th>Name</th><th>Type</th><th>Actions</th></tr></thead>
      <tbody>
        ${reqs.map(r => `
          <tr>
            <td>${r.sort_order}</td>
            <td><strong>${esc(r.name)}</strong></td>
            <td>${r.is_required
              ? '<span class="badge badge-danger">Required</span>'
              : '<span class="badge badge-success">Optional</span>'}</td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="openEdit(${JSON.stringify(r).replace(/"/g, '&quot;')})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteReq(${r.id})">Remove</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function openAdd() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add Requirement';
  document.getElementById('f-name').value = '';
  document.getElementById('f-required').value = 'true';
  document.getElementById('f-order').value = '0';
  document.getElementById('req-modal').style.display = 'flex';
}

function openEdit(req) {
  editingId = req.id;
  document.getElementById('modal-title').textContent = 'Edit Requirement';
  document.getElementById('f-name').value = req.name;
  document.getElementById('f-required').value = String(req.is_required);
  document.getElementById('f-order').value = req.sort_order;
  document.getElementById('req-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('req-modal').style.display = 'none';
  editingId = null;
}

async function saveRequirement() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  const payload = {
    name,
    is_required: document.getElementById('f-required').value === 'true',
    sort_order: parseInt(document.getElementById('f-order').value) || 0
  };
  try {
    if (editingId) {
      await api.put(`/api/vehicle-stickers/requirements/${editingId}`, payload);
      showToast('Requirement updated');
    } else {
      await api.post('/api/vehicle-stickers/requirements', payload);
      showToast('Requirement added');
    }
    closeModal();
    loadRequirements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteReq(id) {
  if (!confirm('Remove this requirement? It will no longer appear for new sticker applications.')) return;
  try {
    await api.delete(`/api/vehicle-stickers/requirements/${id}`);
    showToast('Requirement removed');
    loadRequirements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

loadRequirements();
```

- [ ] **Step 3: Add sidebar link to all 16 HTML pages**

In each of the following files, find the line:
```html
      <a href="/vehicles.html" data-nav="vehicles"><span class="nav-icon">🚗</span> Vehicles</a>
```
And insert immediately after it:
```html
      <a href="/sticker-requirements.html" data-nav="sticker-requirements"><span class="nav-icon">🏷️</span> Sticker Reqs</a>
```

Files to update:
- `web/dashboard.html`
- `web/homeowners.html`
- `web/payments.html`
- `web/payment-proofs.html`
- `web/qr-print.html`
- `web/reports.html`
- `web/announcements.html`
- `web/amenities.html`
- `web/amenity-bookings.html`
- `web/app-users.html`
- `web/vehicles.html`
- `web/renovation-requirements.html`
- `web/renovation-permits.html`
- `web/entry-logs.html`
- `web/settings.html`
- `web/active-sessions.html`

(Do NOT add a duplicate to `web/sticker-requirements.html` — it already has the link in Step 1.)

- [ ] **Step 4: Manual browser test**

Open `/sticker-requirements.html` in the admin panel. Add a requirement "Official Receipt (OR)" as Required, sort 0. Verify it appears in the list. Edit it to sort 1. Remove it. Verify it disappears.

- [ ] **Step 5: Commit**

```bash
git add web/sticker-requirements.html web/js/sticker-requirements.js \
        web/dashboard.html web/homeowners.html web/payments.html \
        web/payment-proofs.html web/qr-print.html web/reports.html \
        web/announcements.html web/amenities.html web/amenity-bookings.html \
        web/app-users.html web/vehicles.html web/renovation-requirements.html \
        web/renovation-permits.html web/entry-logs.html web/settings.html \
        web/active-sessions.html
git commit -m "feat: add sticker requirements admin page and sidebar links"
```

---

### Task 4: Admin Web — Show Docs in Sticker Review Modal

**Files:**
- Modify: `web/vehicles.html` — add doc display area to the review modal
- Modify: `web/js/vehicles.js` — load docs in `openReview()` and display thumbnails

**Interfaces:**
- Consumes: `GET /api/vehicle-stickers/:id/docs` from Task 2
- Produces: review modal shows submitted requirement documents as labeled thumbnails

- [ ] **Step 1: Add doc section to review modal in vehicles.html**

Open `web/vehicles.html`. Find the review modal (search for `review-modal`). Locate the `review-image-wrap` div. After the `<div id="review-image-wrap" ...>...</div>` block and before the modal footer, insert:

```html
      <div id="review-docs-section" style="margin-top:12px;display:none;">
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px;">Submitted Documents</div>
        <div id="review-docs-list"></div>
      </div>
```

- [ ] **Step 2: Load docs in openReview() in vehicles.js**

In `web/js/vehicles.js`, in the `openReview()` function, after the `try { const data = await api.get('/api/vehicle-stickers/${id}/image'); ... }` block, add a second fetch for docs:

```js
  // Also load requirement docs
  document.getElementById('review-docs-section').style.display = 'none';
  document.getElementById('review-docs-list').innerHTML = '';
  try {
    const docsData = await api.get(`/api/vehicle-stickers/${id}/docs`);
    if (docsData.docs && docsData.docs.length > 0) {
      document.getElementById('review-docs-section').style.display = 'block';
      document.getElementById('review-docs-list').innerHTML = docsData.docs.map(d => `
        <div style="margin-bottom:10px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px;">
            ${esc(d.name)}
            ${d.is_required ? '<span style="color:#DC2626;font-size:10px;margin-left:4px;">*Required</span>' : '<span style="color:#16A34A;font-size:10px;margin-left:4px;">Optional</span>'}
          </div>
          <img src="${d.file_data.startsWith('data:') ? d.file_data : 'data:image/jpeg;base64,' + d.file_data}"
               style="max-width:100%;max-height:160px;object-fit:contain;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;"
               onclick="window.open(this.src)" title="Click to open full size">
        </div>`).join('');
    }
  } catch (_) { /* docs section stays hidden */ }
```

Make sure this code is placed inside `openReview()` after the existing `try/catch` for image loading.

- [ ] **Step 3: Test manually**

Submit a sticker request from the Android app (or via curl with docs). Open the review modal in vehicles.html — verify thumbnails appear with correct labels.

- [ ] **Step 4: Commit**

```bash
git add web/vehicles.html web/js/vehicles.js
git commit -m "feat: show submitted requirement docs in sticker review modal"
```

---

### Task 5: Android — Data Models and API Endpoint

**Files:**
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/data/model/AppModels.kt`
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/data/api/AppApiService.kt`

**Interfaces:**
- Produces:
  - `StickerRequirement(id: Int, name: String, isRequired: Boolean, sortOrder: Int)`
  - `StickerRequirementsResponse(requirements: List<StickerRequirement>)`
  - `StickerReqDocSubmit(requirementId: Int, fileData: String)`
  - Updated `StickerRequest` adds `docs: List<StickerReqDocSubmit>? = null`
  - `AppApiService.getStickerRequirements(): StickerRequirementsResponse`

- [ ] **Step 1: Add new models to AppModels.kt**

In `android/app/src/main/java/com/hoa/paymentchecker/data/model/AppModels.kt`, find the `StickerRequest` data class (line ~134). Insert the following block immediately BEFORE `StickerRequest`:

```kotlin
data class StickerRequirement(
    val id: Int,
    val name: String,
    @SerializedName("is_required") val isRequired: Boolean,
    @SerializedName("sort_order") val sortOrder: Int
)

data class StickerRequirementsResponse(val requirements: List<StickerRequirement>)

data class StickerReqDocSubmit(
    @SerializedName("requirement_id") val requirementId: Int,
    @SerializedName("file_data") val fileData: String
)
```

- [ ] **Step 2: Update StickerRequest to include docs**

Replace the existing `StickerRequest` data class:

```kotlin
data class StickerRequest(
    @SerializedName("vehicle_id") val vehicleId: Int,
    @SerializedName("sticker_year") val stickerYear: Int,
    val amount: Double?,
    @SerializedName("receipt_number") val receiptNumber: String?,
    @SerializedName("image_data") val imageData: String? = null,
    val docs: List<StickerReqDocSubmit>? = null
)
```

- [ ] **Step 3: Add getStickerRequirements() to AppApiService**

In `android/app/src/main/java/com/hoa/paymentchecker/data/api/AppApiService.kt`, after the `@GET("api/vehicle-stickers/{id}/qr")` block, add:

```kotlin
@GET("api/vehicle-stickers/requirements")
suspend fun getStickerRequirements(): StickerRequirementsResponse
```

- [ ] **Step 4: Build to verify no compile errors**

```bash
cd android && ./gradlew compileDebugKotlin 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/hoa/paymentchecker/data/model/AppModels.kt \
        android/app/src/main/java/com/hoa/paymentchecker/data/api/AppApiService.kt
git commit -m "feat: add sticker requirement models and API endpoint"
```

---

### Task 6: Android — VehiclesFragment Requirement Upload Sheet

**Files:**
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/ui/homeowner/VehiclesFragment.kt`

**Interfaces:**
- Consumes: `getStickerRequirements()` from Task 5, `StickerRequirement`, `StickerReqDocSubmit`, updated `StickerRequest`
- Produces: `showRequestStickerSheet()` fetches requirements, builds per-slot upload UI, blocks submit until all required slots filled, sends docs in request

- [ ] **Step 1: Update class-level state vars**

Replace the existing class-level state block (lines 39–44 of VehiclesFragment.kt — the `capturedStickerImageBase64`, `stickerCameraUri`, `stickerPreviewRef`, `stickerPlaceholderRef` vars) with:

```kotlin
private var stickerCameraUri: Uri? = null
private var activeDocRequirementId: Int = -1
private val docFileData = mutableMapOf<Int, String>()
private val docPreviewRefs = mutableMapOf<Int, android.widget.ImageView>()
private val docPlaceholderRefs = mutableMapOf<Int, View>()
private var submitBtnRef: android.widget.Button? = null
private var currentRequirements: List<com.hoa.paymentchecker.data.model.StickerRequirement> = emptyList()
```

- [ ] **Step 2: Update the takeStickerPicture launcher to call processStickerDocUri**

Replace:
```kotlin
private val takeStickerPicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
    if (success && stickerCameraUri != null) processStickerImageUri(stickerCameraUri!!)
}
```
With:
```kotlin
private val takeStickerPicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
    if (success && stickerCameraUri != null) processStickerDocUri(stickerCameraUri!!)
}
```

- [ ] **Step 3: Update pickStickerFromGallery launcher**

Replace:
```kotlin
private val pickStickerFromGallery = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) processStickerImageUri(uri)
}
```
With:
```kotlin
private val pickStickerFromGallery = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) processStickerDocUri(uri)
}
```

- [ ] **Step 4: Replace processStickerImageUri with processStickerDocUri**

Delete the entire `processStickerImageUri()` function and replace with:

```kotlin
private fun processStickerDocUri(uri: Uri) {
    try {
        val stream = requireContext().contentResolver.openInputStream(uri) ?: return
        val original = BitmapFactory.decodeStream(stream)
        stream.close()
        val w = original.width; val h = original.height
        val maxPx = 900
        val scaled = if (w > maxPx || h > maxPx) {
            val ratio = maxPx.toFloat() / maxOf(w, h)
            Bitmap.createScaledBitmap(original, (w * ratio).toInt(), (h * ratio).toInt(), true)
        } else original
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 75, out)
        val reqId = activeDocRequirementId
        docFileData[reqId] = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        docPreviewRefs[reqId]?.setImageBitmap(scaled)
        docPreviewRefs[reqId]?.visibility = View.VISIBLE
        docPlaceholderRefs[reqId]?.visibility = View.GONE
        checkSubmitEnabled()
    } catch (_: Exception) {}
}

private fun checkSubmitEnabled() {
    val allFulfilled = currentRequirements
        .filter { it.isRequired }
        .all { docFileData.containsKey(it.id) }
    submitBtnRef?.isEnabled = allFulfilled
    submitBtnRef?.setBackgroundColor(
        Color.parseColor(if (allFulfilled) "#16A34A" else "#94A3B8")
    )
}
```

- [ ] **Step 5: Replace showRequestStickerSheet()**

Replace the entire `showRequestStickerSheet(vehicle: Vehicle)` function with:

```kotlin
private fun showRequestStickerSheet(vehicle: Vehicle) {
    docFileData.clear()
    docPreviewRefs.clear()
    docPlaceholderRefs.clear()
    submitBtnRef = null
    activeDocRequirementId = -1

    val dialog = BottomSheetDialog(requireContext())
    val sheetView = LinearLayout(requireContext()).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(24, 24, 24, 24)
    }

    sheetView.addView(TextView(requireContext()).apply {
        text = "Request $currentYear Sticker"
        textSize = 18f
        setTypeface(null, android.graphics.Typeface.BOLD)
        setTextColor(Color.parseColor("#1A3A4A"))
        setPadding(0, 0, 0, 4)
    })
    sheetView.addView(TextView(requireContext()).apply {
        text = "Plate: ${vehicle.plateNumber}"
        textSize = 14f
        setTextColor(Color.parseColor("#5A7A84"))
        setPadding(0, 0, 0, 16)
    })

    fun makeInput(hint: String, inputType: Int = android.text.InputType.TYPE_CLASS_TEXT): EditText {
        return EditText(requireContext()).apply {
            this.hint = hint
            this.inputType = inputType
            setTextColor(Color.parseColor("#1A3A4A"))
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = 12
            layoutParams = lp
        }
    }

    val etAmount = makeInput("Amount Paid (optional)", android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL)
    val etReceipt = makeInput("Receipt Number (optional)")
    sheetView.addView(etAmount)
    sheetView.addView(etReceipt)

    // Requirements section placeholder (populated after fetch)
    val docsSection = LinearLayout(requireContext()).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
    }

    val tvDocsLabel = TextView(requireContext()).apply {
        text = "Required Documents"
        textSize = 13f
        setTypeface(null, android.graphics.Typeface.BOLD)
        setTextColor(Color.parseColor("#374151"))
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = 8
        lp.bottomMargin = 8
        layoutParams = lp
    }
    sheetView.addView(tvDocsLabel)

    val tvDocsLoading = TextView(requireContext()).apply {
        text = "Loading requirements..."
        textSize = 13f
        setTextColor(Color.parseColor("#94A3B8"))
    }
    docsSection.addView(tvDocsLoading)
    sheetView.addView(docsSection)

    val tvError = TextView(requireContext()).apply {
        textSize = 13f
        setTextColor(Color.parseColor("#DC2626"))
        visibility = View.GONE
    }
    sheetView.addView(tvError)

    val btnSubmit = android.widget.Button(requireContext()).apply {
        text = "Submit Request"
        setBackgroundColor(Color.parseColor("#94A3B8"))
        setTextColor(Color.WHITE)
        textSize = 14f
        isEnabled = false
        val lp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        lp.topMargin = 8
        layoutParams = lp
    }
    submitBtnRef = btnSubmit
    sheetView.addView(btnSubmit)

    btnSubmit.setOnClickListener {
        val missing = currentRequirements.filter { it.isRequired && !docFileData.containsKey(it.id) }
        if (missing.isNotEmpty()) {
            tvError.text = "Please upload: ${missing.joinToString(", ") { it.name }}"
            tvError.visibility = View.VISIBLE
            return@setOnClickListener
        }
        btnSubmit.isEnabled = false
        btnSubmit.text = "Submitting..."
        tvError.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val docsList = docFileData.map { (reqId, data) ->
                    com.hoa.paymentchecker.data.model.StickerReqDocSubmit(requirementId = reqId, fileData = data)
                }
                service.requestSticker(
                    prefs.getBearerToken(),
                    StickerRequest(
                        vehicleId = vehicle.id,
                        stickerYear = currentYear,
                        amount = etAmount.text.toString().trim().toDoubleOrNull(),
                        receiptNumber = etReceipt.text.toString().trim().ifEmpty { null },
                        imageData = null,
                        docs = docsList
                    )
                )
                dialog.dismiss()
                Toast.makeText(requireContext(), "Sticker request submitted!", Toast.LENGTH_SHORT).show()
                loadVehicles(requireView())
            } catch (e: Exception) {
                tvError.text = if (e.message?.contains("400") == true || e.message?.contains("Missing") == true)
                    "Please upload all required documents" else "Failed to submit request"
                tvError.visibility = View.VISIBLE
                btnSubmit.isEnabled = true
                btnSubmit.text = "Submit Request"
            }
        }
    }

    val scroll = androidx.core.widget.NestedScrollView(requireContext())
    scroll.addView(sheetView)
    dialog.setContentView(scroll)
    dialog.show()

    // Fetch requirements and build upload slots
    lifecycleScope.launch {
        try {
            val service = RetrofitClient.getAppService(requireContext())
            val data = service.getStickerRequirements()
            currentRequirements = data.requirements
            docsSection.removeAllViews()

            if (currentRequirements.isEmpty()) {
                tvDocsLabel.visibility = View.GONE
                checkSubmitEnabled()
                return@launch
            }

            currentRequirements.forEach { req ->
                val slot = LinearLayout(requireContext()).apply {
                    orientation = LinearLayout.VERTICAL
                    setBackgroundColor(Color.WHITE)
                    setPadding(12, 12, 12, 12)
                    val lp = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                    lp.bottomMargin = (10 * resources.displayMetrics.density).toInt()
                    layoutParams = lp
                }

                // Header row
                val headerRow = LinearLayout(requireContext()).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = android.view.Gravity.CENTER_VERTICAL
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                }
                val tvReqName = TextView(requireContext()).apply {
                    text = req.name
                    textSize = 12f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(Color.parseColor("#1A3A4A"))
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                val tvReqBadge = TextView(requireContext()).apply {
                    text = if (req.isRequired) "*Required" else "Optional"
                    textSize = 10f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(Color.parseColor(if (req.isRequired) "#DC2626" else "#16A34A"))
                }
                headerRow.addView(tvReqName)
                headerRow.addView(tvReqBadge)
                slot.addView(headerRow)

                // Preview frame
                val frame = FrameLayout(requireContext()).apply {
                    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0)
                    lp.height = (120 * resources.displayMetrics.density).toInt()
                    lp.topMargin = (8 * resources.displayMetrics.density).toInt()
                    lp.bottomMargin = (8 * resources.displayMetrics.density).toInt()
                    layoutParams = lp
                    setBackgroundColor(Color.parseColor("#F1F5F9"))
                }
                val placeholder = TextView(requireContext()).apply {
                    text = "📂  No file yet"
                    textSize = 12f
                    setTextColor(Color.parseColor("#94A3B8"))
                    gravity = android.view.Gravity.CENTER
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                }
                val preview = android.widget.ImageView(requireContext()).apply {
                    scaleType = android.widget.ImageView.ScaleType.CENTER_INSIDE
                    visibility = View.GONE
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                }
                frame.addView(placeholder)
                frame.addView(preview)
                docPreviewRefs[req.id] = preview
                docPlaceholderRefs[req.id] = placeholder
                slot.addView(frame)

                // Camera / Gallery buttons
                val btnRow = LinearLayout(requireContext()).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                }
                val btnCamera = android.widget.Button(requireContext()).apply {
                    text = "📷  Camera"
                    setBackgroundColor(Color.parseColor("#1A6B7B"))
                    setTextColor(Color.WHITE)
                    textSize = 12f
                    val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    lp.marginEnd = (8 * resources.displayMetrics.density).toInt()
                    layoutParams = lp
                }
                val btnGallery = android.widget.Button(requireContext()).apply {
                    text = "🖼  Gallery"
                    setBackgroundColor(Color.parseColor("#1A6B7B"))
                    setTextColor(Color.WHITE)
                    textSize = 12f
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }

                val reqId = req.id
                btnCamera.setOnClickListener {
                    activeDocRequirementId = reqId
                    val file = File(requireContext().cacheDir, "sticker_doc_${reqId}_${System.currentTimeMillis()}.jpg")
                    stickerCameraUri = FileProvider.getUriForFile(requireContext(), "${requireContext().packageName}.provider", file)
                    if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED) {
                        takeStickerPicture.launch(stickerCameraUri)
                    } else {
                        requestStickerCameraPermission.launch(Manifest.permission.CAMERA)
                    }
                }
                btnGallery.setOnClickListener {
                    activeDocRequirementId = reqId
                    pickStickerFromGallery.launch("image/*")
                }

                btnRow.addView(btnCamera)
                btnRow.addView(btnGallery)
                slot.addView(btnRow)

                docsSection.addView(slot)
            }

            checkSubmitEnabled()
        } catch (_: Exception) {
            // If requirements fetch fails, allow submission without docs
            currentRequirements = emptyList()
            tvDocsLabel.visibility = View.GONE
            docsSection.removeAllViews()
            checkSubmitEnabled()
        }
    }
}
```

- [ ] **Step 6: Build debug APK to verify compile**

```bash
cd android && ./gradlew assembleDebug 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/hoa/paymentchecker/ui/homeowner/VehiclesFragment.kt
git commit -m "feat: sticker application now requires uploading documents per requirement"
```

---

### Task 7: Build Release APK and Deploy

**Files:**
- Modify: `web/downloads/hoa-connect.apk` (replaced by new build)

**Interfaces:**
- Consumes: all prior tasks committed and working
- Produces: signed release APK deployed to web/downloads/

- [ ] **Step 1: Build release APK**

```bash
cd android && ./gradlew assembleRelease 2>&1 | tail -30
```

Expected: `BUILD SUCCESSFUL` and APK at `android/app/build/outputs/apk/release/app-release.apk`

- [ ] **Step 2: Copy APK to web/downloads/**

```bash
cp android/app/build/outputs/apk/release/app-release.apk web/downloads/hoa-connect.apk
```

- [ ] **Step 3: Commit all changes**

```bash
git add web/downloads/hoa-connect.apk
git commit -m "feat: build release APK with vehicle sticker requirements feature"
```

- [ ] **Step 4: Push to remote**

```bash
git push origin main
```

Expected: remote accepts the push.
