/**
 * First step of the password-reset flow — just collects an email and
 * triggers the backend to send a code, then hands off to
 * reset-password.tsx for the code + new password. No password field on
 * this screen, so no eye-toggle needed here.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api/client';

const noOutline: any = { outlineStyle: 'none' }; // see login.tsx for why this exists

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (!email.trim()) {
      setErr('Please enter your email');
      return;
    }
    setLoading(true);
    try {
      // Backend intentionally returns the same generic response whether or
      // not the email is registered (see forgot_password in server.py) —
      // so this always proceeds to reset-password.tsx regardless, rather
      // than trying to branch on whether the account "really" exists.
      await api.forgotPassword(email.trim());
      router.replace({ pathname: '/auth/reset-password', params: { email: email.trim() } });
    } catch (e: any) {
      setErr(e.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap} testID="forgot-password-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Ionicons name="lock-open-outline" size={44} color={colors.brand} style={{ marginBottom: 16 }} />
            <Text style={styles.brand}>Reset your password</Text>
            <Text style={styles.tag}>
              Enter the email address associated with your account and we'll send you a code to reset your password.
            </Text>

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="forgot-email-input"
              style={[styles.input, noOutline, emailFocused && styles.inputFocused]}
              placeholderTextColor={colors.onSurfaceTertiary}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
            />
            {err ? <Text style={styles.err} testID="forgot-error">{err}</Text> : null}
            <Pressable
              testID="forgot-submit-button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>SEND CODE</Text>}
            </Pressable>
            <Pressable testID="forgot-back-button" onPress={() => router.back()} style={styles.secondaryBtn}>
              <Text style={styles.linkText}>Back to sign in</Text>
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
  err: { color: colors.error, fontSize: 13, marginTop: spacing.sm, alignSelf: 'flex-start' },
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
