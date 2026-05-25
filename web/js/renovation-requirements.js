initPage('renovation-requirements');

let editingId = null;
let imgBase64 = null;

async function loadRequirements() {
  const el = document.getElementById('requirements-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';
  try {
    const data = await api.get('/api/renovation/requirements');
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
      <thead><tr><th>#</th><th>Title</th><th>Description</th><th>Sample</th><th>Actions</th></tr></thead>
      <tbody>
        ${reqs.map(r => `
          <tr>
            <td>${r.sort_order}</td>
            <td><strong>${esc(r.title)}</strong></td>
            <td>${r.description ? esc(r.description) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${r.sample_image ? `<img src="${r.sample_image.startsWith('data:') ? r.sample_image : 'data:image/jpeg;base64,' + r.sample_image}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0">` : '—'}</td>
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
  imgBase64 = null;
  document.getElementById('modal-title').textContent = 'Add Requirement';
  document.getElementById('f-title').value = '';
  document.getElementById('f-desc').value = '';
  document.getElementById('f-order').value = '0';
  document.getElementById('f-img-preview').style.display = 'none';
  document.getElementById('req-modal').style.display = 'flex';
}

function openEdit(req) {
  editingId = req.id;
  imgBase64 = req.sample_image || null;
  document.getElementById('modal-title').textContent = 'Edit Requirement';
  document.getElementById('f-title').value = req.title;
  document.getElementById('f-desc').value = req.description || '';
  document.getElementById('f-order').value = req.sort_order;
  const preview = document.getElementById('f-img-preview');
  if (req.sample_image) {
    preview.src = req.sample_image.startsWith('data:') ? req.sample_image : 'data:image/jpeg;base64,' + req.sample_image;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
  document.getElementById('req-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('req-modal').style.display = 'none';
}

document.getElementById('f-img').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    imgBase64 = e.target.result; // full data URL
    const preview = document.getElementById('f-img-preview');
    preview.src = imgBase64;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
});

async function saveRequirement() {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }
  const payload = {
    title,
    description: document.getElementById('f-desc').value.trim() || null,
    sort_order: parseInt(document.getElementById('f-order').value) || 0,
    sample_image: imgBase64 || null,
  };
  try {
    if (editingId) {
      await api.put(`/api/renovation/requirements/${editingId}`, payload);
      showToast('Requirement updated');
    } else {
      await api.post('/api/renovation/requirements', payload);
      showToast('Requirement added');
    }
    closeModal();
    loadRequirements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteReq(id) {
  if (!confirm('Remove this requirement?')) return;
  try {
    await api.delete(`/api/renovation/requirements/${id}`);
    showToast('Requirement removed');
    loadRequirements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

loadRequirements();
