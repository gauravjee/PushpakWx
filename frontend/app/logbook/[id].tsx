import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { spacing, radius, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { api, FlightDetail } from '@/src/api/client';
import { usePrefs } from '@/src/context/PrefsContext';
import { convertAlt, altUnitLabel, convertWind, windUnitLabel } from '@/src/utils/weather';
import { FlightTrackMap, TrackSample } from '@/src/components/FlightTrackMap';

export default function FlightDetailScreen() {  const colors = useThemeColors();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { prefs } = usePrefs();
  const [flight, setFlight] = useState<FlightDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportContent, setExportContent] = useState<{ filename: string; content: string; format: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const f = await api.getFlight(id as string);
        setFlight(f);
      } catch (e: any) {
        setError(e.message || 'Failed to load flight');
      }
      setLoading(false);
    })();
  }, [id]);

  const doDelete = () => {
    Alert.alert('Delete flight', 'This flight will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteFlight(id as string);
            router.back();
          } catch (e: any) {
            Alert.alert('Delete failed', e.message);
          }
        },
      },
    ]);
  };

  const doExport = async (format: 'csv' | 'geojson') => {
    setExporting(true);
    try {
      const r = await api.exportFlight(id as string, format);
      setExportContent({ filename: r.filename, content: r.content, format });
      setExportVisible(true);
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = async () => {
    if (!exportContent) return;
    await Clipboard.setStringAsync(exportContent.content);
    Alert.alert('Copied', `${exportContent.filename} copied to clipboard`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']} testID="flight-detail-loading">
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }
  if (error || !flight) {
    return (
      <SafeAreaView style={styles.center} edges={['top']} testID="flight-detail-error">
        <Text style={styles.errText}>{error || 'Flight not found'}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtnBig}>
          <Text style={styles.backBtnBigText}>BACK</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const trackSamples: TrackSample[] = flight.samples.map(s => ({
    t: s.t,
    lat: s.lat,
    lon: s.lon,
    altFt: s.alt_ft ?? 0,
    speedKt: s.speed_kt ?? 0,
    heading: s.heading ?? undefined,
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']} testID="flight-detail-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="flight-detail-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {flight.dep_icao || 'Unknown'}
            <Text style={{ color: colors.onSurfaceSecondary }}>  →  </Text>
            {flight.arr_icao || 'Unknown'}
          </Text>
          <Text style={styles.sub}>{new Date(flight.started_at).toLocaleString()}</Text>
        </View>
        <Pressable onPress={doDelete} style={styles.trashBtn} testID="flight-delete-button">
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Map */}
        <View style={{ marginTop: spacing.sm }}>
          <FlightTrackMap samples={trackSamples} height={260} />
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <StatCard label="DISTANCE" value={`${Math.round(flight.distance_nm)}`} unit="nm" />
          <StatCard label="DURATION" value={formatDuration(flight.duration_s)} unit="" />
        </View>
        <View style={styles.statsGrid}>
          <StatCard label="MAX ALT" value={`${Math.round(convertAlt(flight.max_alt_ft, prefs.altitude_unit))}`} unit={altUnitLabel(prefs.altitude_unit)} />
          <StatCard label="AVG SPEED" value={`${Math.round(convertWind(flight.avg_speed_kt, prefs.wind_unit))}`} unit={windUnitLabel(prefs.wind_unit)} />
        </View>
        <View style={styles.statsGrid}>
          <StatCard label="MAX SPEED" value={`${Math.round(convertWind(flight.max_speed_kt, prefs.wind_unit))}`} unit={windUnitLabel(prefs.wind_unit)} />
          <StatCard label="SAMPLES" value={`${flight.samples.length}`} unit="" />
        </View>

        {flight.note ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>NOTE</Text>
            <Text style={styles.noteText}>{flight.note}</Text>
          </View>
        ) : null}

        {/* Export */}
        <Text style={styles.sectionTitle}>EXPORT</Text>
        <View style={styles.exportRow}>
          <Pressable
            testID="export-csv-button"
            onPress={() => doExport('csv')}
            style={styles.exportBtn}
            disabled={exporting}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.brand} />
            <Text style={styles.exportText}>CSV</Text>
            <Text style={styles.exportSub}>For spreadsheets / FAA logbook</Text>
          </Pressable>
          <Pressable
            testID="export-geojson-button"
            onPress={() => doExport('geojson')}
            style={styles.exportBtn}
            disabled={exporting}
          >
            <Ionicons name="map-outline" size={18} color={colors.brand} />
            <Text style={styles.exportText}>GeoJSON</Text>
            <Text style={styles.exportSub}>For mapping apps</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Export preview modal */}
      <Modal
        visible={exportVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setExportVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.exportModal} testID="export-modal">
            <View style={styles.exportModalHeader}>
              <Text style={styles.exportModalTitle}>{exportContent?.filename}</Text>
              <Pressable onPress={() => setExportVisible(false)} testID="export-close-button">
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView style={styles.exportBody}>
              <Text style={styles.exportContent} selectable>{exportContent?.content}</Text>
            </ScrollView>
            <View style={styles.exportFooter}>
              <Pressable
                testID="export-copy-button"
                onPress={copyToClipboard}
                style={styles.copyBtn}
              >
                <Ionicons name="copy-outline" size={16} color="#000" />
                <Text style={styles.copyBtnText}>COPY TO CLIPBOARD</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.statCard}>
      <Text style={styles.statCardLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={styles.statCardValue}>{value}</Text>
        {unit ? <Text style={styles.statCardUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m ${sec.toString().padStart(2, '0')}s`;
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  errText: { color: colors.onSurface, fontSize: 15 },
  backBtnBig: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.brand, borderRadius: radius.md },
  backBtnBigText: { color: '#000', fontWeight: '800', letterSpacing: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
  trashBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.error },
  title: { color: colors.brand, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  statCardLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  statCardValue: { color: colors.onSurface, fontSize: 22, fontWeight: '800' },
  statCardUnit: { color: colors.onSurfaceSecondary, fontSize: 11 },
  noteCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  noteLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  noteText: { color: colors.onSurface, fontSize: 13 },
  sectionTitle: {
    color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, fontWeight: '700',
    paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  exportRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  exportBtn: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4, alignItems: 'flex-start',
  },
  exportText: { color: colors.onSurface, fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  exportSub: { color: colors.onSurfaceSecondary, fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  exportModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '80%', minHeight: '50%',
    borderTopWidth: 1, borderColor: colors.border,
  },
  exportModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  exportModalTitle: { color: colors.brand, fontSize: 13, fontWeight: '800', letterSpacing: 1, flex: 1 },
  exportBody: { padding: spacing.lg, flex: 1 },
  exportContent: {
    color: colors.onSurface, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11, lineHeight: 16,
  },
  exportFooter: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.brand, padding: 14, borderRadius: radius.md,
  },
  copyBtnText: { color: '#000', fontWeight: '800', letterSpacing: 1.5, fontSize: 13 },
});
