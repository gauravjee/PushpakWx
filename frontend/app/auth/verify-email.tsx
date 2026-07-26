/**
 * OTP entry screen shown right after registration. The large, letter-spaced
 * code input style here is the reference every other OTP field in the
 * project (reset-password.tsx, and the Pilot Portal's verify/forgot-reset
 * modes) was built to match — keep them in sync if this changes.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/context/AuthContext';
import { trySaveAnyPendingFlight } from '@/src/services/flightRecording';
import { api } from '@/src/api/client';

const noOutline: any = { outlineStyle: 'none' }; // see login.tsx for why this exists

export default function VerifyEmail() {
  const { verifyEmail } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email as string) || '';
  const [code, setCode] = useState('');
  const [codeFocused, setCodeFocused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    setInfo(null);
    if (code.length < 6) {
      setErr('Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    try {
      await verifyEmail(email, code.trim());
      const result = await trySaveAnyPendingFlight();
      if (result.saved) {
        Alert.alert('Flight saved', 'Your recorded flight has been added to your logbook.');
        router.replace('/logbook');
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } catch (e: any) {
      setErr(e.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setErr(null);
    setInfo(null);
    setResending(true);
    try {
      await api.resendVerification(email);
      setInfo('A new code has been sent to your email');
    } catch (e: any) {
      setErr(e.message || 'Could not resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.wrap} testID="verify-email-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Ionicons name="mail-open-outline" size={44} color={colors.brand} style={{ marginBottom: 16 }} />
            <Text style={styles.brand}>Verify your email</Text>
            <Text style={styles.tag}>
              We sent a 6-digit code to{'\n'}<Text style={{ color: colors.brand, fontWeight: '700' }}>{email}</Text>
            </Text>

            <Text style={styles.label}>VERIFICATION CODE</Text>
            <TextInput
              testID="verify-code-input"
              style={[styles.codeInput, noOutline, codeFocused && styles.inputFocused]}
              placeholder="000000"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={code}
              onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
              onFocus={() => setCodeFocused(true)}
              onBlur={() => setCodeFocused(false)}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            {err ? <Text style={styles.err} testID="verify-error">{err}</Text> : null}
            {info ? <Text style={styles.info} testID="verify-info">{info}</Text> : null}
            <Pressable
              testID="verify-submit-button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>VERIFY & CONTINUE</Text>}
            </Pressable>
            <Pressable testID="resend-code-button" onPress={onResend} disabled={resending} style={styles.secondaryBtn}>
              <Text style={styles.linkText}>
                {resending ? 'Sending...' : "Didn't get the code? Resend"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  card: {
    width: 360,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    borderTopColor: colors.brand,
    padding: 40,
    alignItems: 'center',
  },
  brand: { color: colors.onSurface, fontSize: 22, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  tag: { color: colors.onSurfaceSecondary, fontSize: 13, marginBottom: 28, textAlign: 'center', lineHeight: 19 },
  label: {
    alignSelf: 'flex-start', color: colors.onSurfaceTertiary, fontSize: 11,
    letterSpacing: 1, marginBottom: 6, marginTop: spacing.md,
  },
  codeInput: {
    width: '100%',
    backgroundColor: colors.surfaceSecondary,
    color: colors.brand,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 10,
  },
  inputFocused: { borderColor: colors.brand },
  err: { color: colors.error, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
  info: { color: colors.success, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
  cta: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  ctaText: { color: '#000', fontWeight: '800', letterSpacing: 2, fontSize: 15 },
  secondaryBtn: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.onSurfaceSecondary, fontSize: 13, textDecorationLine: 'underline' },
});
