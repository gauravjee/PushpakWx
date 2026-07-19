import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Linking, Platform, Modal, TextInput, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { CompassRose } from '@/src/components/CompassRose';
import { FlightTrackMap, TrackSample } from '@/src/components/FlightTrackMap';
import { usePrefs } from '@/src/context/PrefsContext';
import { api } from '@/src/api/client';
import { convertWind, convertAlt, windUnitLabel, altUnitLabel } from '@/src/utils/weather';

type Sample = TrackSample;

// Retain samples for up to 2 hours (7200 samples at 1 Hz)
const TRACK_MAX_SAMPLES = 7200;
const TRACK_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export default function InFlight() {
  const { prefs } = usePrefs();
  const router = useRouter();
  const { width: winWidth } = useWindowDimensions();
  const compassSize = winWidth < 400 ? 220 : 260;
  const [permStatus, setPermStatus] = useState<'undetermined' | 'granted' | 'denied' | 'checking'>('checking');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [loc, setLoc] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordStartMs, setRecordStartMs] = useState<number | null>(null);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingSamples, setPendingSamples] = useState<Sample[]>([]);
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [pendingEnd, setPendingEnd] = useState<number | null>(null);
  const locSubRef = useRef<Location.LocationSubscription | null>(null);
  const hdgSubRef = useRef<Location.LocationSubscription | null>(null);
  const hdgRef = useRef<number>(0);
  const recordingRef = useRef(false);
  // Auto-detect state
  const fastSinceRef = useRef<number | null>(null); // ms when speed first crossed >= 30kt
  const slowSinceRef = useRef<number | null>(null); // ms when speed first dropped < 5kt
  const [autoCountdown, setAutoCountdown] = useState<{ kind: 'start' | 'stop'; secondsLeft: number } | null>(null);
  const autoCountdownRef = useRef<{ kind: 'start' | 'stop'; secondsLeft: number } | null>(null);
  useEffect(() => { autoCountdownRef.current = autoCountdown; }, [autoCountdown]);
  const autoEnabledRef = useRef(prefs.auto_detect_flight ?? true);
  useEffect(() => { autoEnabledRef.current = prefs.auto_detect_flight ?? true; }, [prefs.auto_detect_flight]);

  // Refs to functions used inside the location callback closure
  const startRecordingRef = useRef<() => void>(() => {});
  const stopRecordingRef = useRef<() => void>(() => {});

  // Check current permission on mount
  useEffect(() => {
    (async () => {
      const p = await Location.getForegroundPermissionsAsync();
      setCanAskAgain(p.canAskAgain);
      if (p.status === 'granted') {
        setPermStatus('granted');
      } else {
        setPermStatus(p.status === 'denied' ? 'denied' : 'undetermined');
      }
    })();
    return () => {
      locSubRef.current?.remove();
      hdgSubRef.current?.remove();
    };
  }, []);

  // Start watching once granted
  useEffect(() => {
    if (permStatus !== 'granted') return;
    let cancelled = false;
    (async () => {
      try {
        locSubRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (l) => {
            if (cancelled) return;
            setLoc(l);
            const altFt = l.coords.altitude != null ? l.coords.altitude * 3.281 : 0;
            const speedKt = l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed * 1.9438 : 0;
            const now = Date.now();

            // ----- Auto-detect flight start/stop -----
            const AUTO_START_KT = 30;
            const AUTO_START_MS = 15 * 1000;   // 15 seconds sustained fast
            const AUTO_STOP_KT = 5;
            const AUTO_STOP_MS = 2 * 60 * 1000; // 2 minutes sustained slow

            if (autoEnabledRef.current) {
              if (!recordingRef.current) {
                // Waiting to start: track sustained speed >= 30 kt
                if (speedKt >= AUTO_START_KT) {
                  if (fastSinceRef.current == null) fastSinceRef.current = now;
                  const elapsed = now - fastSinceRef.current;
                  const secondsLeft = Math.max(0, Math.ceil((AUTO_START_MS - elapsed) / 1000));
                  setAutoCountdown({ kind: 'start', secondsLeft });
                  if (elapsed >= AUTO_START_MS) {
                    fastSinceRef.current = null;
                    setAutoCountdown(null);
                    startRecordingRef.current();
                  }
                } else {
                  if (fastSinceRef.current != null) {
                    fastSinceRef.current = null;
                    setAutoCountdown(null);
                  }
                }
              } else {
                // Recording: track sustained speed < 5 kt
                if (speedKt < AUTO_STOP_KT) {
                  if (slowSinceRef.current == null) slowSinceRef.current = now;
                  const elapsed = now - slowSinceRef.current;
                  const secondsLeft = Math.max(0, Math.ceil((AUTO_STOP_MS - elapsed) / 1000));
                  setAutoCountdown({ kind: 'stop', secondsLeft });
                  if (elapsed >= AUTO_STOP_MS) {
                    slowSinceRef.current = null;
                    setAutoCountdown(null);
                    stopRecordingRef.current();
                  }
                } else {
                  if (slowSinceRef.current != null) {
                    slowSinceRef.current = null;
                    setAutoCountdown(null);
                  }
                }
              }
            } else if (autoCountdownRef.current != null) {
              setAutoCountdown(null);
              fastSinceRef.current = null;
              slowSinceRef.current = null;
            }
            // -----------------------------------------

            if (!recordingRef.current) return;
            setSamples(prev => {
              const currentHeading = hdgRef.current;
              const next = [...prev, {
                t: now,
                lat: l.coords.latitude,
                lon: l.coords.longitude,
                altFt,
                speedKt,
                heading: currentHeading,
              }];
              // Keep last 2 hours
              const cutoff = now - TRACK_MAX_AGE_MS;
              return next.filter(s => s.t >= cutoff).slice(-TRACK_MAX_SAMPLES);
            });
          },
        );
        hdgSubRef.current = Platform.OS === 'web' ? null : await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          const val = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (val >= 0) {
            setHeading(val);
            hdgRef.current = val;
          }
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      locSubRef.current?.remove();
      hdgSubRef.current?.remove();
      locSubRef.current = null;
      hdgSubRef.current = null;
    };
  }, [permStatus]);

  const startRecording = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSamples([]);
    setRecordStartMs(Date.now());
    setRecording(true);
    recordingRef.current = true;
    // Reset auto-detect timers
    fastSinceRef.current = null;
    slowSinceRef.current = null;
    setAutoCountdown(null);
  };

  const stopRecording = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setRecording(false);
    recordingRef.current = false;
    fastSinceRef.current = null;
    slowSinceRef.current = null;
    setAutoCountdown(null);
    const captured = samples;
    const start = recordStartMs;
    const end = Date.now();
    if (captured.length < 2 || !start) {
      Alert.alert('Flight too short', 'Not enough samples were captured to save this flight.');
      return;
    }
    setPendingSamples(captured);
    setPendingStart(start);
    setPendingEnd(end);
    setSaveNote('');
    setSaveModalVisible(true);
  };

  // Keep refs pointing at the latest functions so the location callback can call them
  useEffect(() => { startRecordingRef.current = startRecording; });
  useEffect(() => { stopRecordingRef.current = stopRecording; });

  const discardFlight = () => {
    setSaveModalVisible(false);
    setPendingSamples([]);
    setPendingStart(null);
    setPendingEnd(null);
  };

  const saveFlight = async () => {
    if (!pendingStart || !pendingEnd || pendingSamples.length < 2) return;
    setSaving(true);
    try {
      await api.createFlight({
        started_at: new Date(pendingStart).toISOString(),
        ended_at: new Date(pendingEnd).toISOString(),
        note: saveNote.trim() || undefined,
        samples: pendingSamples.map(s => ({
          t: s.t,
          lat: s.lat,
          lon: s.lon,
          alt_ft: s.altFt,
          speed_kt: s.speedKt,
          heading: s.heading ?? null,
        })),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSaveModalVisible(false);
      setPendingSamples([]);
      setPendingStart(null);
      setPendingEnd(null);
      // Navigate to logbook to show the newly saved flight
      router.push('/logbook');
    } catch (e: any) {
      Alert.alert('Save failed', e.message || 'Could not save flight');
    } finally {
      setSaving(false);
    }
  };

  const requestPermission = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    setCanAskAgain(p.canAskAgain);
    if (p.status === 'granted') {
      setPermStatus('granted');
    } else {
      setPermStatus('denied');
    }
  };

  if (permStatus === 'checking') {
    return (
      <SafeAreaView style={styles.center} edges={['top']} testID="inflight-loading">
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  if (permStatus !== 'granted') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']} testID="inflight-permission-screen">
        <View style={styles.permWrap}>
          <View style={styles.permIcon}>
            <Ionicons name="location-outline" size={48} color={colors.brand} />
          </View>
          <Text style={styles.permTitle}>Live flight data</Text>
          <Text style={styles.permText}>
            PushpakWX uses your device&apos;s GPS to display your{'\n'}
            <Text style={styles.hi}>current altitude, heading, and ground speed</Text>{'\n\n'}
            while airborne — updated live from the sensors already on your device.
          </Text>
          <View style={styles.permList}>
            <PermItem icon="airplane-outline" text="Live altitude & climb rate" />
            <PermItem icon="compass-outline" text="Magnetic heading (compass)" />
            <PermItem icon="speedometer-outline" text="Ground speed & GPS accuracy" />
          </View>

          {canAskAgain ? (
            <Pressable testID="grant-location-button" onPress={requestPermission} style={styles.grantBtn}>
              <Text style={styles.grantText}>ENABLE LOCATION</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.blockedText}>
                Location access is turned off. Open your device settings to enable it.
              </Text>
              <Pressable
                testID="open-settings-button"
                onPress={() => Linking.openSettings()}
                style={styles.grantBtn}
              >
                <Text style={styles.grantText}>OPEN SETTINGS</Text>
              </Pressable>
            </>
          )}
          <Text style={styles.disclaim}>
            Not for primary flight navigation. GPS altitude ≠ pressure altitude.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Compute display values
  const altFt = loc?.coords.altitude != null ? loc.coords.altitude * 3.281 : null;
  const altAccFt = loc?.coords.altitudeAccuracy != null ? loc.coords.altitudeAccuracy * 3.281 : null;
  const speedKt = loc?.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed * 1.9438 : 0;
  const posAcc = loc?.coords.accuracy ?? null;

  // Climb rate (fpm) — diff of last two samples
  let climbFpm: number | null = null;
  if (samples.length >= 2) {
    const a = samples[samples.length - 2];
    const b = samples[samples.length - 1];
    const dtMin = (b.t - a.t) / 60000;
    if (dtMin > 0) climbFpm = (b.altFt - a.altFt) / dtMin;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']} testID="inflight-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={styles.header}>
          <Text style={styles.title}>INFLIGHT</Text>
          {recording ? (
            <View style={styles.recDot}>
              <View style={[styles.dotInner, { backgroundColor: colors.error }]} />
              <Text style={styles.recText}>REC</Text>
            </View>
          ) : (
            <View style={styles.liveDot} />
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            testID="open-logbook-button"
            onPress={() => router.push('/logbook')}
            style={styles.logbookBtn}
          >
            <Ionicons name="book-outline" size={14} color={colors.brand} />
            <Text style={styles.logbookBtnText}>LOGBOOK</Text>
          </Pressable>
        </View>

        {/* Record button */}
        <View style={styles.recordWrap}>
          {!recording ? (
            <Pressable
              testID="start-flight-button"
              onPress={startRecording}
              style={({ pressed }) => [styles.recordStartBtn, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.recordStartInner} />
              <Text style={styles.recordStartText}>START FLIGHT</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="stop-flight-button"
              onPress={stopRecording}
              style={({ pressed }) => [styles.recordStopBtn, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.recordStopInner} />
              <Text style={styles.recordStopText}>STOP & SAVE FLIGHT</Text>
            </Pressable>
          )}
          {recording && recordStartMs != null && (
            <Text style={styles.recordElapsed}>
              Recording · {formatElapsed(Date.now() - recordStartMs)} · {samples.length} samples
            </Text>
          )}
          {(prefs.auto_detect_flight ?? true) && (
            <View style={styles.autoArm} testID="auto-detect-badge">
              <Ionicons name="flash-outline" size={11} color={colors.brand} />
              <Text style={styles.autoArmText}>
                {autoCountdown
                  ? autoCountdown.kind === 'start'
                    ? `AUTO-STARTING IN ${autoCountdown.secondsLeft}s`
                    : `AUTO-STOPPING IN ${formatCountdown(autoCountdown.secondsLeft)}`
                  : recording
                    ? 'AUTO-STOP ARMED · SPEED < 5 KT FOR 2 MIN'
                    : 'AUTO-START ARMED · SPEED ≥ 30 KT FOR 15 S'}
              </Text>
            </View>
          )}
        </View>

        {/* Compass */}
        <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
          <CompassRose heading={heading} size={compassSize} />
        </View>

        {/* Big metrics */}
        <View style={styles.metricGrid}>
          <BigMetric
            testID="metric-altitude"
            icon="airplane-outline"
            label="ALTITUDE"
            value={altFt != null ? Math.round(convertAlt(altFt, prefs.altitude_unit)).toString() : '—'}
            unit={altUnitLabel(prefs.altitude_unit)}
            hint={altAccFt != null ? `±${Math.round(convertAlt(altAccFt, prefs.altitude_unit))}` : ''}
          />
          <BigMetric
            testID="metric-speed"
            icon="speedometer-outline"
            label="GROUND SPEED"
            value={Math.round(convertWind(speedKt, prefs.wind_unit)).toString()}
            unit={windUnitLabel(prefs.wind_unit)}
            hint=""
          />
        </View>
        <View style={styles.metricGrid}>
          <BigMetric
            testID="metric-climb"
            icon={climbFpm != null && climbFpm < -50 ? 'arrow-down' : 'arrow-up'}
            label="CLIMB"
            value={climbFpm != null ? `${climbFpm >= 0 ? '+' : ''}${Math.round(climbFpm)}` : '—'}
            unit="fpm"
            hint=""
            accent={climbFpm != null && climbFpm < -100 ? colors.warning : climbFpm != null && climbFpm > 100 ? colors.success : undefined}
          />
          <BigMetric
            testID="metric-gps"
            icon="location-outline"
            label="GPS ACC"
            value={posAcc != null ? `±${Math.round(posAcc)}` : '—'}
            unit="m"
            hint={posAcc != null && posAcc < 15 ? 'STRONG' : posAcc != null && posAcc < 40 ? 'GOOD' : 'WEAK'}
          />
        </View>

        {/* Flight track map */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>FLIGHT TRACK · UP TO 2H</Text>
            <Text style={styles.sectionSub}>{samples.length}/{TRACK_MAX_SAMPLES}</Text>
          </View>
          <FlightTrackMap samples={samples} height={240} />
        </View>

        {/* Track log */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>ALT / SPEED HISTORY</Text>
            <Text style={styles.sectionSub}>{samples.length} samples</Text>
          </View>
          <TrackLog samples={samples} prefs={prefs} />
        </View>

        {/* Coords */}
        {loc && (
          <View style={styles.coordsRow} testID="coords-row">
            <Text style={styles.coordsLabel}>POS</Text>
            <Text style={styles.coordsValue}>
              {loc.coords.latitude.toFixed(5)}, {loc.coords.longitude.toFixed(5)}
            </Text>
          </View>
        )}

        <Text style={styles.disclaimSmall}>
          Not for primary flight navigation. Use certified avionics.
        </Text>
      </ScrollView>

      {/* Save flight modal */}
      <Modal
        visible={saveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={discardFlight}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="save-flight-modal">
            <View style={styles.modalIcon}>
              <Ionicons name="airplane" size={30} color={colors.brand} />
            </View>
            <Text style={styles.modalTitle}>Save this flight?</Text>
            {pendingStart != null && pendingEnd != null ? (
              <View style={styles.modalStats}>
                <View style={styles.modalStat}>
                  <Text style={styles.modalStatLabel}>DURATION</Text>
                  <Text style={styles.modalStatValue}>{formatElapsed(pendingEnd - pendingStart)}</Text>
                </View>
                <View style={styles.modalStat}>
                  <Text style={styles.modalStatLabel}>SAMPLES</Text>
                  <Text style={styles.modalStatValue}>{pendingSamples.length}</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              testID="save-flight-note-input"
              value={saveNote}
              onChangeText={setSaveNote}
              placeholder="e.g. Solo XC to KHPN"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.modalInput}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                testID="discard-flight-button"
                onPress={discardFlight}
                style={[styles.modalBtn, styles.modalBtnCancel]}
                disabled={saving}
              >
                <Text style={styles.modalBtnCancelText}>DISCARD</Text>
              </Pressable>
              <Pressable
                testID="confirm-save-flight-button"
                onPress={saveFlight}
                style={[styles.modalBtn, styles.modalBtnPrimary, saving && { opacity: 0.7 }]}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.modalBtnPrimaryText}>SAVE</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function BigMetric({
  icon, label, value, unit, hint, accent, testID,
}: {
  icon: string; label: string; value: string; unit: string; hint?: string; accent?: string; testID?: string;
}) {
  return (
    <View style={styles.metricCard} testID={testID}>
      <View style={styles.metricHead}>
        <Ionicons name={icon as any} size={14} color={accent || colors.brand} />
        <Text style={[styles.metricLabel, accent && { color: accent }]}>{label}</Text>
      </View>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, accent && { color: accent }]}>{value}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function TrackLog({ samples, prefs }: { samples: Sample[]; prefs: any }) {
  if (samples.length < 2) {
    return (
      <View style={styles.trackEmpty}>
        <Ionicons name="pulse-outline" size={20} color={colors.onSurfaceTertiary} />
        <Text style={styles.trackEmptyText}>Collecting data…</Text>
      </View>
    );
  }
  // Compute normalized paths
  const alts = samples.map(s => s.altFt);
  const spds = samples.map(s => s.speedKt);
  const minA = Math.min(...alts);
  const maxA = Math.max(...alts);
  const minS = Math.min(...spds);
  const maxS = Math.max(...spds);
  const width = 300;
  const height = 60;
  const norm = (v: number, mn: number, mx: number) => (mx - mn < 0.001 ? height / 2 : height - ((v - mn) / (mx - mn)) * (height - 4) - 2);
  const stepX = width / Math.max(1, samples.length - 1);

  return (
    <View style={styles.trackWrap}>
      <TrackChart
        label="ALT"
        color={colors.brand}
        samples={samples}
        currentValue={`${Math.round(convertAlt(samples[samples.length - 1].altFt, prefs.altitude_unit))} ${altUnitLabel(prefs.altitude_unit)}`}
        computeY={s => norm(s.altFt, minA, maxA)}
        width={width}
        height={height}
        stepX={stepX}
      />
      <TrackChart
        label="SPD"
        color={colors.info}
        samples={samples}
        currentValue={`${Math.round(convertWind(samples[samples.length - 1].speedKt, prefs.wind_unit))} ${windUnitLabel(prefs.wind_unit)}`}
        computeY={s => norm(s.speedKt, minS, maxS)}
        width={width}
        height={height}
        stepX={stepX}
      />
    </View>
  );
}

function TrackChart({
  label, color, samples, currentValue, computeY, width, height, stepX,
}: {
  label: string;
  color: string;
  samples: Sample[];
  currentValue: string;
  computeY: (s: Sample) => number;
  width: number;
  height: number;
  stepX: number;
}) {
  const bars = samples.length;
  return (
    <View style={styles.trackRow}>
      <View style={{ flex: 1 }}>
        <View style={styles.trackHead}>
          <Text style={[styles.trackLabel, { color }]}>{label}</Text>
          <Text style={styles.trackValue}>{currentValue}</Text>
        </View>
        <View style={{ height, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, overflow: 'hidden', position: 'relative' }}>
          {/* Bar-style sparkline using thin vertical lines */}
          {samples.map((s, i) => {
            const y = computeY(s);
            const x = i * stepX;
            const w = Math.max(1, stepX);
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: w,
                  height: height - y,
                  backgroundColor: color,
                  opacity: 0.7 + 0.3 * (i / Math.max(1, bars - 1)),
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function PermItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.permItem}>
      <Ionicons name={icon as any} size={16} color={colors.brand} />
      <Text style={styles.permItemText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  recDot: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(255,69,58,0.15)', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error },
  dotInner: { width: 8, height: 8, borderRadius: 4 },
  recText: { color: colors.error, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  logbookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    backgroundColor: colors.brandTertiary, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.brand,
  },
  logbookBtnText: { color: colors.brand, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  recordWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg, alignItems: 'center', gap: 8 },
  recordStartBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.error, paddingVertical: 14, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, alignSelf: 'stretch',
  },
  recordStartInner: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' },
  recordStartText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  recordStopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.surfaceSecondary, paddingVertical: 14, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, alignSelf: 'stretch',
    borderWidth: 2, borderColor: colors.error,
  },
  recordStopInner: { width: 14, height: 14, backgroundColor: colors.error },
  recordStopText: { color: colors.error, fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  recordElapsed: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1 },
  autoArm: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
    marginTop: 6,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  autoArmText: { color: colors.brand, fontSize: 10, fontWeight: '800', letterSpacing: 1, flexShrink: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.xl,
    width: '100%', maxWidth: 400,
    borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  modalIcon: {
    alignSelf: 'center', width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalStats: { flexDirection: 'row', gap: spacing.sm },
  modalStat: { flex: 1, backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', gap: 2 },
  modalStatLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  modalStatValue: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: spacing.sm },
  modalInput: {
    backgroundColor: colors.surfaceTertiary, color: colors.onSurface,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border, fontSize: 14,
  },
  modalBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalBtn: { flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  modalBtnCancelText: { color: colors.onSurface, fontWeight: '700', letterSpacing: 1, fontSize: 13 },
  modalBtnPrimary: { backgroundColor: colors.brand },
  modalBtnPrimaryText: { color: '#000', fontWeight: '800', letterSpacing: 1, fontSize: 13 },
  permWrap: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md, alignItems: 'center' },
  permIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  permTitle: { color: colors.onSurface, fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  permText: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  hi: { color: colors.brand, fontWeight: '700' },
  permList: { width: '100%', gap: spacing.sm, marginTop: spacing.md },
  permItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  permItemText: { color: colors.onSurface, fontSize: 13 },
  grantBtn: { marginTop: spacing.lg, backgroundColor: colors.brand, paddingHorizontal: spacing.xxxl, paddingVertical: 14, borderRadius: radius.md, alignSelf: 'stretch', alignItems: 'center' },
  grantText: { color: '#000', fontWeight: '800', letterSpacing: 2, fontSize: 14 },
  blockedText: { color: colors.warning, fontSize: 13, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
  disclaim: { color: colors.onSurfaceTertiary, fontSize: 11, textAlign: 'center', marginTop: spacing.md, fontStyle: 'italic' },
  disclaimSmall: { color: colors.onSurfaceTertiary, fontSize: 10, textAlign: 'center', marginTop: spacing.lg, fontStyle: 'italic', paddingHorizontal: spacing.xl },
  metricGrid: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.sm },
  metricCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  metricHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  metricValue: { color: colors.onSurface, fontSize: 28, fontWeight: '800' },
  metricUnit: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '600' },
  metricHint: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm },
  sectionTitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  sectionSub: { color: colors.onSurfaceTertiary, fontSize: 10 },
  trackWrap: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trackHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  trackLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  trackValue: { color: colors.onSurface, fontSize: 12, fontWeight: '700' },
  trackEmpty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  trackEmptyText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  coordsRow: {
    flexDirection: 'row', paddingHorizontal: spacing.lg, marginTop: spacing.lg,
    justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.lg,
    borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  coordsLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  coordsValue: { color: colors.onSurface, fontSize: 13, fontFamily: 'System', fontWeight: '600' },
});
