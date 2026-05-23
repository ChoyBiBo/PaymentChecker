document.addEventListener('DOMContentLoaded', async () => {
  await initPage('settings');

  if (window._currentUser?.role === 'superadmin') {
    await loadAdminUsers();
    await loadAuditLog();
  }
});

async function loadAdminUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-overlay">Loading...</td></tr>';

  try {
    const data = await api.get('/api/admin-users');
    const users = data.users;

    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${esc(u.username)}</strong></td>
        <td>${esc(u.full_name || '—')}</td>
        <td><span class="badge badge-${u.role}">${u.role === 'superadmin' ? 'Super Admin' : 'Staff'}</span></td>
        <td><span class="badge badge-${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>${formatDate(u.last_login_at)}</td>
        <td>
          ${u.id !== window._currentUser?.id
            ? `<button class="btn btn-sm btn-${u.is_active ? 'danger' : 'success'}" onclick="toggleUser(${u.id}, '${esc(u.username)}', ${u.is_active})">
                ${u.is_active ? 'Deactivate' : 'Activate'}
               </button>`
            : '<span style="color:#94a3b8;font-size:12px;">You</span>'}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert-danger">${esc(e.message)}</div></td></tr>`;
  }
}

async function toggleUser(id, username, isActive) {
  const action = isActive ? 'Deactivate' : 'Activate';
  if (!confirmAction(`${action} user "${username}"?`)) return;

  try {
    await api.put(`/api/admin-users/${id}/toggle-active`);
    showToast(`User ${action.toLowerCase()}d`);
    loadAdminUsers();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openAddUserModal() {
  ['u-username', 'u-fullname', 'u-password'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('u-role').value = 'staff';
  document.getElementById('user-form-error').textContent = '';
  document.getElementById('add-user-modal').classList.add('open');
}

function closeAddUserModal() {
  document.getElementById('add-user-modal').classList.remove('open');
}

async function addAdminUser() {
  const username = document.getElementById('u-username').value.trim();
  const password = document.getElementById('u-password').value;
  const full_name = document.getElementById('u-fullname').value.trim();
  const role = document.getElementById('u-role').value;
  const errEl = document.getElementById('user-form-error');
  errEl.textContent = '';

  if (!username || !password) {
    errEl.textContent = 'Username and password are required.';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    return;
  }

  try {
    await api.post('/api/admin-users', { username, password, full_name, role });
    showToast('Admin user created');
    closeAddUserModal();
    loadAdminUsers();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function changePassword() {
  const currentPassword = document.getElementById('pw-current').value;
  const newPassword = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  const alertEl = document.getElementById('pw-alert');
  alertEl.innerHTML = '';

  if (!currentPassword || !newPassword) {
    alertEl.innerHTML = '<div class="alert alert-danger">All fields are required.</div>';
    return;
  }
  if (newPassword !== confirm) {
    alertEl.innerHTML = '<div class="alert alert-danger">New passwords do not match.</div>';
    return;
  }
  if (newPassword.length < 6) {
    alertEl.innerHTML = '<div class="alert alert-danger">Password must be at least 6 characters.</div>';
    return;
  }

  try {
    await api.put('/api/auth/change-password', { currentPassword, newPassword });
    showToast('Password changed successfully');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

async function loadAuditLog() {
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = '<tr><td colspan="4" class="loading-overlay">Loading...</td></tr>';

  try {
    const data = await api.get('/api/admin-users/audit-log');
    const logs = data.logs;

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><p>No audit logs yet.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      let detail = '';
      try { detail = JSON.stringify(l.detail); } catch (e) { detail = String(l.detail); }
      return `
        <tr>
          <td><code style="font-size:11px;">${esc(l.action)}</code></td>
          <td>${esc(l.admin_username || '—')}</td>
          <td style="font-size:12px;color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(detail)}">${esc(detail)}</td>
          <td style="white-space:nowrap;">${formatDateTime(l.performed_at)}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="alert alert-danger">${esc(e.message)}</div></td></tr>`;
  }
}
