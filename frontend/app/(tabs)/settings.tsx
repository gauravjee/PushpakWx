import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/context/AuthContext';
import { usePrefs } from '@/src/context/PrefsContext';

export default function Settings() {
  const { user, logout, deleteAccount } = useAuth();
  const { prefs, updatePrefs } = usePrefs();
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const onLogout = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await logout();
          router.replace('/auth/login');
        }
      },
    ]);
  };

  const openDelete = () => {
    setDeletePassword('');
    setDeleteErr(null);
    setShowDelete(true);
  };

  const confirmDelete = async () => {
    setDeleteErr(null);
    if (!deletePassword) {
      setDeleteErr('Please enter your password');
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowDelete(false);
      setShowDeleted(true);
    } catch (e: any) {
      setDeleteErr(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const finishDeleted = () => {
    setShowDeleted(false);
    router.replace('/auth/login');
  };

  const setPref = async (patch: any) => {
    Haptics.selectionAsync().catch(() => {});
    await updatePrefs(patch);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="settings-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.title}>SETUP</Text>
        </View>

        <Section title="ACCOUNT">
          <View style={styles.accountCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName}>{user?.full_name || 'Pilot'}</Text>
              <Text style={styles.accountEmail}>{user?.email}</Text>
              {user?.email_verified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                  <Text style={styles.verifiedText}>VERIFIED</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Section>

        <Section title="UNITS">
          <SegRow
            label="Wind speed"
            options={[
              { key: 'kt', label: 'kt' },
              { key: 'kmh', label: 'km/h' },
              { key: 'mph', label: 'mph' },
            ]}
            value={prefs.wind_unit}
            onChange={(v) => setPref({ wind_unit: v })}
            testID="unit-wind"
          />
          <SegRow
            label="Altitude"
            options={[
              { key: 'ft', label: 'Feet' },
              { key: 'm', label: 'Meters' },
            ]}
            value={prefs.altitude_unit}
            onChange={(v) => setPref({ altitude_unit: v })}
            testID="unit-alt"
          />
          <SegRow
            label="Temperature"
            options={[
              { key: 'C', label: '°C' },
              { key: 'F', label: '°F' },
            ]}
            value={prefs.temp_unit}
            onChange={(v) => setPref({ temp_unit: v })}
            testID="unit-temp"
          />
        </Section>

        <Section title="ABOUT">
          <InfoRow icon="cloud-outline" label="Weather data" value="Open-Meteo" />
          <InfoRow icon="information-circle-outline" label="Version" value="1.0.0" />
          <InfoRow
            icon="warning-outline"
            label="Disclaimer"
            value="Not for primary flight planning. Use official aviation weather (METAR/TAF) sources."
            multiLine
          />
        </Section>

        <Pressable testID="logout-button" onPress={onLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </Pressable>

        <Section title="DANGER ZONE">
          <Pressable testID="delete-account-button" onPress={openDelete} style={styles.dangerRow}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerTitle}>Delete Account</Text>
              <Text style={styles.dangerSub}>Permanently delete your account and all data. This cannot be undone.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
          </Pressable>
        </Section>
      </ScrollView>

      {/* Delete confirmation modal */}
      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard} testID="delete-modal">
            <View style={styles.modalIcon}>
              <Ionicons name="warning" size={32} color={colors.error} />
            </View>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalText}>
              This will permanently delete your profile, saved airports, and all preferences.{'\n\n'}
              This action cannot be undone.
            </Text>
            <View style={styles.confirmList}>
              <ConfirmItem text="All saved airports will be removed" />
              <ConfirmItem text="Your account cannot be recovered" />
              <ConfirmItem text="You'll need to create a new account to use the app" />
            </View>
            <Text style={styles.modalLabel}>Enter your password to confirm</Text>
            <TextInput
              testID="delete-password-input"
              style={styles.modalInput}
              placeholder="Password"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoFocus
            />
            {deleteErr ? <Text style={styles.modalErr} testID="delete-error">{deleteErr}</Text> : null}
            <View style={styles.modalBtnRow}>
              <Pressable
                testID="delete-cancel-button"
                onPress={() => setShowDelete(false)}
                style={[styles.modalBtn, styles.modalBtnCancel]}
                disabled={deleting}
              >
                <Text style={styles.modalBtnCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                testID="delete-confirm-button"
                onPress={confirmDelete}
                style={[styles.modalBtn, styles.modalBtnDanger, deleting && { opacity: 0.7 }]}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnDangerText}>DELETE</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Deleted confirmation modal */}
      <Modal visible={showDeleted} transparent animationType="fade" onRequestClose={finishDeleted}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="deleted-modal">
            <View style={[styles.modalIcon, { backgroundColor: 'rgba(50, 215, 75, 0.12)' }]}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            </View>
            <Text style={styles.modalTitle}>Account deleted</Text>
            <Text style={styles.modalText}>
              Your account and all associated data have been permanently deleted from our servers.
            </Text>
            <Pressable
              testID="deleted-ok-button"
              onPress={finishDeleted}
              style={[styles.modalBtn, styles.modalBtnPrimary, { marginTop: spacing.lg }]}
            >
              <Text style={styles.modalBtnPrimaryText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ConfirmItem({ text }: { text: string }) {
  return (
    <View style={styles.confirmItem}>
      <Ionicons name="close-circle" size={14} color={colors.error} />
      <Text style={styles.confirmItemText}>{text}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SegRow({
  label, options, value, onChange, testID,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: any) => void;
  testID?: string;
}) {
  return (
    <View style={styles.segRow} testID={testID}>
      <Text style={styles.segLabel}>{label}</Text>
      <View style={styles.segOptions}>
        {options.map(o => {
          const active = value === o.key;
          return (
            <Pressable
              key={o.key}
              testID={`${testID}-${o.key}`}
              onPress={() => onChange(o.key)}
              style={[styles.segBtn, active && styles.segBtnActive]}
            >
              <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value, multiLine }: { icon: string; label: string; value: string; multiLine?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={18} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, multiLine && { fontSize: 12, lineHeight: 16 }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm, fontWeight: '700' },
  sectionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  accountCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  accountName: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  accountEmail: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  verifiedText: { color: colors.success, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  segRow: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: spacing.sm },
  segLabel: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 0.5 },
  segOptions: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm },
  segBtnActive: { backgroundColor: colors.brand },
  segBtnText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  segBtnTextActive: { color: '#000', fontWeight: '800' },
  infoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  infoLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 0.5 },
  infoValue: { color: colors.onSurface, fontSize: 14, marginTop: 2 },
  logoutBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logoutText: { color: colors.error, fontWeight: '800', letterSpacing: 2, fontSize: 13 },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  dangerTitle: { color: colors.error, fontSize: 14, fontWeight: '700' },
  dangerSub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  modalIcon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  confirmList: { gap: spacing.sm, marginTop: spacing.sm },
  confirmItem: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  confirmItemText: { color: colors.onSurface, fontSize: 12, flex: 1 },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: spacing.sm },
  modalInput: {
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  modalErr: { color: colors.error, fontSize: 12, textAlign: 'center' },
  modalBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalBtn: { flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  modalBtnCancelText: { color: colors.onSurface, fontWeight: '700', letterSpacing: 1, fontSize: 13 },
  modalBtnDanger: { backgroundColor: colors.error },
  modalBtnDangerText: { color: '#fff', fontWeight: '800', letterSpacing: 1, fontSize: 13 },
  modalBtnPrimary: { backgroundColor: colors.brand },
  modalBtnPrimaryText: { color: '#000', fontWeight: '800', letterSpacing: 1, fontSize: 13 },
});
