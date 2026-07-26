// A persistent, anonymous identifier for this install — generated once on
// first launch and reused forever after, independent of any account. This
// is what lets the backend enforce "5 free searches, ever" per device
// rather than per session, without requiring login to track anything.
//
// Deliberately NOT tied to any hardware identifier (IMEI, MAC address,
// etc.) — those raise real privacy concerns and most platforms restrict
// access to them anyway. A locally-generated UUID, stored the same way a
// login token would be, is sufficient for this purpose and nothing more
// invasive than that.
import * as Crypto from 'expo-crypto';
import { storage } from '@/src/utils/storage';

const DEVICE_ID_KEY = 'anonymous_device_id';

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = await storage.getItem<string>(DEVICE_ID_KEY, '');
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const fresh = Crypto.randomUUID();
  await storage.setItem(DEVICE_ID_KEY, fresh);
  cachedDeviceId = fresh;
  return fresh;
}
