initPage('bookings');

let bookings = [];
let pendingReviewId = null;

async function loadAmenityOptions() {
  try {
    const data = await api.get('/api/amenities');
    const sel = document.getElementById('f-amenity');
    data.amenities.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      sel.appendChild(opt);
    });
  } catch (e) { /* ignore */ }
}

async function loadBookings() {
  const el = document.getElementById('bookings-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';

  const status = document.getElementById('f-status').value;
  const amenityId = document.getElementById('f-amenity').value;
  let url = '/api/amenity-bookings?';
  if (status) url += `status=${status}&`;
  if (amenityId) url += `amenity_id=${amenityId}&`;

  try {
    const data = await api.get(url);
    bookings = data.bookings;
    renderBookings();
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);padding:12px">${err.message}</p>`;
  }
}

function renderBookings() {
  const el = document.getElementById('bookings-list');
  if (!bookings.length) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">No bookings found.</p>';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Homeowner</th><th>Amenity</th><th>Date</th><th>Time</th><th>Purpose</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${bookings.map(b => `
          <tr>
            <td>
              <strong>${esc(b.homeowner_name)}</strong>
              <br><small style="color:var(--text-muted)">Lot ${esc(b.lot_number)} Blk ${esc(b.block_number)}</small>
            </td>
            <td>${esc(b.amenity_name)}</td>
            <td>${formatDate(b.requested_date)}</td>
            <td style="white-space:nowrap">${esc(b.time_start)} – ${esc(b.time_end)}</td>
            <td>${b.purpose ? esc(b.purpose) : '—'}</td>
            <td><span class="badge badge-${b.status}">${b.status}</span></td>
            <td>
              ${b.status === 'pending' ? `
                <button class="btn btn-success btn-sm" onclick="openReview(${b.id})">Review</button>
              ` : `
                <span style="font-size:12px;color:var(--text-muted)">
                  ${b.reviewed_by_name ? `By ${esc(b.reviewed_by_name)}` : ''}
                  ${b.review_notes ? `<br>${esc(b.review_notes)}` : ''}
                </span>
              `}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function openReview(id) {
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  pendingReviewId = id;
  document.getElementById('review-modal-title').textContent = `Review: ${b.amenity_name}`;
  document.getElementById('review-details').innerHTML = `
    <table style="font-size:13px;border-collapse:collapse;width:100%">
      <tr><td style="padding:3px 8px 3px 0;color:var(--text-muted)">Homeowner</td><td><strong>${esc(b.homeowner_name)}</strong></td></tr>
      <tr><td style="padding:3px 8px 3px 0;color:var(--text-muted)">Date</td><td>${formatDate(b.requested_date)}</td></tr>
      <tr><td style="padding:3px 8px 3px 0;color:var(--text-muted)">Time</td><td>${esc(b.time_start)} – ${esc(b.time_end)}</td></tr>
      ${b.purpose ? `<tr><td style="padding:3px 8px 3px 0;color:var(--text-muted)">Purpose</td><td>${esc(b.purpose)}</td></tr>` : ''}
    </table>`;
  document.getElementById('review-notes').value = '';
  document.getElementById('review-modal').style.display = 'flex';
}

function closeReviewModal() {
  document.getElementById('review-modal').style.display = 'none';
  pendingReviewId = null;
}

async function submitReview(action) {
  if (!pendingReviewId) return;
  const notes = document.getElementById('review-notes').value.trim();
  try {
    await api.put(`/api/amenity-bookings/${pendingReviewId}/${action}`, { review_notes: notes || null });
    showToast(`Booking ${action === 'approve' ? 'approved' : 'rejected'}`);
    closeReviewModal();
    loadBookings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function markAllRead() {
  try {
    await api.put('/api/notifications/read-all', {});
    showToast('All notifications marked as read');
    loadNotifCount();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

loadAmenityOptions();
loadBookings();
