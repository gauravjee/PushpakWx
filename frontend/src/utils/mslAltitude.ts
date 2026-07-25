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
