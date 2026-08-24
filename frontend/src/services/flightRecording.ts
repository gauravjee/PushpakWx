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
import { resetLastGoodAltitude } from '@/src/utils/mslAltitude';
import { resetLastPosition } from '@/src/utils/derivedSpeed';

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
// Samples are stored in fixed-size chunks rather than one growing blob —
// each append only ever reads/rewrites its current, small chunk (bounded
// cost), never the entire flight's data. Rewriting one growing JSON blob
// on every single GPS update meant a multi-hour flight's later samples
// were each paying the cost of re-serializing everything recorded so far
// — real, avoidable overhead exactly during the part of a long flight
// where it matters most.
const KEY_SAMPLE_COUNT = 'flight_recording_sample_count';
const KEY_CHUNK_PREFIX = 'flight_recording_chunk_';
const CHUNK_SIZE = 100;
// Both watchers can independently deliver a sample for the same GPS
// moment — reject a new one if it lands within this window of the last
// one actually appended, since it's almost certainly the other watcher's
// copy of the same fix, not a genuinely new one.
//
// This window is the actual enforcement of that intent. Confirmed against
// a real Cessna 172 flight CSV: the foreground watchPositionAsync and the
// background startLocationUpdatesAsync task both run concurrently for as
// long as the app process is alive (not only once truly backgrounded, as
// previously assumed) and both requested the same 500ms/2Hz interval —
// Android's fused location provider delivered real, distinct fixes to
// both, landing 50-150ms apart in storage. A plain "not strictly newer
// than the last appended timestamp" check (what used to be here) doesn't
// catch this: two different fixes 50-150ms apart both have strictly
// increasing timestamps, so both passed, doubling sample density with
// near-duplicate points and corrupting the haversine-derived speed calc
// (which assumes consecutive samples are actually consecutive in time).
// 350ms sits comfortably under the requested 500ms interval, so genuine
// back-to-back samples from a single watcher are never rejected, while
// the observed 50-150ms cross-watcher duplicates are.
const MIN_SAMPLE_GAP_MS = 350;
const KEY_LAST_APPENDED_TIME = 'flight_recording_last_appended_time';
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

async function getChunkCount(): Promise<number> {
  const count = await storage.getItem<number>(KEY_SAMPLE_COUNT, 0);
  return Math.ceil((count ?? 0) / CHUNK_SIZE);
}

export async function getSampleCount(): Promise<number> {
  return (await storage.getItem<number>(KEY_SAMPLE_COUNT, 0)) ?? 0;
}

export async function getSamples(): Promise<FlightSample[]> {
  const chunkCount = await getChunkCount();
  const all: FlightSample[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const raw = await storage.getItem<string>(`${KEY_CHUNK_PREFIX}${i}`, '');
    if (!raw) continue;
    try {
      all.push(...(JSON.parse(raw) as FlightSample[]));
    } catch {
      // A corrupted single chunk shouldn't take down the whole flight's
      // data — skip it and keep assembling the rest.
    }
  }
  return all;
}

/**
 * Appends one sample to whichever chunk is currently open, creating a new
 * chunk once the current one fills up. Bounded, constant-size work per
 * call — reads/rewrites at most CHUNK_SIZE samples, never the full flight.
 * Deliberately does NOT return the updated full array — nothing that
 * calls this on every location update actually needs it (the foreground
 * screen maintains its own local display state instead; the one place
 * that genuinely needs the complete set, finalizing a stopped flight,
 * calls getSamples() directly, which is fine as a one-time read).
 */
// The foreground watcher and background task run concurrently by design
// (see startRecording in inflight.tsx) — meaning two location updates can
// genuinely arrive close enough together that their appendSample calls
// interleave at the same await points, both reading the same sample
// count before either has written back, and one silently overwriting the
// other's sample with the count only advancing once instead of twice.
// Serializing every append through this single promise chain means each
// call's full read-modify-write cycle completes before the next one
// starts, regardless of how close together they were triggered.
let appendQueue: Promise<void> = Promise.resolve();

