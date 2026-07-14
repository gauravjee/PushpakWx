import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api/client';

const BG = 'https://images.unsplash.com/photo-1554137496-a7b5bf064531?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzZ8MHwxfHNlYXJjaHwxfHxydW53YXklMjBhcHByb2FjaCUyMGxpZ2h0cyUyMG5pZ2h0fGVufDB8fHx8MTc4MzkzMDA3NHww&ixlib=rb-4.1.0&q=85';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
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
      <Image source={BG} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={['rgba(17,19,21,0.5)', 'rgba(17,19,21,0.9)', 'rgba(17,19,21,1)']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="forgot-back-button">
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={styles.header}>
            <Ionicons name="lock-open-outline" size={48} color={colors.brand} />
            <Text style={styles.title}>Reset your password</Text>
            <Text style={styles.sub}>
              Enter the email address associated with your account and we'll send you a code to reset your password.
            </Text>
          </View>
          <View style={styles.form}>
            <TextInput
              testID="forgot-email-input"
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
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
  header: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.md, paddingHorizontal: spacing.lg },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, textAlign: 'center', lineHeight: 20, fontSize: 14 },
  form: { marginTop: 'auto', gap: spacing.md },
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
  err: { color: colors.error, fontSize: 13 },
  cta: { backgroundColor: colors.brand, borderRadius: radius.md, padding: 16, alignItems: 'center' },
  ctaText: { color: '#000', fontWeight: '800', letterSpacing: 2, fontSize: 15 },
});
