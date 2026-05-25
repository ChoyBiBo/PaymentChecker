initPage('renovation-permits');

let currentPermitId = null;
let currentFiles = [];
let currentWorkers = [];

async function loadPermits() {
  const el = document.getElementById('permits-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';
  const status = document.getElementById('f-status').value;
  let url = '/api/renovation/permits';
  if (status) url += `?status=${status}`;
  try {
    const data = await api.get(url);
    renderPermits(data.permits);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);padding:12px">${err.message}</p>`;
  }
}

function renderPermits(permits) {
  const el = document.getElementById('permits-list');
  if (!permits.length) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">No permit requests found.</p>';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Homeowner</th><th>Submitted</th><th>Files</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${permits.map(p => `
          <tr>
            <td><strong>${esc(p.homeowner_name)}</strong><br><small style="color:var(--text-muted)">Lot ${esc(p.lot_number)}${p.block_number ? ' Blk ' + esc(p.block_number) : ''}</small></td>
            <td>${formatDate(p.created_at)}</td>
            <td>${p.file_count} file(s)${p.invalid_count > 0 ? ` <span style="color:var(--danger)">(${p.invalid_count} invalid)</span>` : ''}</td>
            <td><span class="badge badge-${p.status}">${p.status}</span></td>
            <td><button class="btn btn-primary btn-sm" onclick="openReview(${p.id})">Review</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function openReview(id) {
  currentPermitId = id;
  document.getElementById('review-modal').style.display = 'flex';
  document.getElementById('review-files').innerHTML = '<div style="color:var(--text-muted)">Loading...</div>';
  document.getElementById('review-notes').value = '';
  document.getElementById('rejection-wrap').style.display = 'none';
  document.getElementById('review-status').value = 'pending';

  try {
    const data = await api.get(`/api/renovation/permits/${id}`);
    const { permit, files, workers } = data;
    currentFiles = files;
    currentWorkers = workers || [];

    document.getElementById('review-permit-title').textContent =
      `Permit #${permit.id} — ${permit.homeowner_name}`;
    document.getElementById('review-homeowner').textContent =
      `Lot ${permit.lot_number}${permit.block_number ? ' Blk ' + permit.block_number : ''} · Submitted ${formatDate(permit.created_at)}`;
    if (permit.notes) {
      document.getElementById('review-applicant-notes').textContent = `Notes: ${permit.notes}`;
      document.getElementById('review-applicant-notes').style.display = 'block';
    } else {
      document.getElementById('review-applicant-notes').style.display = 'none';
    }

    document.getElementById('review-status').value = permit.status;
    document.getElementById('review-notes').value = permit.rejection_reason || '';
    toggleRejectionField();

    renderReviewFiles(files);
    renderReviewWorkers(currentWorkers);
  } catch (err) {
    document.getElementById('review-files').innerHTML = `<p style="color:var(--danger)">${err.message}</p>`;
  }
}

function renderReviewFiles(files) {
  const el = document.getElementById('review-files');
  if (!files.length) {
    el.innerHTML = '<p style="color:var(--text-muted)">No files submitted.</p>';
    return;
  }
  el.innerHTML = files.map(f => `
    <div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <strong style="flex:1">${esc(f.requirement_title)}</strong>
        <button class="btn btn-ghost btn-sm" onclick="viewFile(${f.id})">View File</button>
      </div>
      <div style="display:flex;gap:16px;font-size:13px;">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="radio" name="file_${f.id}" value="true" ${f.is_valid === true ? 'checked' : ''}> Valid
        </label>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="radio" name="file_${f.id}" value="false" ${f.is_valid === false ? 'checked' : ''}> Invalid
        </label>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="radio" name="file_${f.id}" value="null" ${f.is_valid === null ? 'checked' : ''}> Not Reviewed
        </label>
      </div>
    </div>`).join('');
}

function renderReviewWorkers(workers) {
  const wrap = document.getElementById('review-workers-wrap');
  const el = document.getElementById('review-workers');
  if (!workers || !workers.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  el.innerHTML = workers.map((w, i) => `
    <div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px;">
      <div style="flex:1">
        <div style="font-weight:600;font-size:14px;color:#1a3a4a">${esc(w.name)}</div>
        <div style="font-size:12px;color:var(--text-muted)">Worker #${i + 1}</div>
      </div>
      ${w.id_card_image
        ? `<button class="btn btn-ghost btn-sm" onclick="viewWorkerIdCard(${w.id})">View ID Card</button>`
        : `<span style="font-size:12px;color:var(--text-muted)">No ID card</span>`}
    </div>`).join('');
}

function viewWorkerIdCard(workerId) {
  const w = currentWorkers.find(x => x.id === workerId);
  if (!w || !w.id_card_image) return;
  const src = w.id_card_image.startsWith('data:') ? w.id_card_image : `data:image/jpeg;base64,${w.id_card_image}`;
  const win = window.open();
  win.document.write(`<img src="${src}" style="max-width:100%;height:auto">`);
}

function viewFile(fileId) {
  const file = currentFiles.find(f => f.id === fileId);
  if (!file) return;
  const src = file.file_data.startsWith('data:') ? file.file_data : `data:image/jpeg;base64,${file.file_data}`;
  const w = window.open();
  w.document.write(`<img src="${src}" style="max-width:100%;height:auto">`);
}

function toggleRejectionField() {
  const status = document.getElementById('review-status').value;
  document.getElementById('rejection-wrap').style.display = status === 'rejected' ? '' : 'none';
}

function closeReviewModal() {
  document.getElementById('review-modal').style.display = 'none';
  currentPermitId = null;
  currentFiles = [];
  currentWorkers = [];
}

async function submitReview() {
  if (!currentPermitId) return;
  const status = document.getElementById('review-status').value;
  const rejection_reason = document.getElementById('review-notes').value.trim() || null;

  const file_reviews = currentFiles.map(f => {
    const radios = document.querySelectorAll(`input[name="file_${f.id}"]`);
    let is_valid = null;
    radios.forEach(r => { if (r.checked) { is_valid = r.value === 'null' ? null : r.value === 'true'; } });
    return { file_id: f.id, is_valid };
  });

  try {
    await api.put(`/api/renovation/permits/${currentPermitId}/review`, { status, rejection_reason, file_reviews });
    showToast('Review submitted');
    closeReviewModal();
    loadPermits();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

loadPermits();
