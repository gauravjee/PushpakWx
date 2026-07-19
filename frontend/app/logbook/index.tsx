import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { spacing, radius, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { api, FlightSummary } from '@/src/api/client';
import { usePrefs } from '@/src/context/PrefsContext';
import { convertAlt, altUnitLabel } from '@/src/utils/weather';

export default function Logbook() {  const colors = useThemeColors();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { prefs } = usePrefs();
  const [flights, setFlights] = useState<FlightSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listFlights();
      setFlights(list);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="logbook-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="logbook-back-button">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>LOGBOOK</Text>
          <Text style={styles.sub}>{flights.length} recorded flight{flights.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={flights}
          keyExtractor={f => f.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="airplane-outline" size={48} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>No flights logged yet</Text>
              <Text style={styles.emptyText}>
                Go to the InFlight tab, tap START FLIGHT before takeoff, and STOP after landing. Your flight will be saved here automatically.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable
              testID={`flight-card-${index}`}
              onPress={() => router.push(`/logbook/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceTertiary }]}
            >
              <View style={styles.leftAccent} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.routeRow}>
                  <Text style={styles.icao}>{item.dep_icao || '—'}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.onSurfaceSecondary} />
                  <Text style={styles.icao}>{item.arr_icao || '—'}</Text>
                  <Text style={styles.date}>{formatDate(item.started_at)}</Text>
                </View>
                {item.note ? <Text style={styles.note} numberOfLines={1}>{item.note}</Text> : null}
                <View style={styles.stats}>
                  <Stat label="DIST" value={`${Math.round(item.distance_nm)}`} unit="nm" />
                  <Stat label="TIME" value={formatDuration(item.duration_s)} unit="" />
                  <Stat label="ALT" value={`${Math.round(convertAlt(item.max_alt_ft, prefs.altitude_unit))}`} unit={altUnitLabel(prefs.altitude_unit)} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ' ' + m + 'm' : ''}`;
  return `${m}m`;
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.sm, marginTop: spacing.xxl },
  emptyTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: 'center', fontSize: 13, maxWidth: 300, lineHeight: 18 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: spacing.md, overflow: 'hidden',
  },
  leftAccent: { width: 3, alignSelf: 'stretch', backgroundColor: colors.brand, borderRadius: 2 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icao: { color: colors.brand, fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  date: { color: colors.onSurfaceTertiary, fontSize: 11, marginLeft: 'auto' },
  note: { color: colors.onSurface, fontSize: 12, marginTop: 2 },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surfaceTertiary, padding: 6, borderRadius: radius.sm, alignItems: 'center' },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 8, letterSpacing: 1, fontWeight: '700' },
  statValue: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  statUnit: { color: colors.onSurfaceSecondary, fontSize: 9 },
});
