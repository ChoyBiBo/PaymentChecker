// API wrapper with session cookie support

async function apiFetch(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };

  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(path, opts);

  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (res.status === 401) {
      // Only redirect to login if we're not already on the login page
      if (!window.location.pathname.includes('login')) {
        window.location.href = '/login.html';
      }
      throw new Error(data.error || 'Session expired. Please log in again.');
    }
    if (!res.ok) {
      const msg = data.error || data.errors?.[0]?.msg || 'Request failed';
      throw new Error(msg);
    }
    return data;
  }

  if (res.status === 401) {
    if (!window.location.pathname.includes('login')) {
      window.location.href = '/login.html';
    }
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) throw new Error('Request failed');
  return res;
}

const api = {
  get: (path) => apiFetch('GET', path),
  post: (path, body) => apiFetch('POST', path, body),
  put: (path, body) => apiFetch('PUT', path, body),
  delete: (path) => apiFetch('DELETE', path),

  async download(path, filename) {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// Toast notifications
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || '•'}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.2s ease reverse';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// Confirm dialog helper
function confirmAction(message) {
  return window.confirm(message);
}

// Format currency (Philippine Peso)
function formatPeso(amount) {
  return '₱' + parseFloat(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format date
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Month names
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function monthName(m) { return MONTHS[parseInt(m)] || ''; }

// Escape HTML to prevent XSS
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
