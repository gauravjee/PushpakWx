import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, FlatList,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { spacing, radius, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { api, Airport } from '@/src/api/client';
import { usePrefs } from '@/src/context/PrefsContext';
import {
  computeFlightCategory, estimateCeilingFt, categoryColor,
  convertWind, windUnitLabel, convertTemp, tempUnitLabel,
  weatherCodeInfo, windDirLabel,
} from '@/src/utils/weather';
import { FlightConditionBadge } from '@/src/components/FlightConditionBadge';

type Waypoint = {
  key: string;
  role: 'DEP' | 'STOP' | 'DEST';
  airport: Airport | null;
  // aggregated data:
  cumMi?: number;
  legMi?: number;
  etaOffsetHrs?: number; // hours from now
  forecast?: WaypointForecast | null;
  metarCategory?: string | null;
  loading?: boolean;
};

type WaypointForecast = {
  time: string;
  temp: number;
  wind: number;
  windDir: number;
  gust: number;
  weatherCode: number;
  cloud: number;
  precip: number;
  ceilingFt: number | null;
  category: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNK';
};

function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const genKey = () => Math.random().toString(36).slice(2, 9);

export default function RouteScreen() {  const colors = useThemeColors();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { prefs } = usePrefs();
  const [waypoints, setWaypoints] = useState<Waypoint[]>([
    { key: genKey(), role: 'DEP', airport: null },
    { key: genKey(), role: 'DEST', airport: null },
  ]);
  const [cruiseKt, setCruiseKt] = useState('120');
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

  const setAirport = (key: string, airport: Airport) => {
    setWaypoints(prev => prev.map(w => (w.key === key ? { ...w, airport, forecast: undefined, metarCategory: undefined } : w)));
    setPickerFor(null);
  };

  const addStop = () => {
    setWaypoints(prev => {
      const destIdx = prev.findIndex(w => w.role === 'DEST');
      if (destIdx < 0) return prev;
      const next = [...prev];
      next.splice(destIdx, 0, { key: genKey(), role: 'STOP', airport: null });
      return next;
    });
  };

  const removeWaypoint = (key: string) => {
    setWaypoints(prev => {
      const target = prev.find(w => w.key === key);
      if (!target || target.role !== 'STOP') return prev;
      return prev.filter(w => w.key !== key);
    });
  };

  const compute = useCallback(async () => {
    const speed = parseFloat(cruiseKt) || 120;
    if (speed <= 0) return;

    // Compute leg distances
    let cumMi = 0;
    const withDistances: Waypoint[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const w = waypoints[i];
      let legMi = 0;
      if (i > 0 && waypoints[i].airport && waypoints[i - 1].airport) {
        legMi = haversineMi(
          waypoints[i - 1].airport!.lat, waypoints[i - 1].airport!.lon,
          waypoints[i].airport!.lat, waypoints[i].airport!.lon,
        );
      }
      cumMi += legMi;
      const etaOffsetHrs = cumMi / speed;
      withDistances.push({ ...w, legMi, cumMi, etaOffsetHrs, loading: !!w.airport });
    }
    setWaypoints(withDistances);
    setComputing(true);

    // Fetch weather for each waypoint with an airport
    const results = await Promise.all(withDistances.map(async (w) => {
      if (!w.airport) return { ...w, loading: false };
      try {
        const [wx, metar] = await Promise.all([
          api.forecast(w.airport.lat, w.airport.lon),
          w.airport.icao ? api.getMetar(w.airport.icao).catch(() => null) : Promise.resolve(null),
        ]);
        // Find hourly index closest to ETA
        const targetMs = Date.now() + (w.etaOffsetHrs || 0) * 3600 * 1000;
        const times: string[] = wx.hourly.time;
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < times.length; i++) {
          const diff = Math.abs(new Date(times[i]).getTime() - targetMs);
          if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
        }
        const cover = wx.hourly.cloud_cover[bestIdx];
        const low = wx.hourly.cloud_cover_low?.[bestIdx] ?? cover;
        const mid = wx.hourly.cloud_cover_mid?.[bestIdx] ?? 0;
        const high = wx.hourly.cloud_cover_high?.[bestIdx] ?? 0;
        const ceilingFt = estimateCeilingFt(low, mid, high);
        const visM = wx.hourly.visibility?.[bestIdx] ?? null;
        const category = computeFlightCategory(visM, ceilingFt);
        const forecast: WaypointForecast = {
          time: wx.hourly.time[bestIdx],
          temp: wx.hourly.temperature_2m[bestIdx],
          wind: wx.hourly.wind_speed_10m[bestIdx],
          windDir: wx.hourly.wind_direction_10m[bestIdx],
          gust: wx.hourly.wind_gusts_10m[bestIdx],
          weatherCode: wx.hourly.weather_code[bestIdx],
          cloud: cover,
          precip: wx.hourly.precipitation[bestIdx],
          ceilingFt,
          category,
        };
        return {
          ...w,
          loading: false,
          forecast,
          metarCategory: metar?.available ? metar.flight_category : null,
        };
      } catch {
        return { ...w, loading: false, forecast: null };
      }
    }));

    setWaypoints(results);
    setComputing(false);
  }, [cruiseKt, waypoints]);

  // Auto-compute when both endpoints have airports
  useEffect(() => {
    const allSet = waypoints.every(w => !!w.airport);
    if (allSet) compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints.map(w => w.airport?.icao || w.airport?.lat).join('|'), cruiseKt]);

  const totalMi = waypoints[waypoints.length - 1]?.cumMi || 0;
  const speed = parseFloat(cruiseKt) || 120;
  const totalHrs = totalMi / speed;

  const worstCategory = waypoints.reduce<string>((acc, w) => {
    const c = w.forecast?.category;
    if (!c) return acc;
    const order = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 } as any;
    if (!acc || (order[c] ?? 0) > (order[acc] ?? 0)) return c;
    return acc;
  }, '');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']} testID="route-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="route-back-button">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>ROUTE WX</Text>
          <Text style={styles.sub}>Consolidated weather along route</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Cruise speed */}
        <View style={styles.speedCard}>
          <Text style={styles.speedLabel}>CRUISE SPEED</Text>
          <View style={styles.speedRow}>
            <TextInput
              testID="cruise-speed-input"
              style={styles.speedInput}
              value={cruiseKt}
              onChangeText={t => setCruiseKt(t.replace(/[^0-9.]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder="120"
              placeholderTextColor={colors.onSurfaceTertiary}
            />
            <Text style={styles.speedUnit}>kt</Text>
          </View>
        </View>

        {/* Waypoints */}
        <View style={styles.wpList}>
          {waypoints.map((w, idx) => (
            <View key={w.key}>
              <WaypointCard
                index={idx}
                wp={w}
                onPick={() => setPickerFor(w.key)}
                onRemove={w.role === 'STOP' ? () => removeWaypoint(w.key) : undefined}
                prefs={prefs}
              />
              {idx === waypoints.length - 1 ? null : (
                <View style={styles.legLine}>
                  <View style={styles.legLineDot} />
                  <Text style={styles.legText}>
                    {waypoints[idx + 1].legMi ? `${Math.round(waypoints[idx + 1].legMi!)} nm` : '—'}
                    {waypoints[idx + 1].etaOffsetHrs != null && waypoints[idx].airport && waypoints[idx + 1].airport
                      ? `  ·  ETA +${formatHours((waypoints[idx + 1].etaOffsetHrs || 0) - (waypoints[idx].etaOffsetHrs || 0))}`
                      : ''}
                  </Text>
                  <View style={styles.legLineDot} />
                </View>
              )}
            </View>
          ))}
        </View>

        <Pressable onPress={addStop} style={styles.addStopBtn} testID="add-stop-button">
          <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
          <Text style={styles.addStopText}>ADD FUEL STOP</Text>
        </Pressable>

        {/* Summary */}
        {waypoints[0].airport && waypoints[waypoints.length - 1].airport && (
          <View style={styles.summaryCard} testID="route-summary-card">
            <View style={styles.summaryHead}>
              <Text style={styles.summaryTitle}>ROUTE SUMMARY</Text>
              {computing && <ActivityIndicator size="small" color={colors.brand} />}
            </View>
            <View style={styles.summaryGrid}>
              <SummaryItem label="TOTAL DIST" value={`${Math.round(totalMi)}`} unit="nm" />
              <SummaryItem label="FLIGHT TIME" value={formatHours(totalHrs)} unit="" />
              <SummaryItem
                label="WORST WX"
                value={worstCategory || '—'}
                unit=""
                accent={worstCategory ? categoryColor(worstCategory as any) : undefined}
              />
            </View>
          </View>
        )}

        <Text style={styles.disclaim}>
          Forecast at each waypoint is estimated at expected ETA using cruise speed & great-circle distance.
          Not for primary flight planning.
        </Text>
      </ScrollView>

      {/* Airport picker modal */}
      <AirportPickerModal
        visible={pickerFor != null}
        onClose={() => setPickerFor(null)}
        onPick={(a) => pickerFor && setAirport(pickerFor, a)}
      />
    </SafeAreaView>
  );
}

function formatHours(h: number): string {
  if (!isFinite(h) || h < 0) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  if (hh === 0) return `${mm}m`;
  return `${hh}h ${mm.toString().padStart(2, '0')}m`;
}

function WaypointCard({
  index, wp, onPick, onRemove, prefs,
}: {
  index: number;
  wp: Waypoint;
  onPick: () => void;
  onRemove?: () => void;
  prefs: any;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const badge = wp.role === 'DEP' ? 'DEP' : wp.role === 'DEST' ? 'DEST' : 'STOP';
  const badgeColor = wp.role === 'DEP' ? colors.success : wp.role === 'DEST' ? colors.error : colors.info;
  return (
    <View style={styles.wpCard} testID={`waypoint-${index}`}>
      <View style={styles.wpHead}>
        <View style={[styles.wpBadge, { borderColor: badgeColor }]}>
          <Text style={[styles.wpBadgeText, { color: badgeColor }]}>{badge}</Text>
        </View>
        {wp.airport ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.wpIcao}>{wp.airport.icao}{wp.airport.iata ? `  ·  ${wp.airport.iata}` : ''}</Text>
            <Text style={styles.wpName} numberOfLines={1}>{wp.airport.name}</Text>
          </View>
        ) : (
          <Pressable onPress={onPick} style={styles.pickBtn} testID={`pick-airport-${index}`}>
            <Ionicons name="search" size={14} color={colors.brand} />
            <Text style={styles.pickBtnText}>SELECT AIRPORT</Text>
          </Pressable>
        )}
        {wp.airport && (
          <Pressable onPress={onPick} style={styles.changeBtn} testID={`change-airport-${index}`}>
            <Ionicons name="swap-horizontal" size={14} color={colors.onSurfaceSecondary} />
          </Pressable>
        )}
        {onRemove && (
          <Pressable onPress={onRemove} style={styles.removeBtn} testID={`remove-waypoint-${index}`}>
            <Ionicons name="close" size={14} color={colors.onSurfaceSecondary} />
          </Pressable>
        )}
      </View>

      {wp.airport && wp.loading && (
        <View style={styles.wxRow}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.wxLoading}>Loading forecast…</Text>
        </View>
      )}

      {wp.airport && wp.forecast && !wp.loading && (
        <View style={styles.wxRow}>
          <FlightConditionBadge category={wp.forecast.category} size="sm" />
          <Ionicons name={weatherCodeInfo(wp.forecast.weatherCode).icon as any} size={18} color={colors.brand} />
          <Text style={styles.wxTemp}>{Math.round(convertTemp(wp.forecast.temp, prefs.temp_unit))}{tempUnitLabel(prefs.temp_unit)}</Text>
          <Text style={styles.wxWind}>
            {windDirLabel(wp.forecast.windDir)} {Math.round(convertWind(wp.forecast.wind, prefs.wind_unit))}
            {wp.forecast.gust > wp.forecast.wind + 3 ? `G${Math.round(convertWind(wp.forecast.gust, prefs.wind_unit))}` : ''}
            {' '}{windUnitLabel(prefs.wind_unit)}
          </Text>
        </View>
      )}

      {wp.metarCategory && (
        <View style={styles.metarRow}>
          <Text style={styles.metarLabel}>METAR NOW</Text>
          <FlightConditionBadge category={wp.metarCategory as any} size="sm" />
        </View>
      )}
    </View>
  );
}

