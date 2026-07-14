import { storage } from '@/src/utils/storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API_BASE = `${BASE}/api`;
export const TOKEN_KEY = 'pw_auth_token';

export type UserPublic = {
  id: string;
  email: string;
  full_name?: string | null;
  created_at: string;
  email_verified?: boolean;
};

export type Airport = {
  icao: string;
  iata?: string | null;
  name: string;
  city?: string | null;
  country?: string | null;
  lat: number;
  lon: number;
  elevation_ft?: number | null;
};

export type Favorite = Airport & { id: string; created_at: string };

export type Prefs = {
  wind_unit: 'kt' | 'kmh' | 'mph';
  altitude_unit: 'ft' | 'm';
  temp_unit: 'C' | 'F';
};

async function request<T>(path: string, options: RequestInit = {}, auth = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = await storage.secureGet<string>(TOKEN_KEY, '');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = 'Request failed';
    try {
      const body = await res.json();
      detail = body?.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  register: (email: string, password: string, full_name?: string) =>
    request<{ message: string; email: string; requires_verification: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name }),
    }),
  verifyEmail: (email: string, code: string) =>
    request<{ access_token: string; user: UserPublic }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),
  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: UserPublic }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, code: string, new_password: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, new_password }),
    }),
  deleteAccount: (password: string) =>
    request<{ message: string }>('/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }, true),
  me: () => request<UserPublic>('/auth/me', {}, true),
  searchAirports: (q: string) =>
    request<{ results: Airport[] }>(`/airports/search?q=${encodeURIComponent(q)}`),
  geocode: (q: string) =>
    request<{ results: Array<{ name: string; latitude: number; longitude: number; country?: string; admin1?: string }> }>(
      `/geocode?q=${encodeURIComponent(q)}`,
    ),
  forecast: (lat: number, lon: number) =>
    request<any>(`/weather/forecast?lat=${lat}&lon=${lon}`),
  listFavorites: () => request<Favorite[]>('/favorites', {}, true),
  addFavorite: (payload: Omit<Favorite, 'id' | 'created_at'>) =>
    request<Favorite>('/favorites', { method: 'POST', body: JSON.stringify(payload) }, true),
  removeFavorite: (id: string) =>
    request<{ ok: boolean }>(`/favorites/${id}`, { method: 'DELETE' }, true),
  getPrefs: () => request<Prefs>('/prefs', {}, true),
  updatePrefs: (p: Prefs) =>
    request<Prefs>('/prefs', { method: 'PUT', body: JSON.stringify(p) }, true),
};
