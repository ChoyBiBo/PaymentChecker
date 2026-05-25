// Populate header user info and set active nav link
async function initPage(activeNav) {
  try {
    const data = await api.get('/api/auth/me');
    const user = data.user;

    const el = document.getElementById('header-user');
    if (el) el.textContent = user.fullName || user.username;

    const roleEl = document.getElementById('header-role');
    if (roleEl) roleEl.textContent = user.role === 'superadmin' ? 'Super Admin' : 'Staff';

    // Show demo mode banner when logged in as demo_admin
    if (user.username === 'demo_admin' && !document.getElementById('demo-banner')) {
      const banner = document.createElement('div');
      banner.id = 'demo-banner';
      banner.innerHTML = `
        <span style="font-weight:700;">DEMO MODE</span>
        &nbsp;—&nbsp; You are viewing a live demo. Write actions (approve, record, delete, create users) are disabled.
        &nbsp;<a href="/" style="color:#fff;text-decoration:underline;font-size:12px;">Exit Demo →</a>`;
      banner.style.cssText = `
        position:fixed;bottom:0;left:0;right:0;z-index:9999;
        background:#d97706;color:#fff;text-align:center;
        padding:10px 16px;font-size:13px;line-height:1.4;`;
      document.body.appendChild(banner);
      // Nudge page content up so banner doesn't overlap
      document.body.style.paddingBottom = '48px';
    }

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
  (async function initLogin() {
    let isTestMode = false;

    try {
      const cfg = await fetch('/api/auth/mode').then(r => r.json());
      isTestMode = cfg.mode === 'test';
    } catch (e) {
      // Cannot reach server — treat as non-test mode
    }

    if (isTestMode) {
      // Test mode: auto-login, never show the form
      const card = document.querySelector('.login-card');
      card.innerHTML = `
        <div class="login-logo">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="30" fill="#1a6b7b"/>
            <path d="M30 12L14 24h3v20h12v-10h2v10h12V24h3L30 12z" fill="white"/>
          </svg>
          <h1>HOA Connect</h1>
          <p>Community Management App</p>
        </div>
        <div style="background:#d97706;color:#fff;padding:5px 16px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:1px;text-align:center;margin-bottom:20px;">DEMO MODE</div>
        <p style="text-align:center;color:#5a7a84;font-size:14px;margin-bottom:8px;" id="demo-msg">Signing you in&hellip;</p>`;
      document.body.style.visibility = 'visible';

      try {
        await api.post('/api/auth/login', { username: 'demo_admin', password: 'Demo@1234' });
        window.location.replace('/dashboard.html');
      } catch (err) {
        document.getElementById('demo-msg').innerHTML =
          `<span style="color:#dc2626;font-size:13px;">Could not sign in: ${err.message || 'Server error'}</span><br>
           <a href="javascript:location.reload()" style="color:#1a6b7b;font-size:13px;margin-top:8px;display:inline-block;">↻ Try again</a>`;
      }
      return;
    }

    // Not test mode — reveal the normal login form
    document.body.style.visibility = 'visible';

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
  })();
}
