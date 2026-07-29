// Defines the background location task Android/iOS invoke while the app is
// backgrounded (screen locked, phone stowed away, etc). Must be defined at
// module scope — TaskManager needs this registered as soon as the JS bundle
// loads, since the OS may relaunch a lightweight, headless JS context purely
// to service a background location callback, without ever mounting the
// InFlight screen (or any screen) at all.
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { processLocationUpdate, isRecordingActive, STOP_WARNING_MS } from './flightRecording';
import { presentStopWarningNotification } from './stopWarningNotifications';
import { getReliableMslAltitudeFt } from '../utils/mslAltitude';
import { getSpeedKtWithFallback } from '../utils/derivedSpeed';

export const BACKGROUND_LOCATION_TASK = 'pushpakwx-background-flight-recording';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[flight-recording] background task error', error.message);
    return;
  }
  const { locations } = (data as { locations: Location.LocationObject[] }) || { locations: [] };
  if (!locations || locations.length === 0) return;

  // Skip all work when nothing is actually being recorded, so the task stays
  // cheap on the rare updates the OS might still deliver outside a flight.
  if (!(await isRecordingActive())) return;

  for (const l of locations) {
    const altFt = l.coords.altitude != null
      ? await getReliableMslAltitudeFt(
          l.coords.latitude,
          l.coords.longitude,
          l.coords.altitude,
          l.coords.altitudeAccuracy ?? null,
          l.timestamp,
        )
      : undefined;
    const speedKtOrUndefined = await getSpeedKtWithFallback(
      l.coords.latitude,
      l.coords.longitude,
      l.timestamp,
      l.coords.speed,
    );
    const speedKt = speedKtOrUndefined ?? 0;
    const sample = {
      t: l.timestamp,
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      alt_ft: altFt,
      speed_kt: speedKtOrUndefined,
      heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : undefined,
    };
    // autoDetectEnabled is always true here: by the time this task can even
    // be running, a recording is already active (checked above), and only
    // the stop-side of auto-detect matters once recording — the enabled/
    // disabled preference only gates whether AUTO-START behavior applies,
    // which can't happen from the background task in the first place.
    const result = await processLocationUpdate(speedKt, sample, true);
    if (result.shouldWarn) {
      await presentStopWarningNotification(STOP_WARNING_MS / 1000);
    }
  }
});
