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
      const bell = document.createElement('button');
      bell.className = 'notif-bell';
      bell.id = 'notif-bell';
      bell.innerHTML = '🔔 <span class="notif-badge" id="notif-badge" style="display:none">0</span>';
      bell.onclick = () => window.location.href = '/amenity-bookings.html';
      header.appendChild(bell);
      loadNotifCount();
      setInterval(loadNotifCount, 30000);
    }
  } catch (e) {
    // 401 redirect handled by api.js
  }
}

async function loadNotifCount() {
  try {
    const data = await api.get('/api/notifications');
    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (data.unread_count > 0) {
        badge.textContent = data.unread_count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (e) { /* ignore */ }
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
