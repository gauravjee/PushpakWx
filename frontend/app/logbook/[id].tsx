import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Modal, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { spacing, radius, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { api, FlightDetail } from '@/src/api/client';
import { usePrefs } from '@/src/context/PrefsContext';
import { convertAlt, altUnitLabel, convertWind, windUnitLabel } from '@/src/utils/weather';
import { FlightTrackMap, TrackSample } from '@/src/components/FlightTrackMap';
import { AIRCRAFT_TYPES } from '@/src/constants/aircraft';

export default function FlightDetailScreen() {  const colors = useThemeColors();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { prefs } = usePrefs();
  const [flight, setFlight] = useState<FlightDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editDetailsVisible, setEditDetailsVisible] = useState(false);
  const [editAircraftType, setEditAircraftType] = useState('');
  const [editAircraftTypeOther, setEditAircraftTypeOther] = useState('');
  const [editRegistration, setEditRegistration] = useState('');
  const [editCapacity, setEditCapacity] = useState<'pic' | 'dual' | 'copilot'>('pic');
  const [editInstrumentMinutes, setEditInstrumentMinutes] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

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
    if (Platform.OS === 'web') {
      if (window.confirm('Delete flight — this will be permanently removed. Are you sure?')) {
        (async () => {
          try {
            await api.deleteFlight(id as string);
            router.back();
          } catch (e: any) {
            window.alert(e.message || 'Delete failed');
          }
        })();
      }
      return;
    }
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

  const doExport = async (format: 'csv' | 'geojson' | 'dgca_csv' | 'faa_csv') => {
    setExporting(true);
    try {
      const r = await api.exportFlight(id as string, format);
      await downloadOrShare(r.filename, r.content, r.content_type);
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    } finally {
      setExporting(false);
    }
  };

  const downloadOrShare = async (filename: string, content: string, mimeType: string) => {
    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    const fileUri = FileSystem.cacheDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: 'Save or share this file' });
    } else {
      Alert.alert('Saved', `File saved to app storage: ${filename}`);
    }
  };

  const openEditDetails = () => {
    if (!flight) return;
    const knownType = AIRCRAFT_TYPES.includes(flight.aircraft_type || '') ? flight.aircraft_type! : (flight.aircraft_type ? 'Other' : '');
    setEditAircraftType(knownType);
    setEditAircraftTypeOther(knownType === 'Other' ? (flight.aircraft_type || '') : '');
    setEditRegistration(flight.registration || '');
    setEditCapacity(flight.capacity || 'pic');
    setEditInstrumentMinutes(flight.instrument_minutes != null ? String(flight.instrument_minutes) : '');
    setEditDetailsVisible(true);
  };

  const saveEditedDetails = async () => {
    if (!flight) return;
    setSavingDetails(true);
    try {
      const finalType = editAircraftType === 'Other' ? editAircraftTypeOther.trim() : editAircraftType;
      const mins = parseFloat(editInstrumentMinutes);
      const updated = await api.updateFlightDetails(flight.id, {
        aircraft_type: finalType || undefined,
        registration: editRegistration.trim() || undefined,
        capacity: editCapacity,
        instrument_minutes: !isNaN(mins) ? mins : undefined,
      });
      setFlight({ ...flight, ...updated });
      setEditDetailsVisible(false);
    } catch (e: any) {
      Alert.alert('Save failed', e.message || 'Could not save these details');
    } finally {
      setSavingDetails(false);
    }
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

        {/* Logbook details (DGCA-relevant fields) */}
        <View style={styles.detailsCard} testID="logbook-details-card">
          <View style={styles.detailsHeader}>
            <Text style={styles.sectionTitle}>LOGBOOK DETAILS</Text>
            <Pressable testID="edit-details-button" onPress={openEditDetails} style={styles.editBtn}>
              <Ionicons name="create-outline" size={16} color={colors.brand} />
              <Text style={styles.editBtnText}>EDIT</Text>
            </Pressable>
          </View>
          <View style={styles.detailsGrid}>
            <DetailRow label="Aircraft" value={flight.aircraft_type || '—'} />
            <DetailRow label="Registration" value={flight.registration || '—'} />
            <DetailRow label="Capacity" value={capacityLabel(flight.capacity)} />
            <DetailRow label="Instrument" value={flight.instrument_minutes != null ? `${flight.instrument_minutes} min` : '—'} />
            <DetailRow label="Day" value={flight.day_minutes != null ? `${flight.day_minutes} min` : '—'} />
            <DetailRow label="Night" value={flight.night_minutes != null ? `${flight.night_minutes} min` : '—'} />
          </View>
        </View>

        {flight.note ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>NOTE</Text>
            <Text style={styles.noteText}>{flight.note}</Text>
          </View>
        ) : null}

        {/* Logbook export — the actual DGCA/FAA-format entry for this flight */}
        <Text style={styles.sectionTitle}>DOWNLOAD LOGBOOK</Text>
        <View style={styles.exportRow}>
          <Pressable
            testID="export-dgca-button"
            onPress={() => doExport('dgca_csv')}
            style={styles.exportBtn}
            disabled={exporting}
          >
            <Ionicons name="book-outline" size={18} color={colors.brand} />
            <Text style={styles.exportText}>DGCA format</Text>
            <Text style={styles.exportSub}>Block times (UTC), day/night, PIC/dual/instrument split</Text>
          </Pressable>
          <Pressable
            testID="export-faa-button"
            onPress={() => doExport('faa_csv')}
            style={styles.exportBtn}
            disabled={exporting}
          >
            <Ionicons name="book-outline" size={18} color={colors.brand} />
            <Text style={styles.exportText}>FAA format</Text>
            <Text style={styles.exportSub}>PIC/SIC/dual received, night, instrument</Text>
          </Pressable>
        </View>

        {/* Raw flight track — for other tools, not a logbook entry */}
        <Text style={styles.sectionTitle}>FLIGHT TRACK</Text>
        <View style={styles.exportRow}>
          <Pressable
            testID="export-csv-button"
            onPress={() => doExport('csv')}
            style={styles.exportBtn}
            disabled={exporting}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.brand} />
            <Text style={styles.exportText}>CSV</Text>
            <Text style={styles.exportSub}>Raw GPS samples, for spreadsheets</Text>
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

      {/* Edit logbook details modal */}
      <Modal
        visible={editDetailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditDetailsVisible(false)}
      >
        <View style={styles.editModalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} style={{ width: '100%' }}>
            <View style={styles.modalCard} testID="edit-details-modal">
              <Text style={styles.modalTitle}>Edit logbook details</Text>

              <Text style={styles.modalLabel}>AIRCRAFT TYPE</Text>
              <View style={styles.chipWrap}>
                {AIRCRAFT_TYPES.map(t => (
                  <Pressable
                    key={t}
                    testID={`edit-aircraft-chip-${t}`}
                    onPress={() => setEditAircraftType(t)}
                    style={[styles.detailChip, editAircraftType === t && styles.detailChipActive]}
                  >
                    <Text style={[styles.detailChipText, editAircraftType === t && styles.detailChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              {editAircraftType === 'Other' && (
                <TextInput
                  testID="edit-aircraft-other-input"
                  value={editAircraftTypeOther}
                  onChangeText={setEditAircraftTypeOther}
                  placeholder="Enter aircraft type"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={[styles.modalInput, { marginTop: spacing.sm }]}
                />
              )}

              <Text style={[styles.modalLabel, { marginTop: spacing.md }]}>REGISTRATION</Text>
              <TextInput
                testID="edit-registration-input"
                value={editRegistration}
                onChangeText={setEditRegistration}
                placeholder="e.g. VT-ABC"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="characters"
                style={styles.modalInput}
              />

              <Text style={[styles.modalLabel, { marginTop: spacing.md }]}>CAPACITY</Text>
              <View style={styles.capacityRow}>
                {(['pic', 'dual', 'copilot'] as const).map(c => (
                  <Pressable
                    key={c}
                    testID={`edit-capacity-${c}`}
                    onPress={() => setEditCapacity(c)}
                    style={[styles.capacityBtn, editCapacity === c && styles.capacityBtnActive]}
                  >
                    <Text style={[styles.capacityBtnText, editCapacity === c && styles.capacityBtnTextActive]}>
                      {c === 'pic' ? 'PIC (Solo)' : c === 'dual' ? 'Dual' : 'Co-pilot'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.modalLabel, { marginTop: spacing.md }]}>INSTRUMENT TIME (MIN)</Text>
              <TextInput
                testID="edit-instrument-minutes-input"
                value={editInstrumentMinutes}
                onChangeText={t => setEditInstrumentMinutes(t.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="number-pad"
                style={styles.modalInput}
              />

              <View style={styles.modalBtnRow}>
                <Pressable
                  testID="cancel-edit-details-button"
                  onPress={() => setEditDetailsVisible(false)}
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                >
                  <Text style={styles.modalBtnCancelText}>CANCEL</Text>
                </Pressable>
                <Pressable
                  testID="save-edit-details-button"
                  onPress={saveEditedDetails}
                  style={[styles.modalBtn, styles.modalBtnPrimary, savingDetails && { opacity: 0.7 }]}
                  disabled={savingDetails}
                >
                  {savingDetails ? <ActivityIndicator color="#000" /> : <Text style={styles.modalBtnPrimaryText}>SAVE</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

function capacityLabel(capacity?: 'pic' | 'dual' | 'copilot' | null): string {
  if (capacity === 'pic') return 'PIC (Solo)';
  if (capacity === 'dual') return 'Dual';
  if (capacity === 'copilot') return 'Co-pilot';
  return '—';
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

  detailsCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { color: colors.brand, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  detailsGrid: { gap: 2 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  detailRowLabel: { color: colors.onSurfaceSecondary, fontSize: 12 },
  detailRowValue: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },

  editModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.xl,
    width: '100%', maxWidth: 400,
    borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: spacing.sm },
  modalInput: {
    backgroundColor: colors.surfaceTertiary, color: colors.onSurface,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border, fontSize: 14,
  },
  modalBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  detailChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
  },
  detailChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  detailChipText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '700' },
  detailChipTextActive: { color: colors.brand },
  capacityRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  capacityBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
  },
  capacityBtnActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  capacityBtnText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700' },
  capacityBtnTextActive: { color: colors.brand },
  modalBtn: { flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  modalBtnCancelText: { color: colors.onSurface, fontWeight: '700', letterSpacing: 1, fontSize: 13 },
  modalBtnPrimary: { backgroundColor: colors.brand },
  modalBtnPrimaryText: { color: '#000', fontWeight: '800', letterSpacing: 1, fontSize: 13 },
});
