document.addEventListener('DOMContentLoaded', async () => {
  await initPage('announcements');
  await loadAnnouncements();
});

async function loadAnnouncements() {
  const list = document.getElementById('ann-list');
  list.innerHTML = '<div class="loading-overlay">Loading...</div>';

  try {
    const data = await api.get('/api/announcements');
    const items = data.announcements;

    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No active announcements.</p></div>';
      return;
    }

    list.innerHTML = items.map(a => `
      <div style="padding:14px 0;border-bottom:1px solid #e2e8f0;display:flex;gap:12px;align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${esc(a.title)}</div>
          <div style="font-size:13px;color:#374151;white-space:pre-wrap;">${esc(a.body)}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:6px;">
            Posted by ${esc(a.posted_by_name || 'Admin')} on ${formatDate(a.posted_at)}
            ${a.expires_at ? ` · Expires ${formatDate(a.expires_at)}` : ''}
          </div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement(${a.id})">Delete</button>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

async function postAnnouncement() {
  const title = document.getElementById('a-title').value.trim();
  const body = document.getElementById('a-body').value.trim();
  const expires = document.getElementById('a-expires').value;
  const alertEl = document.getElementById('ann-alert');
  alertEl.innerHTML = '';

  if (!title || !body) {
    alertEl.innerHTML = '<div class="alert alert-danger">Title and message are required.</div>';
    return;
  }

  try {
    await api.post('/api/announcements', {
      title,
      body,
      expires_at: expires || null,
    });
    showToast('Announcement posted');
    document.getElementById('a-title').value = '';
    document.getElementById('a-body').value = '';
    document.getElementById('a-expires').value = '';
    loadAnnouncements();
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

async function deleteAnnouncement(id) {
  if (!confirmAction('Delete this announcement?')) return;
  try {
    await api.delete(`/api/announcements/${id}`);
    showToast('Announcement deleted');
    loadAnnouncements();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
