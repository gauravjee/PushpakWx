/**
 * Second step of the password-reset flow (after forgot-password.tsx sends
 * the code). Combines the styled 6-digit OTP input (same visual treatment
 * as verify-email.tsx) with a password field, so this screen collects both
 * the reset code and the new password in one submit.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api/client';

const noOutline: any = { outlineStyle: 'none' }; // see login.tsx for why this exists

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email as string) || '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    setInfo(null);
    if (code.length < 6) {
      setErr('Enter the 6-digit code from your email');
      return;
    }
    if (password.length < 6) {
      setErr('New password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      // Backend also clears any account lockout on a successful reset —
      // see reset_password in server.py — so this doubles as the "unlock
      // my account" path if login attempts had been exhausted.
      await api.resetPassword(email, code.trim(), password);
      setInfo('Password reset. You can now sign in.');
      setTimeout(() => router.replace('/auth/login'), 800);
    } catch (e: any) {
      setErr(e.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap} testID="reset-password-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Ionicons name="key-outline" size={44} color={colors.brand} style={{ marginBottom: 16 }} />
            <Text style={styles.brand}>Enter reset code</Text>
            <Text style={styles.tag}>
              A code was sent to{'\n'}<Text style={{ color: colors.brand, fontWeight: '700' }}>{email}</Text>
            </Text>

            <Text style={styles.label}>RESET CODE</Text>
            <TextInput
              testID="reset-code-input"
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
            <Text style={styles.label}>NEW PASSWORD</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                testID="reset-new-password-input"
                style={[styles.input, styles.passwordInput, noOutline, passwordFocused && styles.inputFocused]}
                placeholderTextColor={colors.onSurfaceTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                secureTextEntry={!showPassword}
              />
              <Pressable testID="toggle-password-visibility" onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn} hitSlop={8}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
            {err ? <Text style={styles.err} testID="reset-error">{err}</Text> : null}
            {info ? <Text style={styles.info} testID="reset-info">{info}</Text> : null}
            <Pressable
              testID="reset-submit-button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>RESET PASSWORD</Text>}
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
  tag: { color: colors.onSurfaceSecondary, fontSize: 13, marginBottom: 28, textAlign: 'center', lineHeight: 20 },
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
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 8,
  },
  input: {
    width: '100%',
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  inputFocused: { borderColor: colors.brand },
  passwordWrap: { width: '100%', position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeBtn: { position: 'absolute', right: 12 },
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
});
