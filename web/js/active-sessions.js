document.addEventListener('DOMContentLoaded', async () => {
  await initPage('active-sessions');

  if (window._currentUser?.role !== 'superadmin') {
    window.location.href = '/dashboard.html';
    return;
  }

  await loadSessions();
  setInterval(loadSessions, 30000);
});

async function loadSessions() {
  const tbody = document.getElementById('sessions-tbody');
  const countEl = document.getElementById('session-count');

  try {
    const data = await api.get('/api/admin-users/active-sessions');
    const sessions = data.sessions;

    countEl.textContent = `${sessions.length} active session${sessions.length !== 1 ? 's' : ''}`;

    if (sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>No active sessions.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = sessions.map(s => {
      const roleBadge = s.role === 'superadmin'
        ? '<span class="badge badge-superadmin">Super Admin</span>'
        : '<span class="badge badge-staff">Staff</span>';

      const youBadge = s.isCurrentSession
        ? ' <span style="font-size:11px;background:#e0f2fe;color:#0369a1;padding:2px 7px;border-radius:4px;font-weight:600;">You</span>'
        : '';

      const action = s.isCurrentSession
        ? '<span style="color:var(--text-muted);font-size:12px;">Current session</span>'
        : `<button class="btn btn-sm btn-danger" onclick="revokeSession('${esc(s.sid)}', '${esc(s.username)}')">Force Logout</button>`;

      return `
        <tr>
          <td><strong>${esc(s.username || '—')}</strong>${youBadge}</td>
          <td>${esc(s.fullName || '—')}</td>
          <td>${roleBadge}</td>
          <td style="white-space:nowrap;">${formatDateTime(s.expiresAt)}</td>
          <td>${action}</td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="alert alert-danger">${esc(e.message)}</div></td></tr>`;
  }
}

async function revokeSession(sid, username) {
  if (!confirmAction(`Force logout "${username}"? They will be signed out immediately.`)) return;
  try {
    await api.delete(`/api/admin-users/active-sessions/${encodeURIComponent(sid)}`);
    showToast(`${username} has been signed out`);
    loadSessions();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
