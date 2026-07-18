const BASE = import.meta.env.VITE_BACKEND_URL || '';
const API = `${BASE}/api`;

function getToken() {
  return localStorage.getItem('pushpakwx_admin_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('pushpakwx_admin_token', token);
  else localStorage.removeItem('pushpakwx_admin_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore parse errors
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data.user;
}

export function logout() {
  setToken(null);
}

export function isLoggedIn() {
  return !!getToken();
}

export function getOverview() {
  return request('/admin/overview');
}

export function getUsers({ page = 1, limit = 25, q = '' } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (q) params.set('q', q);
  return request(`/admin/users?${params.toString()}`);
}

export function getActivity(limit = 50) {
  return request(`/admin/activity?limit=${limit}`);
}