function AirportPickerModal({
  visible, onClose, onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (a: Airport) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) { setQ(''); setResults([]); return; }
  }, [visible]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.searchAirports(q.trim());
        setResults(r.results);
      } catch {}
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <KeyboardAvoidingView
        style={styles.pickerOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.pickerSheet} testID="airport-picker">
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>SELECT AIRPORT</Text>
            <Pressable onPress={onClose} testID="picker-close-button">
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <View style={styles.pickerSearchBar}>
            <Ionicons name="search" size={16} color={colors.onSurfaceSecondary} />
            <TextInput
              testID="picker-search-input"
              style={styles.pickerInput}
              value={q}
              onChangeText={setQ}
              placeholder="ICAO / IATA / city"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="characters"
              autoFocus
            />
          </View>
          {loading ? (
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={a => a.icao}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
              ListEmptyComponent={
                <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
                  <Ionicons name="airplane-outline" size={36} color={colors.onSurfaceTertiary} />
                  <Text style={{ color: colors.onSurfaceSecondary, marginTop: 8, fontSize: 12 }}>
                    {q ? 'No airports found' : 'Search by ICAO, IATA or city'}
                  </Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <Pressable
                  testID={`picker-result-${index}`}
                  onPress={() => onPick(item)}
                  style={({ pressed }) => [styles.pickerRow, pressed && { backgroundColor: colors.surfaceTertiary }]}
                >
                  <Text style={styles.pickerIcao}>{item.icao}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.pickerSub} numberOfLines={1}>{[item.city, item.country].filter(Boolean).join(', ')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
                </Pressable>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SummaryItem({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryItemLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={[styles.summaryItemValue, accent && { color: accent }]}>{value}</Text>
        {unit ? <Text style={styles.summaryItemUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  speedCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  speedLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, fontWeight: '700', flexShrink: 1 },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  speedInput: {
    color: colors.brand, fontSize: 20, fontWeight: '800',
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    textAlign: 'center', width: 72,
  },
  speedUnit: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700' },
  wpList: { marginTop: spacing.md },
  wpCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  wpHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wpBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1 },
  wpBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  wpIcao: { color: colors.brand, fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  wpName: { color: colors.onSurface, fontSize: 12, marginTop: 2 },
  pickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 8, backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brand,
    borderStyle: 'dashed', justifyContent: 'center',
  },
  pickBtnText: { color: colors.brand, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  changeBtn: { padding: 6 },
  removeBtn: { padding: 6 },
  wxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  wxLoading: { color: colors.onSurfaceSecondary, fontSize: 11 },
  wxTemp: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  wxWind: { color: colors.onSurface, fontSize: 12 },
  metarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metarLabel: { color: colors.onSurfaceTertiary, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  legLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl + 4, paddingVertical: 6 },
  legLineDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },
  legText: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, flex: 1, textAlign: 'center' },
  addStopBtn: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brand, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  addStopText: { color: colors.brand, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  summaryCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { color: colors.brand, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  summaryGrid: { flexDirection: 'row', gap: spacing.sm },
  summaryItem: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
  summaryItemLabel: { color: colors.onSurfaceTertiary, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  summaryItemValue: { color: colors.onSurface, fontSize: 18, fontWeight: '800' },
  summaryItemUnit: { color: colors.onSurfaceSecondary, fontSize: 11 },
  disclaim: { color: colors.onSurfaceTertiary, fontSize: 10, textAlign: 'center', marginTop: spacing.lg, fontStyle: 'italic', paddingHorizontal: spacing.xl },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: colors.border,
    maxHeight: '80%', minHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  pickerTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  pickerSearchBar: {
    margin: spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  pickerInput: { flex: 1, color: colors.onSurface, paddingVertical: 12, fontSize: 15 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  pickerIcao: { color: colors.brand, fontSize: 14, fontWeight: '800', letterSpacing: 1, width: 56 },
  pickerName: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  pickerSub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
});
