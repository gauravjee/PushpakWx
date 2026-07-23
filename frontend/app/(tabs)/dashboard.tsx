import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Image } from 'expo-image';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { spacing, radius, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { api, Airport } from '@/src/api/client';
import { usePrefs } from '@/src/context/PrefsContext';
import {
  computeFlightCategory, estimateCeilingFt, categoryColor, categoryLabel,
  convertWind, windUnitLabel, convertTemp, tempUnitLabel, convertAlt, altUnitLabel,
  weatherCodeInfo,
} from '@/src/utils/weather';
import { FlightConditionBadge } from '@/src/components/FlightConditionBadge';
import { WindRose } from '@/src/components/WindRose';
import { HourlyStrip } from '@/src/components/HourlyStrip';
import { WindComponentCalc } from '@/src/components/WindComponentCalc';

type LocationInfo = {
  label: string;
  sub: string;
  lat: number;
  lon: number;
  icao?: string | null;
  elevation_ft?: number | null;
  isFavorite?: boolean;
  favoriteId?: string | null;
  airport?: Airport | null;
};

export default function Dashboard() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ lat?: string; lon?: string; label?: string; sub?: string; icao?: string; elevation?: string }>();
  const { prefs } = usePrefs();
  const router = useRouter();
  const [loc, setLoc] = useState<LocationInfo | null>(null);
  const [wx, setWx] = useState<any>(null);
  const [metar, setMetar] = useState<any>(null);
  const [taf, setTaf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingFav, setSavingFav] = useState(false);

  const loadForLocation = useCallback(async (info: LocationInfo) => {
    setError(null);
    setLoc(info);
    setMetar(null);
    setTaf(null);
    try {
      const data = await api.forecast(info.lat, info.lon);
      setWx(data);
      // Check if favorite
      try {
        const favs = await api.listFavorites();
        const match = favs.find(f => (info.icao && f.icao === info.icao) || (Math.abs(f.lat - info.lat) < 0.01 && Math.abs(f.lon - info.lon) < 0.01));
        if (match) setLoc(prev => prev ? { ...prev, isFavorite: true, favoriteId: match.id } : prev);
      } catch {}
      // Fetch METAR/TAF if we have an ICAO
      if (info.icao) {
        try {
          const [m, t] = await Promise.all([api.getMetar(info.icao), api.getTaf(info.icao)]);
          setMetar(m);
          setTaf(t);
        } catch {}
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load weather');
    }
  }, []);

  const initGPS = useCallback(async () => {
    try {
      // Only use GPS if permission has ALREADY been granted (don't prompt on WX tab).
      // Permission is requested contextually inside the InFlight tab.
      const p = await Location.getForegroundPermissionsAsync();
      if (p.status !== 'granted') {
        await loadForLocation({ label: 'KJFK', sub: 'John F Kennedy Intl · New York', lat: 40.6413, lon: -73.7781, icao: 'KJFK', elevation_ft: 13 });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      // Reverse geocode
      let label = 'Current Location';
      let sub = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      try {
        const rev = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (rev.length) {
          label = rev[0].city || rev[0].region || label;
          sub = [rev[0].region, rev[0].country].filter(Boolean).join(', ') || sub;
        }
      } catch {}
      await loadForLocation({ label, sub, lat: latitude, lon: longitude });
    } catch {
      await loadForLocation({ label: 'KJFK', sub: 'Fallback · New York', lat: 40.6413, lon: -73.7781, icao: 'KJFK', elevation_ft: 13 });
    }
  }, [loadForLocation]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (params.lat && params.lon) {
        await loadForLocation({
          label: (params.label as string) || 'Location',
          sub: (params.sub as string) || '',
          lat: parseFloat(params.lat as string),
          lon: parseFloat(params.lon as string),
          icao: (params.icao as string) || null,
          elevation_ft: params.elevation ? parseInt(params.elevation as string) : null,
        });
      } else {
        await initGPS();
      }
      setLoading(false);
    })();
  }, [params.lat, params.lon, params.label, params.sub, params.icao, params.elevation, initGPS, loadForLocation]);

  // When user returns to WX tab with no airport param, re-check GPS silently
  // (in case they just granted permission via InFlight tab).
  useFocusEffect(
    useCallback(() => {
      if (params.lat || params.lon) return;
      if (!loc || loc.icao === 'KJFK') {
        // Only re-check if we're on fallback or not yet loaded
        (async () => {
          const p = await Location.getForegroundPermissionsAsync();
          if (p.status === 'granted') {
            await initGPS();
          }
        })();
      }
    }, [params.lat, params.lon, loc, initGPS])
  );

  const onRefresh = async () => {
    if (!loc) return;
    setRefreshing(true);
    await loadForLocation(loc);
    setRefreshing(false);
  };

  const toggleFavorite = async () => {
    if (!loc || savingFav) return;
    setSavingFav(true);
    try {
      if (loc.isFavorite && loc.favoriteId) {
        await api.removeFavorite(loc.favoriteId);
        setLoc({ ...loc, isFavorite: false, favoriteId: null });
      } else {
        const fav = await api.addFavorite({
          icao: loc.icao || null,
          iata: null,
          name: loc.label,
          city: loc.sub,
          country: null,
          lat: loc.lat,
          lon: loc.lon,
          elevation_ft: loc.elevation_ft || null,
        });
        setLoc({ ...loc, isFavorite: true, favoriteId: fav.id });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save');
    } finally {
      setSavingFav(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center} testID="dashboard-loading">
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.muted}>Loading forecast...</Text>
      </SafeAreaView>
    );
  }

  if (error || !wx || !loc) {
    return (
      <SafeAreaView style={styles.center} testID="dashboard-error">
        <Ionicons name="warning-outline" size={40} color={colors.error} />
        <Text style={styles.errTitle}>Weather unavailable</Text>
        <Text style={styles.muted}>{error || 'No data'}</Text>
        <Pressable onPress={onRefresh} style={styles.retryBtn}>
          <Text style={styles.retryText}>RETRY</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Build current weather derived values
  const current = wx.current;
  const windKt = current.wind_speed_10m as number;
  const windDir = current.wind_direction_10m as number;
  const gustKt = current.wind_gusts_10m as number;
  const tempC = current.temperature_2m as number;
  const cloud = current.cloud_cover as number;
  const precip = current.precipitation as number;
  const wcode = current.weather_code as number;
  const wxInfo = weatherCodeInfo(wcode);

  // Hourly (next 24)
  const hourly = wx.hourly;
  const nowIdx = Math.max(0, hourly.time.findIndex((t: string) => new Date(t).getTime() >= Date.now() - 3600 * 1000));
  const hours = Array.from({ length: 24 }).map((_, i) => {
    const idx = nowIdx + i;
    return {
      time: hourly.time[idx],
      temp: hourly.temperature_2m[idx],
      wind: hourly.wind_speed_10m[idx],
      windDir: hourly.wind_direction_10m[idx],
      gust: hourly.wind_gusts_10m[idx],
      weatherCode: hourly.weather_code[idx],
      precip: hourly.precipitation[idx],
      cloud: hourly.cloud_cover[idx],
    };
  }).filter(h => h.time);

  // Ceiling estimation from current cloud layers
  const ceilingFt = estimateCeilingFt(
    current.cloud_cover_low ?? cloud,
    current.cloud_cover_mid ?? 0,
    current.cloud_cover_high ?? 0,
  );
  const visM = current.visibility ?? null;
  const category = computeFlightCategory(visM, ceilingFt);

  // Storm alert: any thunderstorm in next 12 hours
  const stormHours = hours.slice(0, 12).filter(h => h.weatherCode >= 95);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']} testID="dashboard-screen">
      <Image
        source={require('../../assets/images/icon.png')}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 440,
          height: 440,
          marginLeft: -220,
          marginTop: -220,
          opacity: 0.05,
        }}
        contentFit="contain"
        pointerEvents="none"
        testID="dashboard-watermark"
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.locLabel} numberOfLines={1}>{loc.label}</Text>
            <Text style={styles.locSub} numberOfLines={1}>{loc.sub || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`}</Text>
          </View>
          <Pressable
            testID="use-gps-button"
            onPress={async () => {
              setLoading(true);
              try {
                let p = await Location.getForegroundPermissionsAsync();
                if (p.status !== 'granted') {
                  p = await Location.requestForegroundPermissionsAsync();
                }
                if (p.status === 'granted') {
                  await initGPS();
                }
              } finally {
                setLoading(false);
              }
            }}
            style={styles.gpsBtn}
          >
            <Ionicons name="locate" size={18} color={colors.brand} />
          </Pressable>
          <Pressable onPress={() => router.push('/route')} style={styles.routeBtn} testID="open-route-button">
            <Ionicons name="map-outline" size={14} color={colors.brand} />
            <Text style={styles.routeBtnText}>ROUTE</Text>
          </Pressable>
          <Pressable onPress={toggleFavorite} style={styles.favBtn} testID="fav-toggle-button">
            <Ionicons
              name={loc.isFavorite ? 'star' : 'star-outline'}
              size={20}
              color={loc.isFavorite ? colors.brand : colors.onSurfaceSecondary}
            />
          </Pressable>
        </View>

        {/* Flight condition summary card */}
        <View style={styles.condCard} testID="flight-condition-card">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.condLabel}>FLIGHT CONDITION</Text>
              <FlightConditionBadge category={category} size="lg" />
              <Text style={[styles.condDesc, { color: categoryColor(category) }]}>{categoryLabel(category)}</Text>
            </View>
            <View style={styles.condRight}>
              <Ionicons name={wxInfo.icon as any} size={36} color={colors.brand} />
              <Text style={styles.wxLabel}>{wxInfo.label}</Text>
            </View>
          </View>
          <View style={styles.metricsRow}>
            <Metric label="CEILING" value={ceilingFt ? `${Math.round(convertAlt(ceilingFt, prefs.altitude_unit))} ${altUnitLabel(prefs.altitude_unit)}` : 'CLR'} />
            <Metric label="VISIBILITY" value={visM ? `${(visM / 1609).toFixed(1)} SM` : '10+ SM'} />
            <Metric label="TEMP" value={`${Math.round(convertTemp(tempC, prefs.temp_unit))}${tempUnitLabel(prefs.temp_unit)}`} />
          </View>
        </View>

        {/* Storm alert */}
        {stormHours.length > 0 && (
          <View style={styles.alertCard} testID="storm-alert-card">
            <Ionicons name="thunderstorm" size={22} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>THUNDERSTORM ALERT</Text>
              <Text style={styles.alertText}>
                {stormHours.length} thunderstorm hour{stormHours.length > 1 ? 's' : ''} forecast in the next 12h.
                First at {new Date(stormHours[0].time).getHours().toString().padStart(2, '0')}:00.
              </Text>
            </View>
          </View>
        )}

        {/* Official METAR/TAF */}
        {loc.icao && (metar || taf) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OFFICIAL WX · METAR / TAF</Text>
            {metar?.available ? (
              <View style={styles.metarCard} testID="metar-card">
                <View style={styles.metarHeader}>
                  <Text style={styles.metarLabel}>METAR</Text>
                  {metar.flight_category ? (
                    <FlightConditionBadge category={metar.flight_category as any} size="sm" />
                  ) : null}
                  {metar.observation_time ? (
                    <Text style={styles.metarTime}>
                      {new Date(metar.observation_time).toUTCString().slice(17, 22)}Z
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.rawText} selectable testID="metar-raw">{metar.raw}</Text>
              </View>
            ) : (
              <View style={styles.metarCard}>
                <Text style={styles.metarLabel}>METAR</Text>
                <Text style={styles.metarUnavail}>Not available for {loc.icao}</Text>
              </View>
            )}
            {taf?.available ? (
              <View style={[styles.metarCard, { marginTop: spacing.sm }]} testID="taf-card">
                <View style={styles.metarHeader}>
                  <Text style={styles.metarLabel}>TAF</Text>
                  {taf.issue_time ? (
                    <Text style={styles.metarTime}>
                      {new Date(taf.issue_time).toUTCString().slice(17, 22)}Z
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.rawText} selectable testID="taf-raw">{taf.raw}</Text>
              </View>
            ) : (
              <View style={[styles.metarCard, { marginTop: spacing.sm }]}>
                <Text style={styles.metarLabel}>TAF</Text>
                <Text style={styles.metarUnavail}>Not available for {loc.icao}</Text>
              </View>
            )}
          </View>
        )}

        {/* Wind rose */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WIND</Text>
          <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
            <WindRose
              direction={windDir}
              speed={convertWind(windKt, prefs.wind_unit)}
              gust={gustKt > windKt + 3 ? convertWind(gustKt, prefs.wind_unit) : null}
              unitLabel={windUnitLabel(prefs.wind_unit)}
              size={230}
            />
          </View>
        </View>

        {/* Runway wind component calculator */}
        <View style={{ marginTop: spacing.md }}>
          <WindComponentCalc
            windDirDeg={windDir}
            windSpeedKt={windKt}
            gustKt={gustKt}
            unit={prefs.wind_unit}
            icao={loc?.icao}
          />
        </View>

        {/* Hourly forecast */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HOURLY · NEXT 24H</Text>
          <HourlyStrip hours={hours} prefs={prefs} />
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DETAILS</Text>
          <View style={styles.detailGrid}>
            <DetailItem icon="cloud-outline" label="Cloud Cover" value={`${Math.round(cloud)}%`} />
            <DetailItem icon="rainy-outline" label="Precip" value={`${precip.toFixed(1)} mm`} />
            <DetailItem icon="speedometer-outline" label="Pressure" value={`${Math.round(current.pressure_msl)} hPa`} />
            <DetailItem icon="water-outline" label="Humidity" value={`${Math.round(current.relative_humidity_2m)}%`} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function DetailItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.detailItem}>
      <Ionicons name={icon as any} size={18} color={colors.brand} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { color: colors.onSurfaceSecondary, fontSize: 13 },
  errTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '700', marginTop: 4 },
  retryBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  retryText: { color: '#000', fontWeight: '800', letterSpacing: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  locLabel: { color: colors.onSurface, fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  locSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  favBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: 19, borderWidth: 1, borderColor: colors.border },
  gpsBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: 19, borderWidth: 1, borderColor: colors.border },
  routeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  routeBtnText: { color: colors.brand, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  condCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  condLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 2, marginBottom: 6, fontWeight: '700' },
  condDesc: { fontSize: 13, marginTop: 8, fontWeight: '600' },
  condRight: { alignItems: 'center', gap: 4 },
  wxLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 0.5 },
  metricsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  metric: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: { color: colors.onSurfaceTertiary, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  metricValue: { color: colors.onSurface, fontSize: 16, fontWeight: '700' },
  alertCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: '#3A2A05',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  alertTitle: { color: colors.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  alertText: { color: colors.onSurface, fontSize: 12, marginTop: 2, lineHeight: 16 },
  section: { marginTop: spacing.xl },
  sectionTitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, paddingHorizontal: spacing.lg, marginBottom: spacing.sm, fontWeight: '700' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, gap: spacing.sm },
  detailItem: {
    width: '48%',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  detailLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1 },
  detailValue: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  metarCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  metarHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metarLabel: { color: colors.brand, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  metarTime: { color: colors.onSurfaceTertiary, fontSize: 10, marginLeft: 'auto', letterSpacing: 1 },
  metarUnavail: { color: colors.onSurfaceTertiary, fontSize: 11, fontStyle: 'italic' },
  rawText: { color: colors.onSurface, fontSize: 12, fontFamily: 'monospace', lineHeight: 18, letterSpacing: 0.5 },
});
