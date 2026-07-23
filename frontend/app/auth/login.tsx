import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Link } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/context/AuthContext';

// Web-only: suppresses the browser's native focus ring (a separate `outline`
// from `border`), which would otherwise stay blue regardless of our custom
// border-color-on-focus styling below. StyleSheet.create's types don't
// recognize this RN-Web-specific property, so it's kept separate and cast.
const noOutline: any = { outlineStyle: 'none' };

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Image source={require('../../assets/images/icon.png')} style={styles.logo} contentFit="contain" />
            <Text style={styles.brand}>PushpakWx</Text>
            <Text style={styles.tag}>Sign in to your account</Text>

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="login-email-input"
              style={[styles.input, noOutline, emailFocused && styles.inputFocused]}
              placeholderTextColor={colors.onSurfaceTertiary}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                testID="login-password-input"
                style={[styles.input, styles.passwordInput, noOutline, passwordFocused && styles.inputFocused]}
                placeholderTextColor={colors.onSurfaceTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                secureTextEntry={!showPassword}
              />
              <Pressable
                testID="toggle-password-visibility"
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.onSurfaceTertiary}
                />
              </Pressable>
            </View>
            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
            <Pressable
              testID="login-submit-button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>SIGN IN</Text>}
            </Pressable>
            <View style={styles.linkRow}>
              <Link href="/auth/forgot-password" asChild>
                <Pressable testID="forgot-password-link">
                  <Text style={styles.linkText}>Forgot password?</Text>
                </Pressable>
              </Link>
              <Link href="/auth/register" asChild>
                <Pressable testID="go-to-register-button">
                  <Text style={styles.linkText}>Create account</Text>
                </Pressable>
              </Link>
            </View>
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
  logo: { width: 56, height: 56, borderRadius: 14, marginBottom: 16 },
  brand: { color: colors.onSurface, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  tag: { color: colors.onSurfaceSecondary, fontSize: 13, marginBottom: 28, textAlign: 'center' },
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
  inputFocused: {
    borderColor: colors.brand,
  },
  passwordWrap: { width: '100%', position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeBtn: { position: 'absolute', right: 12 },
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
  linkRow: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: spacing.lg,
  },
  linkText: { color: colors.onSurfaceSecondary, fontSize: 13, textDecorationLine: 'underline' },
});
