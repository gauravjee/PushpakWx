import React, { useCallback, useState, useMemo} from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { spacing, radius, ColorPalette} from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { api, Favorite } from '@/src/api/client';

export default function Favorites() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listFavorites();
      setFavs(r);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = async (id: string) => {
    try {
      await api.removeFavorite(id);
      setFavs(prev => prev.filter(f => f.id !== id));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not remove');
    }
  };

  const open = (f: Favorite) => {
    router.push({
      pathname: '/(tabs)/dashboard',
      params: {
        label: f.icao || f.name,
        sub: `${f.name}${f.city ? ' · ' + f.city : ''}`,
        lat: String(f.lat),
        lon: String(f.lon),
        icao: f.icao || undefined,
        elevation: f.elevation_ft != null ? String(f.elevation_ft) : undefined,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="favorites-screen">
      <View style={styles.header}>
        <Text style={styles.title}>SAVED AIRPORTS</Text>
        <Text style={styles.sub}>{favs.length} saved</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={favs}
          keyExtractor={f => f.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={48} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>No saved airports yet</Text>
              <Text style={styles.emptyText}>
                Tap the star icon on any location's forecast to save it here for quick access.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable
              testID={`favorite-item-${index}`}
              onPress={() => open(item)}
              style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceTertiary }]}
            >
              <View style={styles.leftAccent} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={styles.icao}>{item.icao || item.name}</Text>
                  {item.iata ? <Text style={styles.iata}>{item.iata}</Text> : null}
                </View>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                {item.city ? <Text style={styles.subCity} numberOfLines={1}>{[item.city, item.country].filter(Boolean).join(', ')}</Text> : null}
              </View>
              <Pressable
                testID={`favorite-remove-${index}`}
                hitSlop={12}
                onPress={() => remove(item.id)}
                style={styles.removeBtn}
              >
                <Ionicons name="close" size={18} color={colors.onSurfaceSecondary} />
              </Pressable>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.sm, marginTop: spacing.xxl },
  emptyTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: 'center', fontSize: 13, maxWidth: 280, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    overflow: 'hidden',
  },
  leftAccent: { width: 3, alignSelf: 'stretch', backgroundColor: colors.brand, borderRadius: 2 },
  icao: { color: colors.brand, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  iata: { color: colors.onSurfaceTertiary, fontSize: 12, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  name: { color: colors.onSurface, fontSize: 13, marginTop: 2, fontWeight: '600' },
  subCity: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  removeBtn: { padding: 4 },
});
