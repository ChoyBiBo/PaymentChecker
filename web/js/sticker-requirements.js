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
  if (!reqs || !reqs.length) {
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
