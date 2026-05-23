initPage('vehicles');

let pendingReviewId = null;
let pendingAction = null;

function showTab(tab) {
  document.getElementById('pane-stickers').style.display = tab === 'stickers' ? '' : 'none';
  document.getElementById('pane-vehicles').style.display = tab === 'vehicles' ? '' : 'none';
  document.getElementById('tab-stickers').className = tab === 'stickers' ? 'btn btn-primary' : 'btn btn-ghost';
  document.getElementById('tab-vehicles').className = tab === 'vehicles' ? 'btn btn-primary' : 'btn btn-ghost';
  if (tab === 'vehicles') loadVehicles();
}

async function loadStickers() {
  const el = document.getElementById('stickers-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';
  const status = document.getElementById('f-status').value;
  const year = document.getElementById('f-year').value || new Date().getFullYear();
  let url = `/api/vehicle-stickers?sticker_year=${year}`;
  if (status) url += `&status=${status}`;
  try {
    const data = await api.get(url);
    renderStickers(data.stickers);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);padding:12px">${err.message}</p>`;
  }
}

function renderStickers(stickers) {
  const el = document.getElementById('stickers-list');
  if (!stickers.length) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">No sticker requests found.</p>';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Homeowner</th><th>Plate</th><th>Vehicle</th><th>Year</th>
        <th>Amount</th><th>Receipt</th><th>Requested</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${stickers.map(s => `
          <tr>
            <td>
              <strong>${esc(s.homeowner_name)}</strong>
              <br><small style="color:var(--text-muted)">Lot ${esc(s.lot_number)} Blk ${esc(s.block_number)}</small>
            </td>
            <td><strong>${esc(s.plate_number)}</strong></td>
            <td>${[s.make, s.model, s.color].filter(Boolean).map(esc).join(' ')}</td>
            <td>${s.sticker_year}</td>
            <td>${s.amount ? formatPeso(s.amount) : '—'}</td>
            <td>${s.receipt_number ? esc(s.receipt_number) : '—'}</td>
            <td>${formatDate(s.created_at)}</td>
            <td><span class="badge badge-${s.status}">${s.status}</span></td>
            <td>
              ${s.status === 'pending' ? `
                <button class="btn btn-success btn-sm" onclick="openReview(${s.id}, '${esc(s.plate_number)}', '${esc(s.homeowner_name)}')">Review</button>
              ` : `<small style="color:var(--text-muted)">${s.reviewed_by_name ? esc(s.reviewed_by_name) : ''}${s.review_notes ? '<br>' + esc(s.review_notes) : ''}</small>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

async function loadVehicles() {
  const el = document.getElementById('vehicles-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';
  try {
    const data = await api.get('/api/vehicles');
    renderVehicles(data.vehicles, data.current_year);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);padding:12px">${err.message}</p>`;
  }
}

function renderVehicles(vehicles, currentYear) {
  const el = document.getElementById('vehicles-list');
  if (!vehicles.length) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">No vehicles registered.</p>';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Homeowner</th><th>Plate</th><th>Make / Model</th><th>Color</th><th>Year</th>
        <th>${currentYear} Sticker</th>
      </tr></thead>
      <tbody>
        ${vehicles.map(v => `
          <tr>
            <td>
              <strong>${esc(v.homeowner_name)}</strong>
              <br><small style="color:var(--text-muted)">Lot ${esc(v.lot_number)} Blk ${esc(v.block_number)}</small>
            </td>
            <td><strong>${esc(v.plate_number)}</strong></td>
            <td>${[v.make, v.model].filter(Boolean).map(esc).join(' ') || '—'}</td>
            <td>${v.color ? esc(v.color) : '—'}</td>
            <td>${v.year || '—'}</td>
            <td>
              ${v.sticker_status
                ? `<span class="badge badge-${v.sticker_status}">${v.sticker_status}</span>`
                : '<span class="badge" style="background:#e2e8f0;color:#64748b">None</span>'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function openReview(id, plate, homeowner) {
  pendingReviewId = id;
  document.getElementById('review-title').textContent = `Review Sticker — ${plate}`;
  document.getElementById('review-details').innerHTML = `
    <table style="font-size:13px;border-collapse:collapse;width:100%">
      <tr><td style="padding:3px 8px 3px 0;color:var(--text-muted)">Homeowner</td><td><strong>${esc(homeowner)}</strong></td></tr>
      <tr><td style="padding:3px 8px 3px 0;color:var(--text-muted)">Plate</td><td><strong>${esc(plate)}</strong></td></tr>
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
    await api.put(`/api/vehicle-stickers/${pendingReviewId}/${action}`, { review_notes: notes || null });
    showToast(`Sticker ${action}`);
    closeReviewModal();
    loadStickers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Set default year filter
document.getElementById('f-year').value = new Date().getFullYear();
loadStickers();
