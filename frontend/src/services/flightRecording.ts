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
  // Sticky for the whole recording session, once true — tracks whether this
  // flight has ever actually reached flying speed. Ground ops before that
  // point (walking out, run-up checks, taxi, holding for clearance) can
  // easily involve several minutes of near-zero speed that has nothing to
  // do with the flight being over, so a much more generous stop threshold
  // applies until real flight speed is reached at least once.
  hasReachedFlightSpeed: boolean;
  // True once the warning (popup + notification) has already fired for the
  // current stop countdown, so it fires exactly once per cycle rather than
  // on every single location update during the whole warning window.
  warningNotified: boolean;
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
// Applies only before flight speed has ever been reached this session —
// generous on purpose, since the only cost of not stopping here is a
// slightly longer sample file sitting through routine ground ops.
export const GROUND_STOP_MS = 30 * 60 * 1000;
// How far ahead of an actual stop the warning (in-app popup + notification)
// appears — shared by both the ground-phase and post-flight-speed
// countdowns, whichever is currently active.
export const STOP_WARNING_MS = 2 * 60 * 1000;
const AUTO_STOP_RESET_GRACE_MS = 10 * 1000;

async function getAutoState(): Promise<AutoDetectState> {
  const raw = await storage.getItem<string>(KEY_AUTO_STATE, '');
  if (!raw) return { fastSince: null, slowSince: null, fastBlipSince: null, hasReachedFlightSpeed: false, warningNotified: false };
  try {
    return JSON.parse(raw) as AutoDetectState;
  } catch {
    return { fastSince: null, slowSince: null, fastBlipSince: null, hasReachedFlightSpeed: false, warningNotified: false };
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
  await setAutoState({ fastSince: null, slowSince: null, fastBlipSince: null, hasReachedFlightSpeed: false, warningNotified: false });
  await storage.setItem(KEY_PENDING_STOPPED, false);
}

/**
 * Marks a flight as stopped WITHOUT clearing its pending sample data —
 * used by a manual stop (the button), as distinct from clearRecording()
 * which is only appropriate once the flight has actually been saved or
 * explicitly discarded. Without this, isRecordingActive() would still
 * report true for a manually-stopped flight sitting at the sign-up gate,
 * which made trySaveAnyPendingFlight() bail out immediately, treating a
 * genuinely-finished recording as if it were still in progress.
 */
export async function markRecordingStopped(): Promise<void> {
  await storage.setItem(KEY_RECORDING_ACTIVE, false);
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
  // True on exactly the one update where the countdown first crosses into
  // its final warning window — the caller's cue to fire a notification.
  // Deliberately edge-triggered, not level-triggered: without this, a
  // caller checking secondsLeft <= STOP_WARNING_MS on every single update
  // would re-fire a fresh notification roughly once a second for the
  // entire warning window.
  shouldWarn: boolean;
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
    const emptyState = { fastSince: null, slowSince: null, fastBlipSince: null, hasReachedFlightSpeed: false, warningNotified: false };
    if (recording) {
      const samples = await appendSample(sample);
      return { samples, action: null, autoState: emptyState, recording, shouldWarn: false };
    }
    return { samples: await getSamples(), action: null, autoState: emptyState, recording, shouldWarn: false };
  }

  const now = sample.t;
  const state = await getAutoState();

  if (!recording) {
    if (speedKt >= AUTO_START_KT) {
      if (state.fastSince == null) state.fastSince = now;
      const elapsed = now - state.fastSince;
      if (elapsed >= AUTO_START_MS) {
        const cleared = { fastSince: null, slowSince: null, fastBlipSince: null, hasReachedFlightSpeed: false, warningNotified: false };
        await setAutoState(cleared);
        return { samples: [], action: 'started', autoState: cleared, recording: false, shouldWarn: false };
      }
      await setAutoState(state);
    } else if (state.fastSince != null) {
      state.fastSince = null;
      await setAutoState(state);
    }
    return { samples: [], action: null, autoState: state, recording: false, shouldWarn: false };
  }

  // Currently recording: always append the sample first, then evaluate stop.
  const samples = await appendSample(sample);

  // Once flight speed is reached, that's sticky for the rest of the
  // session — a later ground hold shouldn't fall back to the generous
  // pre-flight threshold just because speed happens to be low again.
  if (!state.hasReachedFlightSpeed && speedKt >= AUTO_START_KT) {
    state.hasReachedFlightSpeed = true;
  }
  const activeStopMs = state.hasReachedFlightSpeed ? AUTO_STOP_MS : GROUND_STOP_MS;

  if (speedKt < AUTO_STOP_KT) {
    state.fastBlipSince = null;
    if (state.slowSince == null) state.slowSince = now;
    const elapsed = now - state.slowSince;
    if (elapsed >= activeStopMs) {
      await storage.setItem(KEY_RECORDING_ACTIVE, false);
      await storage.setItem(KEY_PENDING_STOPPED, true);
      const cleared = { fastSince: null, slowSince: null, fastBlipSince: null, hasReachedFlightSpeed: false, warningNotified: false };
      await setAutoState(cleared);
      return { samples, action: 'stopped', autoState: cleared, recording: false, shouldWarn: false };
    }
    let shouldWarn = false;
    if (!state.warningNotified && elapsed >= activeStopMs - STOP_WARNING_MS) {
      state.warningNotified = true;
      shouldWarn = true;
    }
    await setAutoState(state);
    return { samples, action: null, autoState: state, recording: true, shouldWarn };
  } else if (state.slowSince != null) {
    if (state.fastBlipSince == null) state.fastBlipSince = now;
    const fastElapsed = now - state.fastBlipSince;
    if (fastElapsed >= AUTO_STOP_RESET_GRACE_MS) {
      state.slowSince = null;
      state.fastBlipSince = null;
      // Genuine movement resumed — a later stop is a fresh cycle, so it
      // should be able to warn again rather than staying silenced forever.
      state.warningNotified = false;
    }
    await setAutoState(state);
  }

  return { samples, action: null, autoState: state, recording: true, shouldWarn: false };
}

