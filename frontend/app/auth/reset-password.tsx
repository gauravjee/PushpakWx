import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api/client';

const BG = 'https://images.unsplash.com/photo-1554137496-a7b5bf064531?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzZ8MHwxfHNlYXJjaHwxfHxydW53YXklMjBhcHByb2FjaCUyMGxpZ2h0cyUyMG5pZ2h0fGVufDB8fHx8MTc4MzkzMDA3NHww&ixlib=rb-4.1.0&q=85';

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email as string) || '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
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
      <Image source={BG} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={['rgba(17,19,21,0.5)', 'rgba(17,19,21,0.9)', 'rgba(17,19,21,1)']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="reset-back-button">
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={styles.header}>
            <Ionicons name="key-outline" size={44} color={colors.brand} />
            <Text style={styles.title}>Enter reset code</Text>
            <Text style={styles.sub}>
              A code was sent to{'\n'}<Text style={styles.email}>{email}</Text>{'\n'}
              (If an account exists for this email.)
            </Text>
          </View>
          <View style={styles.form}>
            <TextInput
              testID="reset-code-input"
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={code}
              onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TextInput
              testID="reset-new-password-input"
              style={styles.input}
              placeholder="New password (min 6 chars)"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
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
  scroll: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxxl + 24 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.surfaceSecondary },
  header: { alignItems: 'center', marginTop: spacing.xl, gap: spacing.md, paddingHorizontal: spacing.lg },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, textAlign: 'center', lineHeight: 20, fontSize: 13 },
  email: { color: colors.brand, fontWeight: '700' },
  form: { marginTop: 'auto', gap: spacing.md },
  codeInput: {
    backgroundColor: colors.surfaceSecondary,
    color: colors.brand,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 8,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  err: { color: colors.error, fontSize: 13, textAlign: 'center' },
  info: { color: colors.success, fontSize: 13, textAlign: 'center' },
  cta: { backgroundColor: colors.brand, borderRadius: radius.md, padding: 16, alignItems: 'center' },
  ctaText: { color: '#000', fontWeight: '800', letterSpacing: 2, fontSize: 15 },
});
