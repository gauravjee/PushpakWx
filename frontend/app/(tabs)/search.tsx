import React, { useState, useEffect, useMemo} from 'react';
import { Image } from 'expo-image';
import {
  View, Text, StyleSheet, TextInput, FlatList, Pressable, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { spacing, radius, ColorPalette} from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { api, Airport } from '@/src/api/client';

type SearchMode = 'airport' | 'city';

export default function Search() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>('airport');
  const [q, setQ] = useState('');
  const [airports, setAirports] = useState<Airport[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setAirports([]);
      setCities([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        if (mode === 'airport') {
          const r = await api.searchAirports(q.trim());
          setAirports(r.results);
        } else {
          const r = await api.geocode(q.trim());
          setCities(r.results || []);
        }
      } catch {}
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, mode]);

  const goToLocation = (label: string, sub: string, lat: number, lon: number, icao?: string | null, elevation?: number | null) => {
    router.push({
      pathname: '/(tabs)/dashboard',
      params: {
        label,
        sub,
        lat: String(lat),
        lon: String(lon),
        icao: icao || undefined,
        elevation: elevation != null ? String(elevation) : undefined,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="search-screen">
      {/* Background logo watermark — see dashboard.tsx for the fuller comment. */}
      <Image
        source={require('../../assets/images/icon.png')}
        style={{ position: 'absolute', top: '50%', left: '50%', width: 640, height: 640, marginLeft: -320, marginTop: -320, opacity: 0.05 }}
        contentFit="contain"
        pointerEvents="none"
      />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>SEARCH</Text>
        <View style={styles.chipRow}>
          <Chip label="AIRPORT (ICAO/IATA)" active={mode === 'airport'} onPress={() => setMode('airport')} testID="mode-airport-chip" />
          <Chip label="CITY / PLACE" active={mode === 'city'} onPress={() => setMode('city')} testID="mode-city-chip" />
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
          <TextInput
            testID="search-input"
            style={styles.input}
            placeholder={mode === 'airport' ? 'e.g. KJFK, LAX, San Francisco' : 'e.g. Paris, Tokyo'}
            placeholderTextColor={colors.onSurfaceTertiary}
            value={q}
            onChangeText={setQ}
            autoCapitalize={mode === 'airport' ? 'characters' : 'sentences'}
            autoCorrect={false}
          />
          {q ? (
            <Pressable onPress={() => setQ('')}>
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : mode === 'airport' ? (
        <FlatList
          data={airports}
          keyExtractor={a => a.icao}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          ListEmptyComponent={
            <EmptyState
              q={q}
              text={q ? 'No airports found. Try a different code or city.' : 'Search airports by ICAO (KJFK), IATA (JFK), or city name.'}
            />
          }
          renderItem={({ item, index }) => (
            <Pressable
              testID={`airport-result-${index}`}
              onPress={() => goToLocation(item.icao, `${item.name} · ${item.city ?? ''}`, item.lat, item.lon, item.icao, item.elevation_ft ?? null)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={styles.icao}>{item.icao}</Text>
                  {item.iata ? <Text style={styles.iata}>{item.iata}</Text> : null}
                </View>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{[item.city, item.country].filter(Boolean).join(', ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={cities}
          keyExtractor={(c, i) => `${c.latitude}-${c.longitude}-${i}`}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          ListEmptyComponent={
            <EmptyState
              q={q}
              text={q ? 'No cities found.' : 'Search any city or place worldwide.'}
            />
          }
          renderItem={({ item, index }) => (
            <Pressable
              testID={`city-result-${index}`}
              onPress={() => goToLocation(item.name, [item.admin1, item.country].filter(Boolean).join(', '), item.latitude, item.longitude)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{[item.admin1, item.country].filter(Boolean).join(', ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ q, text }: { q: string; text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <Ionicons name={q ? 'search-outline' : 'compass-outline'} size={42} color={colors.onSurfaceTertiary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}
const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    height: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  chipTextActive: { color: colors.brand },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.onSurface, paddingVertical: 14, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  icao: { color: colors.brand, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  iata: { color: colors.onSurfaceTertiary, fontSize: 12, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  name: { color: colors.onSurface, fontSize: 14, marginTop: 2, fontWeight: '600' },
  sub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  loading: { padding: spacing.xxl, alignItems: 'center' },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: 'center', fontSize: 13, maxWidth: 260, lineHeight: 18 },
});
