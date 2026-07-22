const API = import.meta.env.VITE_BACKEND_URL + '/api'

function getToken() {
  return localStorage.getItem('pushpakwx_token')
}
function setToken(t) {
  if (t) localStorage.setItem('pushpakwx_token', t)
  else localStorage.removeItem('pushpakwx_token')
}
export function isLoggedIn() {
  return !!getToken()
}
export function logout() {
  setToken(null)
  localStorage.removeItem('pushpakwx_user')
  localStorage.removeItem('pushpakwx_previous_login')
}

async function request(path, options = {}, auth = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${API}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

export async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false)
  setToken(data.access_token)
  localStorage.setItem('pushpakwx_user', JSON.stringify(data.user))
  localStorage.setItem('pushpakwx_previous_login', data.previous_login || '')
  return data.user
}

export async function register(email, password, fullName) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name: fullName }),
  }, false)
}

export async function verifyEmail(email, code) {
  const data = await request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  }, false)
  setToken(data.access_token)
  localStorage.setItem('pushpakwx_user', JSON.stringify(data.user))
  localStorage.setItem('pushpakwx_previous_login', data.previous_login || '')
  return data.user
}

export async function resendVerification(email) {
  return request('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false)
}

export async function forgotPassword(email) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false)
}

export async function resetPassword(email, code, newPassword) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, new_password: newPassword }),
  }, false)
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('pushpakwx_user') || 'null')
  } catch {
    return null
  }
}

export function getStoredPreviousLogin() {
  return localStorage.getItem('pushpakwx_previous_login') || null
}

export function getMe() {
  return request('/auth/me')
}

export function getFlights() {
  return request('/flights')
}

export function getTopCheckedAirports(limit = 3) {
  return request(`/me/top-airports?limit=${limit}`)
}

export function getAirport(icao) {
  return request(`/airports/${icao}`, {}, false).catch(() => null)
}

export function getFlight(id) {
  return request(`/flights/${id}`)
}

export function deleteFlight(id) {
  return request(`/flights/${id}`, { method: 'DELETE' })
}

export async function downloadExport(id, format) {
  const data = await request(`/flights/${id}/export?format=${format}`)
  const blob = new Blob([data.content], { type: data.content_type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = data.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
