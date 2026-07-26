// Local-side companion to the backend's /anonymous/* endpoints. Tracks
// whether THIS device has already passed Turnstile verification (so the
// verification screen only ever shows once, not on every launch) and
// wraps the check-and-use call the search/route-check screens make before
// each anonymous action.
import { storage } from '@/src/utils/storage';
import { getDeviceId } from '@/src/utils/deviceId';

const VERIFIED_KEY = 'anonymous_device_verified';
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function isDeviceVerifiedLocally(): Promise<boolean> {
  return (await storage.getItem<boolean>(VERIFIED_KEY, false)) ?? false;
}

export async function markDeviceVerifiedLocally(): Promise<void> {
  await storage.setItem(VERIFIED_KEY, true);
}

export async function verifyDeviceWithBackend(turnstileToken: string): Promise<boolean> {
  const deviceId = await getDeviceId();
  try {
    const res = await fetch(`${BASE}/api/anonymous/verify-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, turnstile_token: turnstileToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.verified) await markDeviceVerifiedLocally();
    return !!data.verified;
  } catch {
    return false;
  }
}

export type AnonymousAction = 'airport_search' | 'route_check';

export type CheckAndUseResult = { allowed: boolean; remaining: number };

export async function checkAndUse(action: AnonymousAction): Promise<CheckAndUseResult> {
  const deviceId = await getDeviceId();
  try {
    const res = await fetch(`${BASE}/api/anonymous/check-and-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, action }),
    });
    if (!res.ok) {
      // Device verification lapsed server-side somehow, or a transient
      // error — fail closed (treat as not allowed) rather than silently
      // granting unlimited anonymous use if something's gone wrong.
      return { allowed: false, remaining: 0 };
    }
    return await res.json();
  } catch {
    return { allowed: false, remaining: 0 };
  }
}
