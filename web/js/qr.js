let selectedHomeowner = null;
let allHomeowners = [];

document.addEventListener('DOMContentLoaded', async () => {
  await initPage('qr');
  await loadHomeownerList();

  // Check if ?id= param present
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) {
    document.getElementById('qr-homeowner').value = id;
    loadSingleQR();
  }
});

async function loadHomeownerList() {
  try {
    const data = await api.get('/api/homeowners');
    allHomeowners = data.homeowners;
    const sel = document.getElementById('qr-homeowner');
    sel.innerHTML = '<option value="">— Select homeowner —</option>' +
      allHomeowners.map(h =>
        `<option value="${h.id}">Lot ${esc(h.lot_number)}${h.block_number ? ` Blk ${esc(h.block_number)}` : ''} — ${esc(h.full_name)}</option>`
      ).join('');
  } catch (e) {
    showToast('Failed to load homeowners', 'error');
  }
}

async function loadSingleQR() {
  const id = document.getElementById('qr-homeowner').value;
  if (!id) {
    document.getElementById('qr-preview').style.display = 'none';
    document.getElementById('regen-btn').style.display = 'none';
    return;
  }

  selectedHomeowner = allHomeowners.find(h => h.id == id);
  if (!selectedHomeowner) return;

  // Set image src — browser sends session cookie automatically (same origin)
  document.getElementById('qr-img').src = `/api/qr/${id}?t=${Date.now()}`;
  document.getElementById('qr-name').textContent = selectedHomeowner.full_name;
  document.getElementById('qr-lot').textContent =
    `Lot ${selectedHomeowner.lot_number}${selectedHomeowner.block_number ? ` Block ${selectedHomeowner.block_number}` : ''}`;

  document.getElementById('qr-preview').style.display = 'block';
  document.getElementById('regen-btn').style.display = 'inline-flex';
  document.getElementById('print-all-area').style.display = 'none';
}

function printSingleQR() {
  if (!selectedHomeowner) {
    showToast('Please select a homeowner first', 'warning');
    return;
  }
  window.print();
}

async function regenerateQR() {
  if (!selectedHomeowner) return;
  if (!confirmAction(
    `Regenerate QR token for "${selectedHomeowner.full_name}"?\n\nWARNING: Any previously printed QR codes will become INVALID. You will need to reprint and redistribute the new QR code.`
  )) return;

  try {
    await api.post(`/api/homeowners/${selectedHomeowner.id}/regenerate-qr`);
    showToast('QR token regenerated. Refreshing QR code...');
    // Force reload the QR image
    document.getElementById('qr-img').src = `/api/qr/${selectedHomeowner.id}?t=${Date.now()}`;
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function printAllQRs() {
  const area = document.getElementById('print-all-area');
  const grid = document.getElementById('all-qr-grid');

  if (allHomeowners.length === 0) {
    showToast('No homeowners to print', 'warning');
    return;
  }

  grid.innerHTML = '<div class="loading-overlay">Generating QR codes...</div>';
  area.style.display = 'block';
  document.getElementById('qr-preview').style.display = 'none';

  // Build all QR cards (img tags load from API — session cookie sent automatically)
  grid.innerHTML = allHomeowners.map(h => `
    <div class="qr-card">
      <img src="/api/qr/${h.id}?t=${Date.now()}" alt="QR ${esc(h.full_name)}" style="width:180px;height:180px;"
           onerror="this.style.border='1px solid red';this.alt='Failed'">
      <div class="qr-name">${esc(h.full_name)}</div>
      <div class="qr-lot">Lot ${esc(h.lot_number)}${h.block_number ? ` Block ${esc(h.block_number)}` : ''}</div>
      <div class="qr-hoa">HOA Payment Checker</div>
    </div>
  `).join('');

  // Wait for all images to load then print
  const imgs = grid.querySelectorAll('img');
  let loaded = 0;
  const total = imgs.length;

  function tryPrint() {
    loaded++;
    if (loaded >= total) {
      setTimeout(() => window.print(), 300);
    }
  }

  imgs.forEach(img => {
    if (img.complete) tryPrint();
    else { img.onload = tryPrint; img.onerror = tryPrint; }
  });

  if (total === 0) window.print();
}
