let searchTimeout;

document.addEventListener('DOMContentLoaded', async () => {
  await initPage('homeowners');
  await loadHomeowners();
});

async function loadHomeowners() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  const tbody = document.getElementById('homeowners-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-overlay">Loading...</td></tr>';

  let url = '/api/homeowners?';
  if (search) url += `search=${encodeURIComponent(search)}&`;
  if (status) url += `status=${status}`;

  try {
    const data = await api.get(url);
    const list = data.homeowners;
    document.getElementById('count-label').textContent = `${list.length} homeowner${list.length !== 1 ? 's' : ''}`;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>No homeowners found.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(h => `
      <tr>
        <td><strong>${esc(h.lot_number)}</strong></td>
        <td>${esc(h.block_number || '—')}</td>
        <td>${esc(h.full_name)}</td>
        <td>${esc(h.contact_phone || h.contact_email || '—')}</td>
        <td>${formatPeso(h.monthly_due)}</td>
        <td><span class="badge badge-${h.payment_status}">${h.payment_status === 'updated' ? 'Updated' : 'Outdated'}</span></td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="viewHomeowner(${h.id})" title="View">👁</button>
          <button class="btn btn-sm btn-ghost" onclick="editHomeowner(${h.id})" title="Edit">✏</button>
          <a href="/qr-print.html?id=${h.id}" class="btn btn-sm btn-ghost" title="QR Code">⬛</a>
          <button class="btn btn-sm btn-danger" onclick="deleteHomeowner(${h.id}, '${esc(h.full_name)}')" title="Deactivate">🗑</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">Failed to load homeowners: ${esc(e.message)}</div></td></tr>`;
  }
}

function onSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadHomeowners, 350);
}

function openAddModal() {
  document.getElementById('form-modal-title').textContent = 'Add Homeowner';
  document.getElementById('edit-id').value = '';
  ['f-name','f-lot','f-block','f-due','f-address','f-phone','f-email','f-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('form-error').textContent = '';
  document.getElementById('form-modal').classList.add('open');
}

function closeFormModal() {
  document.getElementById('form-modal').classList.remove('open');
}

async function editHomeowner(id) {
  try {
    const data = await api.get(`/api/homeowners/${id}`);
    const h = data.homeowner;
    document.getElementById('form-modal-title').textContent = 'Edit Homeowner';
    document.getElementById('edit-id').value = h.id;
    document.getElementById('f-name').value = h.full_name || '';
    document.getElementById('f-lot').value = h.lot_number || '';
    document.getElementById('f-block').value = h.block_number || '';
    document.getElementById('f-due').value = h.monthly_due || '';
    document.getElementById('f-address').value = h.address || '';
    document.getElementById('f-phone').value = h.contact_phone || '';
    document.getElementById('f-email').value = h.contact_email || '';
    document.getElementById('f-notes').value = h.notes || '';
    document.getElementById('form-error').textContent = '';
    document.getElementById('form-modal').classList.add('open');
  } catch (e) {
    showToast('Failed to load homeowner: ' + e.message, 'error');
  }
}

async function saveHomeowner() {
  const id = document.getElementById('edit-id').value;
  const body = {
    full_name: document.getElementById('f-name').value.trim(),
    lot_number: document.getElementById('f-lot').value.trim(),
    block_number: document.getElementById('f-block').value.trim(),
    monthly_due: document.getElementById('f-due').value || null,
    address: document.getElementById('f-address').value.trim(),
    contact_phone: document.getElementById('f-phone').value.trim(),
    contact_email: document.getElementById('f-email').value.trim(),
    notes: document.getElementById('f-notes').value.trim(),
  };

  if (!body.full_name || !body.lot_number) {
    document.getElementById('form-error').textContent = 'Full name and lot number are required.';
    return;
  }

  try {
    if (id) {
      await api.put(`/api/homeowners/${id}`, body);
      showToast('Homeowner updated successfully');
    } else {
      await api.post('/api/homeowners', body);
      showToast('Homeowner added successfully');
    }
    closeFormModal();
    loadHomeowners();
  } catch (e) {
    document.getElementById('form-error').textContent = e.message;
  }
}

async function deleteHomeowner(id, name) {
  if (!confirmAction(`Deactivate "${name}"? They will be removed from the active list.`)) return;
  try {
    await api.delete(`/api/homeowners/${id}`);
    showToast('Homeowner deactivated');
    loadHomeowners();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function viewHomeowner(id) {
  const body = document.getElementById('view-modal-body');
  body.innerHTML = '<div class="loading-overlay">Loading...</div>';
  document.getElementById('view-modal').classList.add('open');

  try {
    const data = await api.get(`/api/homeowners/${id}`);
    const h = data.homeowner;
    const payments = data.payments;

    // Build 12-month calendar
    const now = new Date();
    let calCells = '';
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      const paid = payments.find(p => p.period_year == y && p.period_month == m);
      const cls = paid ? 'paid' : (d > now ? 'future' : 'unpaid');
      calCells += `<div class="cal-cell ${cls}"><span class="month">${monthName(m).substring(0,3)}<br>${y}</span>${paid ? '✓' : (cls === 'future' ? '' : '✕')}</div>`;
    }

    document.getElementById('view-modal-title').textContent = h.full_name;
    body.innerHTML = `
      <div class="form-row" style="margin-bottom:16px;">
        <div><div class="form-label">Lot / Block</div><div>Lot ${esc(h.lot_number)}${h.block_number ? ` Block ${esc(h.block_number)}` : ''}</div></div>
        <div><div class="form-label">Monthly Due</div><div>${formatPeso(h.monthly_due)}</div></div>
        <div><div class="form-label">Phone</div><div>${esc(h.contact_phone || '—')}</div></div>
        <div><div class="form-label">Email</div><div>${esc(h.contact_email || '—')}</div></div>
      </div>
      ${h.address ? `<div class="form-group"><div class="form-label">Address</div><div>${esc(h.address)}</div></div>` : ''}
      ${h.notes ? `<div class="form-group"><div class="form-label">Notes</div><div>${esc(h.notes)}</div></div>` : ''}
      <hr class="divider">
      <div class="form-label" style="margin-bottom:8px;">Payment History (last 12 months)</div>
      <div class="payment-calendar">${calCells}</div>
    `;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

function closeViewModal() {
  document.getElementById('view-modal').classList.remove('open');
}