async function appendSample(sample: FlightSample): Promise<void> {
  const run = appendQueue.then(() => appendSampleLocked(sample));
  // Swallow rejection on the queue itself so one failed append doesn't
  // permanently jam every append after it — the caller of THIS call still
  // sees any real error via the returned/awaited promise below.
  appendQueue = run.catch(() => {});
  return run;
}

async function appendSampleLocked(sample: FlightSample): Promise<void> {
  // Both watchers run concurrently by design, and nothing coordinates
  // between them — meaning the SAME underlying GPS moment can genuinely
  // get delivered to both, each independently appending its own sample.
  // Confirmed against real flight data: not just near-duplicates, but
  // samples from MINUTES earlier getting redelivered and re-appended
  // throughout an entire recording — a known Android behavior where a
  // background batch can overlap with one already processed. This
  // corrupts any distance/duration calculation that assumes consecutive
  // samples are actually consecutive in time (confirmed: a genuinely
  // local bike ride computed as 341nm, because repeatedly jumping back
  // to an earlier position and forward again adds real, artificial
  // distance each time).
  //
  // The robust fix is simple: samples must be strictly increasing in
  // time. Anything not newer than the last one actually appended — by
  // any amount, not just within a short window — is rejected outright.
  const lastTime = (await storage.getItem<number>(KEY_LAST_APPENDED_TIME, -1)) ?? -1;
  if (sample.t - lastTime < MIN_SAMPLE_GAP_MS) {
    return;
  }

  const count = (await storage.getItem<number>(KEY_SAMPLE_COUNT, 0)) ?? 0;
  const chunkIndex = Math.floor(count / CHUNK_SIZE);
  const positionInChunk = count % CHUNK_SIZE;
  const chunkKey = `${KEY_CHUNK_PREFIX}${chunkIndex}`;

  if (positionInChunk === 0) {
    await storage.setItem(chunkKey, JSON.stringify([sample]));
  } else {
    const raw = await storage.getItem<string>(chunkKey, '');
    let chunk: FlightSample[] = [];
    if (raw) {
      try {
        chunk = JSON.parse(raw) as FlightSample[];
      } catch {
        chunk = [];
      }
    }
    chunk.push(sample);
    await storage.setItem(chunkKey, JSON.stringify(chunk));
  }
  await storage.setItem(KEY_SAMPLE_COUNT, count + 1);
  await storage.setItem(KEY_LAST_APPENDED_TIME, sample.t);
}

async function removeAllChunks(): Promise<void> {
  const chunkCount = await getChunkCount();
  for (let i = 0; i < chunkCount; i++) {
    await storage.removeItem(`${KEY_CHUNK_PREFIX}${i}`);
  }
  await storage.removeItem(KEY_SAMPLE_COUNT);
  await storage.removeItem(KEY_LAST_APPENDED_TIME);
}

export async function beginRecording(startMs: number): Promise<void> {
  await storage.setItem(KEY_RECORDING_ACTIVE, true);
  await storage.setItem(KEY_RECORD_START_MS, startMs);
  await removeAllChunks();
  await setAutoState({ fastSince: null, slowSince: null, fastBlipSince: null, hasReachedFlightSpeed: false, warningNotified: false });
  await storage.setItem(KEY_PENDING_STOPPED, false);
  await resetLastGoodAltitude();
  await resetLastPosition();
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
  await removeAllChunks();
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
      await appendSample(sample);
      return { samples: [], action: null, autoState: emptyState, recording, shouldWarn: false };
    }
    return { samples: [], action: null, autoState: emptyState, recording, shouldWarn: false };
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
  await appendSample(sample);

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
      // The one case that genuinely needs the complete set — a one-time
      // read at the exact moment of stopping, not something happening on
      // every single update, so a full chunk-by-chunk read here is fine.
      const samples = await getSamples();
      return { samples, action: 'stopped', autoState: cleared, recording: false, shouldWarn: false };
    }
    let shouldWarn = false;
    if (!state.warningNotified && elapsed >= activeStopMs - STOP_WARNING_MS) {
      state.warningNotified = true;
      shouldWarn = true;
    }
    await setAutoState(state);
    return { samples: [], action: null, autoState: state, recording: true, shouldWarn };
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

  return { samples: [], action: null, autoState: state, recording: true, shouldWarn: false };
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
