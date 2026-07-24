// Core flight-recording logic shared between the foreground InFlight screen
// and the background location task (backgroundLocationTask.ts). Neither one
// owns this logic exclusively — a location update arriving via either path
// runs through the exact same auto-start/auto-stop and sample-persistence
// code, so behavior is identical regardless of whether the screen is open.
//
// Samples and recording state live in AsyncStorage (via the shared `storage`
// helper), not React state, specifically because the background task may run
// in a lightweight, headless JS context with no mounted component — anything
// kept only in memory would be lost the moment that context is torn down.
import { storage } from '@/src/utils/storage';

export type FlightSample = {
  t: number;
  lat: number;
  lon: number;
  alt_ft?: number;
  speed_kt?: number;
  heading?: number;
};

type AutoDetectState = {
  fastSince: number | null;
  slowSince: number | null;
  fastBlipSince: number | null;
};

const KEY_RECORDING_ACTIVE = 'flight_recording_active';
const KEY_RECORD_START_MS = 'flight_recording_start_ms';
const KEY_SAMPLES = 'flight_recording_samples';
const KEY_AUTO_STATE = 'flight_recording_autostate';
// Set when auto-stop fires while the app wasn't in the foreground to see it —
// checked on next launch/resume so the post-flight details form can still be
// shown retroactively, rather than the completed flight silently vanishing.
const KEY_PENDING_STOPPED = 'flight_recording_pending_stopped';

export const AUTO_START_KT = 30;
export const AUTO_START_MS = 15 * 1000;
export const AUTO_STOP_KT = 2;
export const AUTO_STOP_MS = 2 * 60 * 1000;
const AUTO_STOP_RESET_GRACE_MS = 10 * 1000;

async function getAutoState(): Promise<AutoDetectState> {
  const raw = await storage.getItem<string>(KEY_AUTO_STATE, '');
  if (!raw) return { fastSince: null, slowSince: null, fastBlipSince: null };
  try {
    return JSON.parse(raw) as AutoDetectState;
  } catch {
    return { fastSince: null, slowSince: null, fastBlipSince: null };
  }
}

async function setAutoState(state: AutoDetectState): Promise<void> {
  await storage.setItem(KEY_AUTO_STATE, JSON.stringify(state));
}

export async function isRecordingActive(): Promise<boolean> {
  return (await storage.getItem<boolean>(KEY_RECORDING_ACTIVE, false)) ?? false;
}

export async function getRecordStartMs(): Promise<number | null> {
  return storage.getItem<number | null>(KEY_RECORD_START_MS, null);
}

export async function getSamples(): Promise<FlightSample[]> {
  const raw = await storage.getItem<string>(KEY_SAMPLES, '');
  if (!raw) return [];
  try {
    return JSON.parse(raw) as FlightSample[];
  } catch {
    return [];
  }
}

async function appendSample(sample: FlightSample): Promise<FlightSample[]> {
  const current = await getSamples();
  const updated = [...current, sample];
  await storage.setItem(KEY_SAMPLES, JSON.stringify(updated));
  return updated;
}

export async function beginRecording(startMs: number): Promise<void> {
  await storage.setItem(KEY_RECORDING_ACTIVE, true);
  await storage.setItem(KEY_RECORD_START_MS, startMs);
  await storage.setItem(KEY_SAMPLES, JSON.stringify([]));
  await setAutoState({ fastSince: null, slowSince: null, fastBlipSince: null });
  await storage.setItem(KEY_PENDING_STOPPED, false);
}

// Clears recording state entirely — call after a flight has been fully
// saved (or discarded), once its samples are no longer needed in storage.
export async function clearRecording(): Promise<void> {
  await storage.setItem(KEY_RECORDING_ACTIVE, false);
  await storage.removeItem(KEY_RECORD_START_MS);
  await storage.removeItem(KEY_SAMPLES);
  await storage.removeItem(KEY_AUTO_STATE);
  await storage.setItem(KEY_PENDING_STOPPED, false);
}

export async function hasPendingStoppedFlight(): Promise<boolean> {
  return (await storage.getItem<boolean>(KEY_PENDING_STOPPED, false)) ?? false;
}

export type ProcessResult = {
  samples: FlightSample[];
  action: 'started' | 'stopped' | null;
  // Current auto-detect timing, so a caller (the InFlight screen) can
  // compute its own "X seconds left" countdown display without needing a
  // second storage read — this function already has the current state
  // in hand by the time it returns.
  autoState: AutoDetectState;
  recording: boolean;
};

/**
 * The single entry point both the foreground screen and the background task
 * call for every incoming location update. Appends the sample (only while a
 * recording is active), evaluates the auto-start/auto-stop thresholds using
 * persisted timing state (so foreground and background updates share one
 * continuous countdown, never two independent ones), and reports back
 * whether this update just triggered a start or a stop.
 *
 * Does NOT itself flip KEY_RECORDING_ACTIVE for a 'started' result — the
 * caller (InFlight screen) owns starting, since only the foreground screen
 * can be the one to actually kick off recording. This function DOES flip it
 * for 'stopped', since auto-stop must be able to fully complete even if
 * nothing foreground ever sees it happen.
 */
export async function processLocationUpdate(
  speedKt: number,
  sample: FlightSample,
  autoDetectEnabled: boolean,
): Promise<ProcessResult> {
  const recording = await isRecordingActive();

  if (!autoDetectEnabled) {
    const emptyState = { fastSince: null, slowSince: null, fastBlipSince: null };
    if (recording) {
      const samples = await appendSample(sample);
      return { samples, action: null, autoState: emptyState, recording };
    }
    return { samples: await getSamples(), action: null, autoState: emptyState, recording };
  }

  const now = sample.t;
  const state = await getAutoState();

  if (!recording) {
    if (speedKt >= AUTO_START_KT) {
      if (state.fastSince == null) state.fastSince = now;
      const elapsed = now - state.fastSince;
      if (elapsed >= AUTO_START_MS) {
        const cleared = { fastSince: null, slowSince: null, fastBlipSince: null };
        await setAutoState(cleared);
        return { samples: [], action: 'started', autoState: cleared, recording: false };
      }
      await setAutoState(state);
    } else if (state.fastSince != null) {
      state.fastSince = null;
      await setAutoState(state);
    }
    return { samples: [], action: null, autoState: state, recording: false };
  }

  // Currently recording: always append the sample first, then evaluate stop.
  const samples = await appendSample(sample);

  if (speedKt < AUTO_STOP_KT) {
    state.fastBlipSince = null;
    if (state.slowSince == null) state.slowSince = now;
    const elapsed = now - state.slowSince;
    if (elapsed >= AUTO_STOP_MS) {
      await storage.setItem(KEY_RECORDING_ACTIVE, false);
      await storage.setItem(KEY_PENDING_STOPPED, true);
      const cleared = { fastSince: null, slowSince: null, fastBlipSince: null };
      await setAutoState(cleared);
      return { samples, action: 'stopped', autoState: cleared, recording: false };
    }
    await setAutoState(state);
  } else if (state.slowSince != null) {
    if (state.fastBlipSince == null) state.fastBlipSince = now;
    const fastElapsed = now - state.fastBlipSince;
    if (fastElapsed >= AUTO_STOP_RESET_GRACE_MS) {
      state.slowSince = null;
      state.fastBlipSince = null;
    }
    await setAutoState(state);
  }

  return { samples, action: null, autoState: state, recording: true };
}
