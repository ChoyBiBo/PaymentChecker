document.addEventListener('DOMContentLoaded', async () => {
  await initPage('dashboard');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  document.getElementById('period-label').textContent =
    `${monthName(month)} ${year}`;

  // Load summary
  try {
    const data = await api.get(`/api/reports/monthly-summary?year=${year}&month=${month}`);
    document.getElementById('stat-total').textContent = data.total_homeowners;
    document.getElementById('stat-updated').textContent = data.paid_count;
    document.getElementById('stat-outdated').textContent = data.unpaid_count;
    document.getElementById('stat-collected').textContent = formatPeso(data.total_collected);
    const pct = data.total_homeowners > 0
      ? Math.round((data.paid_count / data.total_homeowners) * 100)
      : 0;
    document.getElementById('stat-percent').textContent = `${pct}% compliance rate`;
  } catch (e) {
    console.error('Summary error:', e);
  }

  // Load delinquency
  try {
    const del = await api.get('/api/reports/delinquency');
    if (del.count > 0) {
      const card = document.getElementById('delinquency-card');
      card.style.display = 'block';
      document.getElementById('delinquency-msg').textContent =
        `${del.count} homeowner${del.count !== 1 ? 's are' : ' is'} behind on monthly dues. ` +
        `Estimated total arrears: ${formatPeso(del.delinquent.reduce((s, r) => s + parseFloat(r.estimated_arrears), 0))}.`;
      document.getElementById('announcements-col').style.gridColumn = '1';
    }
  } catch (e) { /* ignore */ }

  // Load announcements
  try {
    const ann = await api.get('/api/announcements');
    const list = document.getElementById('announcements-list');
    if (ann.announcements.length === 0) {
      list.innerHTML = '<p style="color:#64748b;font-size:13px;">No active announcements.</p>';
    } else {
      list.innerHTML = ann.announcements.slice(0, 3).map(a => `
        <div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:600;font-size:13px;">${esc(a.title)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">${esc(a.body).substring(0, 120)}${a.body.length > 120 ? '...' : ''}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Posted ${formatDate(a.posted_at)}</div>
        </div>
      `).join('');
    }
  } catch (e) { /* ignore */ }

  // Load recent payments
  try {
    const pay = await api.get('/api/payments');
    const tbody = document.getElementById('recent-payments-body');
    const recent = pay.payments.slice(0, 10);
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No payments recorded yet.</p></td></tr>';
    } else {
      tbody.innerHTML = recent.map(p => `
        <tr>
          <td>${esc(p.full_name)}</td>
          <td>Lot ${esc(p.lot_number)}${p.block_number ? ` Blk ${esc(p.block_number)}` : ''}</td>
          <td>${monthName(p.period_month)} ${p.period_year}</td>
          <td>${formatPeso(p.amount_paid)}</td>
          <td style="text-transform:capitalize;">${esc(p.payment_method)}</td>
          <td>${formatDate(p.paid_at)}</td>
        </tr>
      `).join('');
    }
  } catch (e) { /* ignore */ }
});
