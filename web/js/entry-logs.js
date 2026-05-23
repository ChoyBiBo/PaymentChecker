initPage('entry-logs');

async function loadLogs() {
  const el = document.getElementById('logs-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';
  const type = document.getElementById('f-type').value;
  const from = document.getElementById('f-from').value;
  const to = document.getElementById('f-to').value;
  let url = '/api/entry-logs?';
  if (type) url += `scan_type=${type}&`;
  if (from) url += `date_from=${from}&`;
  if (to) url += `date_to=${to}&`;
  try {
    const data = await api.get(url);
    renderLogs(data.logs);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);padding:12px">${err.message}</p>`;
  }
}

function renderLogs(logs) {
  const el = document.getElementById('logs-list');
  if (!logs.length) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">No entry logs found.</p>';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Date &amp; Time</th><th>Homeowner</th><th>Type</th><th>Detail</th><th>Guard</th>
      </tr></thead>
      <tbody>
        ${logs.map(l => `
          <tr>
            <td style="white-space:nowrap">${formatDateTime(l.entry_at)}</td>
            <td>
              <strong>${esc(l.homeowner_name)}</strong>
              <br><small style="color:var(--text-muted)">Lot ${esc(l.lot_number)} Blk ${esc(l.block_number)}</small>
            </td>
            <td>
              <span class="badge" style="background:${l.scan_type === 'dues' ? '#dbeafe' : '#fef3c7'};color:${l.scan_type === 'dues' ? '#1e40af' : '#92400e'}">
                ${l.scan_type === 'dues' ? 'HOA Dues' : 'Vehicle Sticker'}
              </span>
            </td>
            <td>
              ${l.scan_type === 'vehicle_sticker' && l.plate_number
                ? `${esc(l.plate_number)} &nbsp; <small style="color:var(--text-muted)">${l.sticker_year || ''}</small>`
                : '—'}
            </td>
            <td>${l.guard_name ? esc(l.guard_name) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function clearFilters() {
  document.getElementById('f-type').value = '';
  document.getElementById('f-from').value = '';
  document.getElementById('f-to').value = '';
  loadLogs();
}

loadLogs();
