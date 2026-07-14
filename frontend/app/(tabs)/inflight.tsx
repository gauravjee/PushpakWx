import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, spacing, radius } from '@/src/theme';
import { CompassRose } from '@/src/components/CompassRose';
import { usePrefs } from '@/src/context/PrefsContext';
import { convertWind, convertAlt, windUnitLabel, altUnitLabel } from '@/src/utils/weather';

type Sample = { t: number; altFt: number; speedKt: number };

export default function InFlight() {
  const { prefs } = usePrefs();
  const [permStatus, setPermStatus] = useState<'undetermined' | 'granted' | 'denied' | 'checking'>('checking');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [loc, setLoc] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [samples, setSamples] = useState<Sample[]>([]);
  const locSubRef = useRef<Location.LocationSubscription | null>(null);
  const hdgSubRef = useRef<Location.LocationSubscription | null>(null);

  // Check current permission on mount
  useEffect(() => {
    (async () => {
      const p = await Location.getForegroundPermissionsAsync();
      setCanAskAgain(p.canAskAgain);
      if (p.status === 'granted') {
        setPermStatus('granted');
        setPrePermission(false);
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
            setSamples(prev => {
              const next = [...prev, { t: now, altFt, speedKt }];
              // Keep last 5 minutes
              const cutoff = now - 5 * 60 * 1000;
              return next.filter(s => s.t >= cutoff).slice(-300);
            });
          },
        );
        hdgSubRef.current = await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          const val = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (val >= 0) setHeading(val);
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

  const requestPermission = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    setCanAskAgain(p.canAskAgain);
    if (p.status === 'granted') {
      setPermStatus('granted');
      setPrePermission(false);
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
          <View style={styles.liveDot} />
        </View>

        {/* Compass */}
        <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
          <CompassRose heading={heading} size={260} />
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

        {/* Track log */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TRACK LOG · LAST 5 MIN</Text>
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
    </SafeAreaView>
  );
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
