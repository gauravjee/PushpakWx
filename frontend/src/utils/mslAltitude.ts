// GPS altitude, as delivered by the standard native location APIs both
// platforms expose through expo-location, is NOT consistently referenced
// the same way:
//   - Android's Location.getAltitude() returns height above the WGS84
//     ellipsoid — a purely geometric reference that can differ from true
//     mean sea level by anywhere from roughly -100m to +80m depending on
//     where on Earth you are (confirmed for this app's own primary
//     operating region: roughly -60 to -65m / -200ft in western India).
//   - iOS's CLLocation.altitude is already MSL-referenced (geoid-relative,
//     EGM2008), matching what pilots actually expect to see.
//
// Left uncorrected, this produces a large, silent, and entirely
// location-dependent systematic error on Android specifically — not
// sensor noise, and not something the existing altitude smoothing (which
// only reduces noise) does anything to address.
//
// Correction uses the EGM96 geoid model (a well-established, CI-tested-
// against-the-reference-Fortran-implementation open dataset) via the
// egm96-universal package — a pure-JS lookup + bilinear interpolation,
// so it works fully offline, which matters given in-flight GPS logging
// has no guaranteed connectivity.
import { Platform } from 'react-native';
import * as egm96 from 'egm96-universal';
import { storage } from '@/src/utils/storage';

/**
 * Converts a raw GPS altitude (meters) to mean-sea-level altitude (meters).
 * On iOS, returns the value unchanged — it's already MSL-referenced, and
 * applying this correction there would double-correct it incorrectly.
 */
export function toMslAltitudeMeters(lat: number, lon: number, rawAltitudeM: number): number {
  if (Platform.OS !== 'android') return rawAltitudeM;
  try {
    return egm96.ellipsoidToEgm96(lat, lon, rawAltitudeM);
  } catch {
    // Bilinear interpolation reads from a bundled data grid; an unexpected
    // failure here (e.g. a corrupted read) shouldn't take down altitude
    // display entirely — fall back to the uncorrected value rather than
    // showing nothing.
    return rawAltitudeM;
  }
}

// GPS vertical position is inherently far less reliable than horizontal —
// it needs much better satellite geometry to compute accurately, and that
// degrades significantly when a phone is stowed away with reduced signal
// (confirmed against a real flight: position kept updating correctly
// throughout, while altitude stayed frozen for long stretches — exactly
// what happens when the GPS chip keeps reporting a low-confidence, stale
// vertical fix while horizontal position is still solid).
//
// Smoothing alone doesn't catch this — averaging in a value that's
// genuinely stale, not just noisy, just smooths consistently-wrong data.
// Instead: read GPS's own accuracy figure for this fix, and reject
// readings worse than a reasonable threshold outright, falling back to
// the last known GOOD altitude instead of recording an unreliable one.
//
// This threshold (30m / ~100ft) is a reasonable starting point given
// typical GPS vertical accuracy in good conditions, not a precisely
// calibrated figure — worth revisiting based on further real-flight data.
const UNRELIABLE_ACCURACY_THRESHOLD_M = 30;
const KEY_LAST_GOOD_ALT_FT = 'flight_recording_last_good_alt_ft';

export async function getReliableMslAltitudeFt(
  lat: number,
  lon: number,
  rawAltitudeM: number,
  accuracyM: number | null,
): Promise<number> {
  const correctedFt = toMslAltitudeMeters(lat, lon, rawAltitudeM) * 3.281;
  const isReliable = accuracyM == null || accuracyM <= UNRELIABLE_ACCURACY_THRESHOLD_M;
  if (isReliable) {
    await storage.setItem(KEY_LAST_GOOD_ALT_FT, correctedFt);
    return correctedFt;
  }
  const lastGood = await storage.getItem<number>(KEY_LAST_GOOD_ALT_FT, correctedFt);
  return lastGood ?? correctedFt;
}

// Called when a new recording begins, so a stale "last good altitude"
// from a previous flight can never leak into a fresh one.
export async function resetLastGoodAltitude(): Promise<void> {
  await storage.removeItem(KEY_LAST_GOOD_ALT_FT);
}
