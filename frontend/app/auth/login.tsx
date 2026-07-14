import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Link } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/context/AuthContext';

const BG = 'https://images.unsplash.com/photo-1554137496-a7b5bf064531?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzZ8MHwxfHNlYXJjaHwxfHxydW53YXklMjBhcHByb2FjaCUyMGxpZ2h0cyUyMG5pZ2h0fGVufDB8fHx8MTc4MzkzMDA3NHww&ixlib=rb-4.1.0&q=85';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (!email || !password) {
      setErr('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      const msg = e.message || 'Login failed';
      if (msg.toLowerCase().includes('not verified')) {
        router.replace({ pathname: '/auth/verify-email', params: { email: email.trim() } });
        return;
      }
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap} testID="login-screen">
      <Image source={BG} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={['rgba(17,19,21,0.4)', 'rgba(17,19,21,0.85)', 'rgba(17,19,21,1)']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>PUSHPAK<Text style={{ color: colors.brand }}>WX</Text></Text>
            <Text style={styles.tag}>AVIATION WEATHER · PROFESSIONAL FORECAST</Text>
          </View>
          <View style={styles.form}>
            <Text style={styles.title}>Sign in</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              testID="login-password-input"
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
            <Pressable
              testID="login-submit-button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>SIGN IN</Text>}
            </Pressable>
            <Link href="/auth/forgot-password" asChild>
              <Pressable testID="forgot-password-link" style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            </Link>
            <Link href="/auth/register" asChild>
              <Pressable testID="go-to-register-button" style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>New pilot? Create account</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, justifyContent: 'space-between', padding: spacing.xl, paddingTop: spacing.xxxl + 24 },
  header: { marginTop: spacing.xl },
  brand: { color: colors.onSurface, fontSize: 42, fontWeight: '800', letterSpacing: 4 },
  tag: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, marginTop: spacing.xs },
  form: { marginTop: 'auto', gap: spacing.md },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '700', marginBottom: spacing.sm },
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
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaText: { color: '#000', fontWeight: '800', letterSpacing: 2, fontSize: 15 },
  secondaryBtn: { padding: spacing.md, alignItems: 'center' },
  secondaryText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  forgotBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  forgotText: { color: colors.brand, fontSize: 13, fontWeight: '600' },
});
