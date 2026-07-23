import React, { useState, useMemo} from 'react';
import { Image } from 'expo-image';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { spacing, radius, ColorPalette} from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { useAuth } from '@/src/context/AuthContext';
import { usePrefs } from '@/src/context/PrefsContext';

export default function Settings() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, logout, requestAccountDeletion, confirmAccountDeletion } = useAuth();
  const { prefs, updatePrefs } = usePrefs();
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'form' | 'confirm' | 'otp'>('form');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const onLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out — are you sure?')) {
        logout().then(() => router.replace('/auth/login'));
      }
      return;
    }
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
    setDeleteStep('form');
    setDeleteEmail('');
    setDeletePassword('');
    setDeletePhrase('');
    setDeleteOtp('');
    setDeleteErr(null);
    setShowDelete(true);
  };

  const continueToConfirm = () => {
    setDeleteErr(null);
    if (!deleteEmail.trim() || !deletePassword) {
      setDeleteErr('Please enter your email and password');
      return;
    }
    // Client-side check for immediate feedback — the backend independently
    // verifies this same match (and the password) before sending any OTP,
    // so this isn't the only line of defense, just the fastest one.
    if (deleteEmail.trim().toLowerCase() !== (user?.email || '').toLowerCase()) {
      setDeleteErr("That email doesn't match your account");
      return;
    }
    setDeleteErr(null);
    setDeleteStep('confirm');
  };

  const CONFIRM_PHRASE = 'i am sure';

  const submitPhraseAndRequestOtp = async () => {
    setDeleteErr(null);
    if (deletePhrase.trim().toLowerCase() !== CONFIRM_PHRASE) {
      setDeleteErr(`Please type "I am sure" exactly to confirm`);
      return;
    }
    setDeleting(true);
    try {
      // Only now — after both prior confirmations — does the backend
      // re-verify password/email and actually send the OTP, so a code
      // isn't emailed out just from someone reaching the first screen.
      await requestAccountDeletion(deletePassword, deleteEmail.trim());
      setDeleteOtp('');
      setDeleteStep('otp');
    } catch (e: any) {
      setDeleteErr(e.message || 'Could not send confirmation code');
    } finally {
      setDeleting(false);
    }
  };

  const confirmOtpAndDelete = async () => {
    setDeleteErr(null);
    if (deleteOtp.trim().length < 6) {
      setDeleteErr('Enter the 6-digit code from your email');
      return;
    }
    setDeleting(true);
    try {
      await confirmAccountDeletion(deleteOtp.trim());
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
      {/* Background logo watermark — see dashboard.tsx for the fuller comment. */}
      <Image
        source={require('../../assets/images/icon.png')}
        style={{ position: 'absolute', top: '50%', left: '50%', width: 640, height: 640, marginLeft: -320, marginTop: -320, opacity: 0.05 }}
        contentFit="contain"
        pointerEvents="none"
      />
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

        <Section title="FLIGHT RECORDING">
          <ToggleRow
            testID="auto-detect-flight-toggle"
            label="Auto-detect flight"
            hint="Automatically START at ≥30 kt for 15s and STOP at <5 kt for 2 min."
            value={prefs.auto_detect_flight ?? true}
            onChange={(v) => setPref({ auto_detect_flight: v })}
          />
        </Section>

        <Section title="APPEARANCE">
          <SegRow
            label="Theme"
            options={[
              { key: 'dark', label: 'Dark' },
              { key: 'light', label: 'Light' },
              { key: 'auto', label: 'Auto' },
            ]}
            value={prefs.theme_mode ?? 'dark'}
            onChange={(v) => setPref({ theme_mode: v })}
            testID="theme-mode"
          />
          <View style={styles.betaNote}>
            <Ionicons name="information-circle-outline" size={14} color={colors.info} />
            <Text style={styles.betaText}>
              Dark mode is built for cockpit readability and is the default. Auto follows your device's system setting and switches automatically between day and night.
            </Text>
          </View>
        </Section>

        <Section title="ABOUT">
          <InfoRow icon="apps-outline" label="App" value={Constants.expoConfig?.name ?? 'PushpakWx'} />
          <InfoRow icon="information-circle-outline" label="Version" value={Constants.expoConfig?.version ?? '—'} />
          <InfoRow icon="build-outline" label="Build" value={String(Constants.androidManifest?.versionCode ?? '—')} />
          <InfoRow icon="cloud-outline" label="Weather data" value="Open-Meteo" />
          <InfoRow
            icon="warning-outline"
            label="Disclaimer"
            value="Not for primary flight planning. Use official aviation weather (METAR/TAF) sources."
            multiLine
          />
          <Pressable testID="privacy-policy-link" onPress={() => router.push('/privacy')} style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={18} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Legal</Text>
              <Text style={styles.infoValue}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        </Section>

        <Text style={styles.copyright}>
          © {new Date().getFullYear()} MaheSho Technologies LLP. All rights reserved.
        </Text>

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

            {deleteStep === 'form' && (
              <>
                <Text style={styles.modalTitle}>Delete your account?</Text>
                <Text style={styles.modalText}>
                  This will permanently delete your profile, saved airports, preferences, and your
                  entire flight logbook — including all recorded flights and GPS tracks.{'\n\n'}
                  This action cannot be undone.
                </Text>
                <View style={styles.confirmList}>
                  <ConfirmItem text="Every flight you've logged will be permanently deleted" />
                  <ConfirmItem text="All saved airports and preferences will be removed" />
                  <ConfirmItem text="Your account cannot be recovered" />
                </View>
                <Text style={styles.modalLabel}>Enter your email to confirm</Text>
                <TextInput
                  testID="delete-email-input"
                  style={styles.modalInput}
                  placeholder={user?.email || 'Email'}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={deleteEmail}
                  onChangeText={setDeleteEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                />
                <Text style={[styles.modalLabel, { marginTop: 12 }]}>Enter your password</Text>
                <TextInput
                  testID="delete-password-input"
                  style={styles.modalInput}
                  placeholder="Password"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  secureTextEntry
                />
                {deleteErr ? <Text style={styles.modalErr} testID="delete-error">{deleteErr}</Text> : null}
                <View style={styles.modalBtnRow}>
                  <Pressable
                    testID="delete-cancel-button"
                    onPress={() => setShowDelete(false)}
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                  >
                    <Text style={styles.modalBtnCancelText}>CANCEL</Text>
                  </Pressable>
                  <Pressable
                    testID="delete-continue-button"
                    onPress={continueToConfirm}
                    style={[styles.modalBtn, styles.modalBtnDanger]}
                  >
                    <Text style={styles.modalBtnDangerText}>CONTINUE</Text>
                  </Pressable>
                </View>
              </>
            )}

            {deleteStep === 'confirm' && (
              <>
                <Text style={styles.modalTitle}>Last step</Text>
                <Text style={styles.modalText}>
                  I understand that deleting my account will permanently delete all my data,
                  including my{' '}
                  <Text style={styles.modalTextEmphasis}>flights, logbook entries, and account information</Text>
                  , and that this cannot be undone.
                </Text>
                <Text style={styles.modalLabel}>Type "I am sure" to confirm</Text>
                <TextInput
                  testID="delete-phrase-input"
                  style={styles.modalInput}
                  placeholder="I am sure"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={deletePhrase}
                  onChangeText={setDeletePhrase}
                  autoCapitalize="none"
                  autoFocus
                />
                {deleteErr ? <Text style={styles.modalErr} testID="delete-error">{deleteErr}</Text> : null}
                <View style={styles.modalBtnRow}>
                  <Pressable
                    testID="delete-back-button"
                    onPress={() => { setDeleteStep('form'); setDeleteErr(null); }}
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    disabled={deleting}
                  >
                    <Text style={styles.modalBtnCancelText}>BACK</Text>
                  </Pressable>
                  <Pressable
                    testID="delete-request-otp-button"
                    onPress={submitPhraseAndRequestOtp}
                    style={[styles.modalBtn, styles.modalBtnDanger, deleting && { opacity: 0.7 }]}
                    disabled={deleting}
                  >
                    {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnDangerText}>SEND CONFIRMATION CODE</Text>}
                  </Pressable>
                </View>
              </>
            )}

            {deleteStep === 'otp' && (
              <>
                <Text style={styles.modalTitle}>Confirm with the code we emailed you</Text>
                <Text style={styles.modalText}>
                  A confirmation code was sent to {user?.email}. Enter it below within 5 minutes to
                  permanently delete your account. This is the final step — once confirmed, there is
                  no way to undo it.
                </Text>
                <Text style={styles.modalLabel}>Confirmation code</Text>
                <TextInput
                  testID="delete-otp-input"
                  style={styles.otpInput}
                  placeholder="000000"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={deleteOtp}
                  onChangeText={(t) => setDeleteOtp(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
                {deleteErr ? <Text style={styles.modalErr} testID="delete-error">{deleteErr}</Text> : null}
                <View style={styles.modalBtnRow}>
                  <Pressable
                    testID="delete-otp-back-button"
                    onPress={() => { setDeleteStep('confirm'); setDeleteErr(null); }}
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    disabled={deleting}
                  >
                    <Text style={styles.modalBtnCancelText}>BACK</Text>
                  </Pressable>
                  <Pressable
                    testID="delete-confirm-button"
                    onPress={confirmOtpAndDelete}
                    style={[styles.modalBtn, styles.modalBtnDanger, deleting && { opacity: 0.7 }]}
                    disabled={deleting}
                  >
                    {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnDangerText}>DELETE MY ACCOUNT</Text>}
                  </Pressable>
                </View>
              </>
            )}
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
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.confirmItem}>
      <Ionicons name="close-circle" size={14} color={colors.error} />
      <Text style={styles.confirmItemText}>{text}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

function ToggleRow({
  label, hint, value, onChange, testID,
}: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testID?: string;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      testID={testID}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}
const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  copyright: {
    textAlign: 'center',
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
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
  modalTextEmphasis: { color: colors.error, fontWeight: '700' },
  // Same large, letter-spaced treatment used for every other OTP field in
  // the app (verify-email.tsx, reset-password.tsx) — red instead of the
  // usual brand amber, matching the deletion-warning email's accent color.
  otpInput: {
    width: '100%',
    backgroundColor: colors.surfaceSecondary,
    color: colors.error,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 10,
  },
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
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
  },
  toggleLabel: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  toggleHint: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
  toggleTrack: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', padding: 2,
  },
  toggleTrackOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.onSurfaceSecondary },
  toggleThumbOn: { backgroundColor: '#000', transform: [{ translateX: 18 }] },
  betaNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: spacing.md, backgroundColor: colors.surfaceTertiary,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  betaText: { color: colors.onSurfaceSecondary, fontSize: 11, lineHeight: 16, flex: 1 },
  modalBtnPrimary: { backgroundColor: colors.brand },
  modalBtnPrimaryText: { color: '#000', fontWeight: '800', letterSpacing: 1, fontSize: 13 },
});
