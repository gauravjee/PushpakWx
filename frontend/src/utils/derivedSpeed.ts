// GPS doesn't always provide a speed reading — confirmed against real
// flight data: many samples, especially the more widely-spaced ones
// typical of background tracking, arrive with speed entirely missing,
// not just imprecise. Left as-is, those samples silently record as 0
// speed regardless of how fast the aircraft was actually moving, which
// then feeds directly into the auto-stop logic (a real risk: enough
// speed-missing samples in a row could look like a stop that never
// actually happened).
//
// When GPS speed is missing, this derives a speed estimate from the
// distance and time between this sample and the last one — a coarser,
// average-over-the-interval figure rather than a true instantaneous
// speed, but meaningfully better than silently recording zero.
import { storage } from '@/src/utils/storage';

const KEY_LAST_POSITION = 'flight_recording_last_position';

type LastPosition = { lat: number; lon: number; t: number };

// Haversine distance between two lat/lon points, in meters.
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Returns a speed in knots for this sample — GPS's own reported speed
 * when available, or a distance/time-derived estimate when it's missing.
 * Always updates the persisted last-position, regardless of which path
 * was used, so the next call has an accurate reference point.
 */
export async function getSpeedKtWithFallback(
  lat: number,
  lon: number,
  timeMs: number,
  gpsSpeedMps: number | null,
): Promise<number | undefined> {
  const raw = await storage.getItem<string>(KEY_LAST_POSITION, '');
  let last: LastPosition | null = null;
  if (raw) {
    try {
      last = JSON.parse(raw) as LastPosition;
    } catch {
      last = null;
    }
  }
  await storage.setItem(KEY_LAST_POSITION, JSON.stringify({ lat, lon, t: timeMs }));

  if (gpsSpeedMps != null && gpsSpeedMps >= 0) {
    return gpsSpeedMps * 1.9438;
  }

  if (!last) return undefined;
  const dtSeconds = (timeMs - last.t) / 1000;
  // A near-zero or negative interval (duplicate/out-of-order samples,
  // which do occur — see the two-samples-per-timestamp pattern already
  // known from background delivery) would produce a meaningless or
  // divide-by-near-zero speed; skip deriving one in that case.
  if (dtSeconds < 1) return undefined;

  const distanceM = haversineMeters(lat, lon, last.lat, last.lon);
  const speedMps = distanceM / dtSeconds;
  return speedMps * 1.9438;
}

// Called when a new recording begins, so a stale reference position from
// a previous flight (or from sitting idle before this one started) can
// never leak into a fresh one.
export async function resetLastPosition(): Promise<void> {
  await storage.removeItem(KEY_LAST_POSITION);
}
