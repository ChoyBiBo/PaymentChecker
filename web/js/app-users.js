initPage('app-users');

let resetUserId = null;

async function loadHomeowners() {
  try {
    const data = await api.get('/api/homeowners');
    const sel = document.getElementById('u-homeowner');
    data.homeowners.filter(h => h.is_active).forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = `${h.full_name} — Lot ${h.lot_number} Blk ${h.block_number}`;
      sel.appendChild(opt);
    });
  } catch (e) { /* ignore */ }
}

async function loadUsers() {
  const el = document.getElementById('users-list');
  el.innerHTML = '<div class="loading-overlay">Loading...</div>';
  try {
    const data = await api.get('/api/app-users');
    renderUsers(data.users);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);padding:12px">${err.message}</p>`;
  }
}

function renderUsers(users) {
  const el = document.getElementById('users-list');
  if (!users.length) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">No app users yet.</p>';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Username</th><th>Name</th><th>Role</th><th>Homeowner</th><th>Last Login</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td><strong>${esc(u.username)}</strong></td>
            <td>${u.full_name ? esc(u.full_name) : '—'}</td>
            <td><span class="badge" style="background:#dbeafe;color:#1e40af">${u.role}</span></td>
            <td>${u.homeowner_name ? `${esc(u.homeowner_name)}<br><small style="color:var(--text-muted)">Lot ${esc(u.lot_number)} Blk ${esc(u.block_number)}</small>` : '—'}</td>
            <td>${u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</td>
            <td>
              <span class="badge ${u.is_active ? 'badge-updated' : 'badge-outdated'}">
                ${u.is_active ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="toggleUser(${u.id}, ${u.is_active})">
                ${u.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button class="btn btn-ghost btn-sm" onclick="openResetModal(${u.id}, '${esc(u.username)}')">
                Reset PW
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function onRoleChange() {
  const role = document.getElementById('u-role').value;
  document.getElementById('homeowner-row').style.display = role === 'homeowner' ? '' : 'none';
}

async function createUser() {
  const role = document.getElementById('u-role').value;
  const username = document.getElementById('u-username').value.trim();
  const password = document.getElementById('u-password').value;
  const full_name = document.getElementById('u-name').value.trim();
  const homeowner_id = document.getElementById('u-homeowner').value;

  if (!username || username.length < 3) { showToast('Username must be at least 3 chars', 'error'); return; }
  if (!password || password.length < 6) { showToast('Password must be at least 6 chars', 'error'); return; }
  if (role === 'homeowner' && !homeowner_id) { showToast('Select a homeowner', 'error'); return; }

  try {
    await api.post('/api/app-users', {
      username, password, full_name: full_name || null,
      role, homeowner_id: homeowner_id || null,
    });
    showToast('App user created');
    document.getElementById('u-username').value = '';
    document.getElementById('u-password').value = '';
    document.getElementById('u-name').value = '';
    document.getElementById('u-homeowner').selectedIndex = 0;
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUser(id, isActive) {
  try {
    await api.put(`/api/app-users/${id}/toggle-active`, {});
    showToast(isActive ? 'User deactivated' : 'User activated');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openResetModal(id, username) {
  resetUserId = id;
  document.getElementById('reset-username').textContent = username;
  document.getElementById('reset-password').value = '';
  document.getElementById('reset-modal').style.display = 'flex';
}

function closeResetModal() {
  document.getElementById('reset-modal').style.display = 'none';
  resetUserId = null;
}

async function submitReset() {
  const password = document.getElementById('reset-password').value;
  if (!password || password.length < 6) { showToast('Password must be at least 6 chars', 'error'); return; }
  try {
    await api.put(`/api/app-users/${resetUserId}/reset-password`, { password });
    showToast('Password reset successfully');
    closeResetModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

onRoleChange();
loadHomeowners();
loadUsers();
