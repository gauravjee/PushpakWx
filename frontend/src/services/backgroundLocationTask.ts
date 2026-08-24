// Defines the background location task Android/iOS invoke while the app is
// backgrounded (screen locked, phone stowed away, etc). Must be defined at
// module scope — TaskManager needs this registered as soon as the JS bundle
// loads, since the OS may relaunch a lightweight, headless JS context purely
// to service a background location callback, without ever mounting the
// InFlight screen (or any screen) at all.
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { processLocationUpdate, isRecordingActive, getAutoDetectPref, STOP_WARNING_MS } from './flightRecording';
import { presentStopWarningNotification, presentAutoStartNotification } from './stopWarningNotifications';
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

  // This task now starts as soon as the InFlight screen has location
  // permission (see inflight.tsx), not only once a recording is already
  // active — specifically so auto-start can be detected here too, not
  // just by the foreground watcher, which may go quiet once the phone is
  // genuinely stowed. It's only safe to bail out early when there's
  // nothing this task could possibly do: no recording in progress AND the
  // pilot has auto-detect turned off (nothing in that combination can
  // ever change from a background update — auto-start is disabled, and
  // there's no active recording to auto-stop). getAutoDetectPref() reads
  // a persisted mirror of the preference (see PrefsContext.tsx) since a
  // headless task has no React tree to pull it from directly.
  const recording = await isRecordingActive();
  if (!recording && !(await getAutoDetectPref())) return;

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
      acc_m: l.coords.accuracy ?? undefined,
    };
    // Pass the pilot's real preference, not a hardcoded true — the old
    // comment here reasoned this didn't matter because only auto-STOP
    // could apply once already recording, but processLocationUpdate gates
    // auto-stop on this same flag too. Hardcoding true meant a pilot who'd
    // turned auto-detect off (manual start/stop only) could still have
    // this task auto-stop their recording against that preference, once
    // it started being able to run at all times rather than only during
    // an active recording.
    const autoDetectEnabled = await getAutoDetectPref();
    const result = await processLocationUpdate(speedKt, sample, autoDetectEnabled);
    if (result.action === 'started') {
      await presentAutoStartNotification();
    }
    if (result.shouldWarn) {
      await presentStopWarningNotification(STOP_WARNING_MS / 1000);
    }
  }
});
