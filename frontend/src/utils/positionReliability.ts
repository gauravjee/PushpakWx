// Horizontal GPS accuracy filter for recorded flight samples.
//
// Until now, the recording pipeline filtered altitude readings for
// reliability (mslAltitude.ts) but applied NO equivalent filter to lat/lon
// — every fix, however degraded, was written straight into the saved
// track. During sustained background throttling (screen-locked cruise
// flight — worst on Samsung devices specifically, whose own separate
// battery/app-sleep manager under Device Care sits on top of, and is not
// satisfied merely by accepting, the standard Android battery-optimization
// exemption dialog), Android can silently substitute a low-accuracy
// network-based fix for a real GPS fix. That produces multi-kilometer
// "teleport" jumps in the recorded track — and since derivedSpeed.ts
// computes speed from haversine distance between consecutive samples,
// those jumps also produce garbage speed spikes riding along with them.
// This is the leading suspected cause of a real flight showing a visibly
// torn/incorrect path with wrong altitude and speed.
//
// Unlike altitude, a bad position fix is NOT replaced with the last known
// good one — silently repeating a static position would make it look like
// the aircraft stopped, which is exactly as misleading as a random jump.
// Bad-accuracy samples are simply excluded from the saved track instead.
// This trades a filled-in (but wrong) track for an honest gap — the same
// trade already made by mslAltitude's reliability filter, just applied to
// position. A safety ceiling still applies, mirroring mslAltitude's
// MAX_STALE_MS: if accuracy never recovers for a long stretch, a sample
// force-accepts rather than leaving an indefinite hole in the track.
import { storage } from '@/src/utils/storage';

const UNRELIABLE_HORIZONTAL_ACCURACY_M = 150;
const MAX_STALE_MS = 60 * 1000;
const KEY_LAST_GOOD_POS_TIME = 'flight_recording_last_good_pos_time';

export async function isPositionReliable(
  accuracyM: number | null | undefined,
  sampleTimeMs: number,
): Promise<boolean> {
  const isReliable = accuracyM == null || accuracyM <= UNRELIABLE_HORIZONTAL_ACCURACY_M;

  const lastGoodTime = (await storage.getItem<number>(KEY_LAST_GOOD_POS_TIME, 0)) ?? 0;
  const staleForMs = sampleTimeMs - lastGoodTime;
  const forceAccept = staleForMs > MAX_STALE_MS;

  if (isReliable || forceAccept) {
    await storage.setItem(KEY_LAST_GOOD_POS_TIME, sampleTimeMs);
    return true;
  }
  return false;
}

// Called when a new recording begins, so a stale "last good position time"
// from a previous flight can never leak into a fresh one.
export async function resetPositionReliability(): Promise<void> {
  await storage.removeItem(KEY_LAST_GOOD_POS_TIME);
}
