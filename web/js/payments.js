let homeownersCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  await initPage('payments');

  // Set default period to current month/year
  const now = new Date();
  document.getElementById('p-month').value = now.getMonth() + 1;
  document.getElementById('p-year').value = now.getFullYear();

  // Populate year filter
  const yearFilter = document.getElementById('f-year');
  yearFilter.innerHTML = '<option value="">All Years</option>';
  for (let y = now.getFullYear(); y >= 2020; y--) {
    yearFilter.innerHTML += `<option value="${y}"${y === now.getFullYear() ? ' selected' : ''}>${y}</option>`;
  }

  await loadHomeownerDropdowns();
  await loadPayments();
});

async function loadHomeownerDropdowns() {
  try {
    const data = await api.get('/api/homeowners');
    homeownersCache = data.homeowners;

    const options = homeownersCache.map(h =>
      `<option value="${h.id}" data-due="${h.monthly_due}">Lot ${esc(h.lot_number)}${h.block_number ? ` Blk ${esc(h.block_number)}` : ''} — ${esc(h.full_name)}</option>`
    ).join('');

    document.getElementById('p-homeowner').innerHTML = '<option value="">— Select homeowner —</option>' + options;
    document.getElementById('f-homeowner').innerHTML = '<option value="">All Homeowners</option>' + options;

    // Auto-fill amount when homeowner selected
    document.getElementById('p-homeowner').addEventListener('change', function() {
      const h = homeownersCache.find(h => h.id == this.value);
      if (h) document.getElementById('p-amount').value = h.monthly_due;
    });
  } catch (e) {
    showToast('Failed to load homeowners', 'error');
  }
}

async function loadPayments() {
  const tbody = document.getElementById('payments-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="loading-overlay">Loading...</td></tr>';

  const hid = document.getElementById('f-homeowner').value;
  const year = document.getElementById('f-year').value;
  const month = document.getElementById('f-month').value;

  let url = '/api/payments?';
  if (hid) url += `homeowner_id=${hid}&`;
  if (year) url += `year=${year}&`;
  if (month) url += `month=${month}`;

  try {
    const data = await api.get(url);
    const payments = data.payments;
    const isSuperAdmin = window._currentUser?.role === 'superadmin';

    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><p>No payments found.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map(p => `
      <tr>
        <td>${esc(p.full_name)}</td>
        <td>Lot ${esc(p.lot_number)}${p.block_number ? ` Blk ${esc(p.block_number)}` : ''}</td>
        <td>${monthName(p.period_month)} ${p.period_year}</td>
        <td>${formatPeso(p.amount_paid)}</td>
        <td style="text-transform:capitalize;">${esc(p.payment_method)}</td>
        <td>${esc(p.receipt_number || '—')}</td>
        <td>${esc(p.recorded_by_username || '—')}</td>
        <td>${formatDate(p.paid_at)}</td>
        <td class="superadmin-only">${isSuperAdmin ? `<button class="btn btn-sm btn-danger" onclick="voidPayment(${p.id}, '${esc(p.full_name)}', '${monthName(p.period_month)} ${p.period_year}')">Void</button>` : ''}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="alert alert-danger">${esc(e.message)}</div></td></tr>`;
  }
}

async function recordPayment() {
  const homId = document.getElementById('p-homeowner').value;
  const month = document.getElementById('p-month').value;
  const year = document.getElementById('p-year').value;
  const amount = document.getElementById('p-amount').value;
  const method = document.getElementById('p-method').value;
  const receipt = document.getElementById('p-receipt').value.trim();
  const notes = document.getElementById('p-notes').value.trim();
  const alertEl = document.getElementById('pay-alert');
  alertEl.innerHTML = '';

  if (!homId || !month || !year || !amount) {
    alertEl.innerHTML = '<div class="alert alert-danger">Please fill in all required fields.</div>';
    return;
  }

  try {
    await api.post('/api/payments', {
      homeowner_id: parseInt(homId),
      period_year: parseInt(year),
      period_month: parseInt(month),
      amount_paid: parseFloat(amount),
      payment_method: method,
      receipt_number: receipt || null,
      notes: notes || null,
    });

    showToast('Payment recorded successfully');
    alertEl.innerHTML = '';

    // Reset form
    document.getElementById('p-homeowner').value = '';
    document.getElementById('p-amount').value = '';
    document.getElementById('p-receipt').value = '';
    document.getElementById('p-notes').value = '';

    loadPayments();
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

async function voidPayment(id, name, period) {
  if (!confirmAction(`Void payment for "${name}" (${period})? This cannot be undone.`)) return;
  try {
    await api.delete(`/api/payments/${id}`);
    showToast('Payment voided');
    loadPayments();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
