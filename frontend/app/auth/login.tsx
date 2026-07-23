import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, Link } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/context/AuthContext';

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
              style={styles.input}
              placeholderTextColor={colors.onSurfaceTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
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
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    borderTopColor: colors.brand,
    padding: spacing.xl,
    alignItems: 'center',
  },
  logo: { width: 56, height: 56, borderRadius: 14, marginBottom: spacing.md },
  brand: { color: colors.onSurface, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  tag: { color: colors.onSurfaceSecondary, fontSize: 13, marginBottom: spacing.xl, textAlign: 'center' },
  label: {
    alignSelf: 'flex-start', color: colors.onSurfaceTertiary, fontSize: 11,
    letterSpacing: 1, marginBottom: 6, marginTop: spacing.md,
  },
  input: {
    width: '100%',
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
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