/**
 * Manual override for the "recording will stop soon" popup's action button —
 * lets the pilot explicitly say "still here, keep going" rather than relying
 * only on GPS speed to prove it. Clears the stop countdown exactly as if
 * genuine movement had resumed, without touching hasReachedFlightSpeed
 * (that stays whatever it already was).
 */
export async function resetStopCountdown(): Promise<void> {
  const state = await getAutoState();
  state.slowSince = null;
  state.fastBlipSince = null;
  state.warningNotified = false;
  await setAutoState(state);
}

/**
 * Called right after someone completes email verification (the point a
 * real, valid session actually exists — registration alone doesn't grant
 * one). If a flight was recorded anonymously and left pending a sign-up
 * gate, this saves it immediately using the data already sitting in
 * storage — no second manual "tap Save again" step required. Safe to call
 * unconditionally on every successful verification; it's a no-op if
 * there's nothing pending.
 */
export async function trySaveAnyPendingFlight(): Promise<{ saved: boolean; flightId?: string }> {
  const recording = await isRecordingActive();
  if (recording) return { saved: false };
  const samples = await getSamples();
  const start = await getRecordStartMs();
  if (samples.length < 2 || !start) return { saved: false };
  try {
    // Imported lazily to avoid making this module depend on the API
    // client (and its own transitive imports) for the common case where
    // this function is called and there's nothing pending to save.
    const { api } = await import('@/src/api/client');
    const created = await api.createFlight({
      started_at: new Date(start).toISOString(),
      ended_at: new Date(samples[samples.length - 1].t).toISOString(),
      samples: samples.map(s => ({
        t: s.t, lat: s.lat, lon: s.lon,
        alt_ft: s.alt_ft ?? null, speed_kt: s.speed_kt ?? null, heading: s.heading ?? null,
      })),
    });
    await clearRecording();
    return { saved: true, flightId: created.id };
  } catch {
    return { saved: false };
  }
}
