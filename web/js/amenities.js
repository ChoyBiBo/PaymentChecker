initPage('amenities');

let amenities = [];

async function loadAmenities() {
  const el = document.getElementById('amenity-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';
  try {
    const data = await api.get('/api/amenities');
    amenities = data.amenities;
    renderAmenities();
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);padding:12px">${err.message}</p>`;
  }
}

function renderAmenities() {
  const el = document.getElementById('amenity-list');
  if (!amenities.length) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">No amenities yet.</p>';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Name</th><th>Location</th><th>Capacity</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${amenities.map(a => `
          <tr>
            <td><strong>${esc(a.name)}</strong>${a.description ? `<br><small style="color:var(--text-muted)">${esc(a.description)}</small>` : ''}</td>
            <td>${a.location ? esc(a.location) : '—'}</td>
            <td>${a.capacity ? a.capacity + ' pax' : '—'}</td>
            <td>
              <span class="badge ${a.current_status === 'in_use' ? 'badge-in_use' : 'badge-available'}">
                ${a.current_status === 'in_use' ? 'In Use' : 'Available'}
              </span>
              ${!a.is_active ? '<span class="badge" style="background:#e2e8f0;color:#64748b;margin-left:4px">Inactive</span>' : ''}
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="editAmenity(${a.id})">Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="toggleAmenity(${a.id}, ${a.is_active})">
                ${a.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function editAmenity(id) {
  const a = amenities.find(x => x.id === id);
  if (!a) return;
  document.getElementById('edit-id').value = a.id;
  document.getElementById('f-name').value = a.name;
  document.getElementById('f-desc').value = a.description || '';
  document.getElementById('f-loc').value = a.location || '';
  document.getElementById('f-cap').value = a.capacity || '';
  document.getElementById('form-title').textContent = 'Edit Amenity';
  document.getElementById('f-name').focus();
}

function resetForm() {
  document.getElementById('edit-id').value = '';
  document.getElementById('f-name').value = '';
  document.getElementById('f-desc').value = '';
  document.getElementById('f-loc').value = '';
  document.getElementById('f-cap').value = '';
  document.getElementById('form-title').textContent = 'Add Amenity';
}

async function saveAmenity() {
  const id = document.getElementById('edit-id').value;
  const name = document.getElementById('f-name').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  const body = {
    name,
    description: document.getElementById('f-desc').value.trim() || null,
    location: document.getElementById('f-loc').value.trim() || null,
    capacity: document.getElementById('f-cap').value ? parseInt(document.getElementById('f-cap').value) : null,
  };

  try {
    if (id) {
      await api.put(`/api/amenities/${id}`, body);
      showToast('Amenity updated');
    } else {
      await api.post('/api/amenities', body);
      showToast('Amenity created');
    }
    resetForm();
    loadAmenities();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleAmenity(id, isActive) {
  try {
    await api.put(`/api/amenities/${id}`, { is_active: !isActive });
    showToast(isActive ? 'Amenity deactivated' : 'Amenity activated');
    loadAmenities();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

loadAmenities();
