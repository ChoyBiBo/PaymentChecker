document.addEventListener('DOMContentLoaded', async () => {
  await initPage('reports');

  const now = new Date();
  document.getElementById('r-month').value = now.getMonth() + 1;
  document.getElementById('r-year').value = now.getFullYear();

  await generateReport();
  await loadDelinquency();
});

async function generateReport() {
  const month = document.getElementById('r-month').value;
  const year = document.getElementById('r-year').value;
  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="loading-overlay">Loading...</div></td></tr>';

  try {
    const data = await api.get(`/api/reports/monthly-summary?year=${year}&month=${month}`);
    const homeowners = data.homeowners;

    document.getElementById('report-stats').style.display = 'grid';
    document.getElementById('r-paid').textContent = data.paid_count;
    document.getElementById('r-unpaid').textContent = data.unpaid_count;
    document.getElementById('r-total').textContent = formatPeso(data.total_collected);
    const rate = data.total_homeowners > 0
      ? Math.round((data.paid_count / data.total_homeowners) * 100)
      : 0;
    document.getElementById('r-rate').textContent = `${rate}%`;

    if (homeowners.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><p>No homeowners found.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = homeowners.map(h => `
      <tr>
        <td>${esc(h.lot_number)}</td>
        <td>${esc(h.block_number || '—')}</td>
        <td>${esc(h.full_name)}</td>
        <td>${formatPeso(h.monthly_due)}</td>
        <td><span class="badge badge-${h.payment_status}">${h.payment_status === 'updated' ? 'Updated' : 'Outdated'}</span></td>
        <td>${h.amount_paid ? formatPeso(h.amount_paid) : '—'}</td>
        <td>${formatDate(h.paid_at)}</td>
        <td>${esc(h.receipt_number || '—')}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-danger">${esc(e.message)}</div></td></tr>`;
  }
}

async function loadDelinquency() {
  const tbody = document.getElementById('del-tbody');
  tbody.innerHTML = '<tr><td colspan="7"><div class="loading-overlay">Loading...</div></td></tr>';

  try {
    const data = await api.get('/api/reports/delinquency');
    const list = data.delinquent;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>No delinquent homeowners. All paid up!</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = list.map(h => {
      const severity = h.months_behind >= 3 ? 'danger' : 'warning';
      return `
        <tr>
          <td>${esc(h.lot_number)}</td>
          <td>${esc(h.block_number || '—')}</td>
          <td>${esc(h.full_name)}</td>
          <td>${esc(h.contact_phone || '—')}</td>
          <td>${h.last_paid_period || 'Never paid'}</td>
          <td><span class="badge badge-${severity === 'danger' ? 'outdated' : 'outdated'}" style="${severity === 'warning' ? 'background:#fef3c7;color:#92400e;' : ''}">${h.months_behind} month${h.months_behind !== 1 ? 's' : ''}</span></td>
          <td><strong>${formatPeso(h.estimated_arrears)}</strong></td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${esc(e.message)}</div></td></tr>`;
  }
}

async function exportCSV() {
  const month = document.getElementById('r-month').value;
  const year = document.getElementById('r-year').value;
  try {
    await api.download(
      `/api/reports/export-csv?year=${year}&month=${month}`,
      `HOA_Dues_${monthName(month)}_${year}.csv`
    );
    showToast('CSV downloaded');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}
