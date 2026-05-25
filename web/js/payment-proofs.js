const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let currentProofId = null;
let currentProofStatus = null;

async function loadProofs() {
  const status = document.getElementById('f-status').value;
  const list = document.getElementById('proofs-list');
  list.innerHTML = '<div class="loading-overlay">Loading...</div>';

  try {
    const params = status ? `?status=${status}` : '';
    const data = await api.get(`/api/payment-proofs${params}`);
    renderProofs(data.proofs);
  } catch (e) {
    list.innerHTML = `<div style="padding:16px;color:#dc2626;">Failed to load: ${e.message}</div>`;
  }
}

function renderProofs(proofs) {
  const list = document.getElementById('proofs-list');
  if (!proofs.length) {
    list.innerHTML = '<div style="padding:20px;color:#64748b;text-align:center;">No submissions found.</div>';
    return;
  }

  const rows = proofs.map(p => {
    const period = `${MONTH_ABBR[p.period_month - 1]} ${p.period_year}`;
    const submittedDate = p.submitted_at ? p.submitted_at.slice(0, 10) : '—';
    const badge = statusBadge(p.status);
    return `
      <tr style="cursor:pointer;" onclick="openModal(${p.id}, '${p.status}')">
        <td>${esc(p.homeowner_name)}</td>
        <td>${esc(p.lot_number || '—')}${p.block_number ? ' / Blk ' + esc(p.block_number) : ''}</td>
        <td>${period}</td>
        <td>${badge}</td>
        <td>${submittedDate}</td>
        <td style="color:#3b82f6;font-size:13px;">View →</td>
      </tr>`;
  }).join('');

  list.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Homeowner</th>
          <th>Lot / Block</th>
          <th>Period</th>
          <th>Status</th>
          <th>Submitted</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function statusBadge(status) {
  const map = {
    pending:  { color: '#d97706', bg: '#fef3c7', label: 'Pending' },
    approved: { color: '#16a34a', bg: '#dcfce7', label: 'Approved' },
    rejected: { color: '#dc2626', bg: '#fee2e2', label: 'Rejected' },
  };
  const s = map[status] || { color: '#64748b', bg: '#f1f5f9', label: status };
  return `<span style="background:${s.bg};color:${s.color};padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;">${s.label}</span>`;
}

async function openModal(id, status) {
  currentProofId = id;
  currentProofStatus = status;

  // Reset modal state
  document.getElementById('proof-img').style.display = 'none';
  document.getElementById('img-loading').style.display = 'block';
  document.getElementById('img-loading').textContent = 'Loading image...';
  document.getElementById('r-amount').value = '';
  document.getElementById('r-notes').value = '';
  document.getElementById('review-alert').innerHTML = '';
  document.getElementById('review-form').style.display = status === 'pending' ? '' : 'none';
  document.getElementById('reviewed-note').style.display = status !== 'pending' ? '' : 'none';
  document.getElementById('reviewed-note').textContent = status !== 'pending'
    ? `This submission has already been ${status}.`
    : '';

  document.getElementById('review-modal').style.display = 'flex';

  // Load proof details and image together
  try {
    const [listData, imgData] = await Promise.all([
      api.get(`/api/payment-proofs?status=`),
      api.get(`/api/payment-proofs/${id}/image`)
    ]);

    const proof = listData.proofs.find(p => p.id === id);
    if (proof) {
      const period = `${MONTHS[proof.period_month - 1]} ${proof.period_year}`;
      document.getElementById('review-details').innerHTML = `
        <strong>${esc(proof.homeowner_name)}</strong>
        &nbsp;·&nbsp; Lot ${proof.lot_number || '—'}
        &nbsp;·&nbsp; Period: <strong>${period}</strong>
        ${proof.review_notes ? `<br><span style="color:#64748b;">Notes: ${esc(proof.review_notes)}</span>` : ''}`;
    }

    const img = document.getElementById('proof-img');
    img.src = `data:image/jpeg;base64,${imgData.image_data}`;
    img.style.display = 'block';
    document.getElementById('img-loading').style.display = 'none';
  } catch (e) {
    document.getElementById('img-loading').textContent = 'Failed to load image.';
  }
}

function closeModal() {
  document.getElementById('review-modal').style.display = 'none';
}

async function submitReview(action) {
  const alertEl = document.getElementById('review-alert');
  alertEl.innerHTML = '';
  const notes = document.getElementById('r-notes').value.trim();
  const amount = document.getElementById('r-amount').value.trim();

  if (action === 'reject' && !notes) {
    alertEl.innerHTML = '<div class="alert alert-danger">Please enter a reason for rejection.</div>';
    return;
  }

  try {
    const body = { notes: notes || undefined };
    if (action === 'approve' && amount) body.amount = parseFloat(amount);

    await api.post(`/api/payment-proofs/${currentProofId}/${action}`, body);
    closeModal();
    showToast(`Proof ${action === 'approve' ? 'approved and payment recorded' : 'rejected'}.`);
    loadProofs();
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-danger">${e.message || 'Action failed.'}</div>`;
  }
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// Init
loadProofs();
