/**
 * Account creation screen. Shares the same card layout as login.tsx —
 * see that file's header comment for the cross-app dimension note.
 */
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

const noOutline: any = { outlineStyle: 'none' }; // see login.tsx for why this exists

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (!email || !password) {
      setErr('Email and password are required');
      return;
    }
    // Mirrors the backend's own minimum-length check (see reset_password
    // in server.py) so the user sees the error immediately rather than
    // waiting on a round trip for something checkable client-side.
    if (password.length < 6) {
      setErr('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await register(email.trim(), password, fullName.trim() || undefined);
      // Registration always requires OTP verification before the account
      // is usable — route straight there rather than back to login.
      router.replace({ pathname: '/auth/verify-email', params: { email: res.email } });
    } catch (e: any) {
      setErr(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap} testID="register-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Image source={require('../../assets/images/icon.png')} style={styles.logo} contentFit="contain" />
            <Text style={styles.brand}>PushpakWx</Text>
            <Text style={styles.tag}>Create your account</Text>

            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              testID="register-name-input"
              style={[styles.input, noOutline, nameFocused && styles.inputFocused]}
              placeholderTextColor={colors.onSurfaceTertiary}
              value={fullName}
              onChangeText={setFullName}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="register-email-input"
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
                testID="register-password-input"
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
            {err ? <Text style={styles.err} testID="register-error">{err}</Text> : null}
            <Pressable
              testID="register-submit-button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>CREATE ACCOUNT</Text>}
            </Pressable>
            <Link href="/auth/login" asChild>
              <Pressable testID="go-to-login-button" style={styles.secondaryBtn}>
                <Text style={styles.linkText}>Already have an account? Sign in</Text>
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
  inputFocused: { borderColor: colors.brand }, // see login.tsx re: focus tracking
  passwordWrap: { width: '100%', position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 }, // leaves room for the eye icon
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
  secondaryBtn: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.onSurfaceSecondary, fontSize: 13, textDecorationLine: 'underline' },
});
