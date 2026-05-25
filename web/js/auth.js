// Populate header user info and set active nav link
async function initPage(activeNav) {
  try {
    const data = await api.get('/api/auth/me');
    const user = data.user;

    const el = document.getElementById('header-user');
    if (el) el.textContent = user.fullName || user.username;

    const roleEl = document.getElementById('header-role');
    if (roleEl) roleEl.textContent = user.role === 'superadmin' ? 'Super Admin' : 'Staff';

    // Store role for conditional UI
    window._currentUser = user;

    // Hide superadmin-only elements for staff
    if (user.role !== 'superadmin') {
      document.querySelectorAll('.superadmin-only').forEach(el => el.style.display = 'none');
    }

    // Set active nav link
    if (activeNav) {
      document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.nav === activeNav);
      });
    }

    // Inject notification bell into top-header
    const header = document.querySelector('.top-header');
    if (header && !header.querySelector('.notif-bell')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'notif-wrapper';

      const bell = document.createElement('button');
      bell.className = 'notif-bell';
      bell.id = 'notif-bell';
      bell.innerHTML = '🔔 <span class="notif-badge" id="notif-badge" style="display:none">0</span>';
      bell.onclick = (e) => { e.stopPropagation(); toggleNotifDropdown(); };

      const dropdown = document.createElement('div');
      dropdown.className = 'notif-dropdown';
      dropdown.id = 'notif-dropdown';

      wrapper.appendChild(bell);
      wrapper.appendChild(dropdown);
      header.appendChild(wrapper);

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) closeNotifDropdown();
      });

      loadNotifCount();
      setInterval(loadNotifCount, 30000);
    }
  } catch (e) {
    // 401 redirect handled by api.js
  }
}

const NOTIF_DESTINATIONS = {
  'amenity_request': '/amenity-bookings.html',
  'vehicle_sticker': '/vehicles.html',
  'renovation_permit': '/renovation-permits.html',
};

function toggleNotifDropdown() {
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;
  const isOpen = dropdown.classList.contains('open');
  if (isOpen) {
    closeNotifDropdown();
  } else {
    openNotifDropdown();
  }
}

function closeNotifDropdown() {
  const dropdown = document.getElementById('notif-dropdown');
  if (dropdown) dropdown.classList.remove('open');
}

async function openNotifDropdown() {
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;
  dropdown.classList.add('open');
  dropdown.innerHTML = '<div class="notif-empty">Loading...</div>';
  try {
    const data = await api.get('/api/notifications');
    renderNotifDropdown(dropdown, data.notifications);
    updateNotifBadge(data.unread_count);
  } catch (e) {
    dropdown.innerHTML = '<div class="notif-empty">Failed to load notifications</div>';
  }
}

function renderNotifDropdown(dropdown, notifications) {
  const header = `
    <div class="notif-dropdown-header">
      <span>Notifications</span>
      <button class="notif-mark-all" onclick="markAllNotifRead()">Mark all as read</button>
    </div>`;

  if (!notifications.length) {
    dropdown.innerHTML = header + '<div class="notif-empty">No notifications</div>';
    return;
  }

  const items = notifications.map(n => {
    const dest = NOTIF_DESTINATIONS[n.type] || null;
    const timeAgo = formatNotifTime(n.created_at);
    return `
      <div class="notif-item ${n.is_read ? '' : 'unread'}"
           onclick="handleNotifClick(${n.id}, '${n.type}')">
        <div class="notif-item-title">${esc(n.title)}</div>
        <div class="notif-item-msg">${esc(n.message)}</div>
        <div class="notif-item-time">${timeAgo}${dest ? ' · Click to view' : ''}</div>
      </div>`;
  }).join('');

  dropdown.innerHTML = header + items;
}

async function handleNotifClick(id, type) {
  closeNotifDropdown();
  // Mark as read (fire and forget)
  api.put(`/api/notifications/${id}/read`, {}).catch(() => {});
  const dest = NOTIF_DESTINATIONS[type];
  if (dest) window.location.href = dest;
}

async function markAllNotifRead() {
  try {
    await api.put('/api/notifications/read-all', {});
    updateNotifBadge(0);
    closeNotifDropdown();
    showToast('All notifications marked as read');
  } catch (e) { /* ignore */ }
}

async function loadNotifCount() {
  try {
    const data = await api.get('/api/notifications');
    updateNotifBadge(data.unread_count);
  } catch (e) { /* ignore */ }
}

function updateNotifBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function formatNotifTime(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function logout() {
  try {
    await api.post('/api/auth/logout');
  } catch (e) { /* ignore */ }
  window.location.href = '/login.html';
}

// Login page logic
if (document.getElementById('login-form')) {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';

    try {
      await api.post('/api/auth/login', { username, password });
      window.location.href = '/dashboard.html';
    } catch (err) {
      errorEl.textContent = err.message || 'Login failed';
      btn.disabled = false;
      btn.innerHTML = 'Sign In';
    }
  });
}
