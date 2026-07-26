import { ColorPalette } from '@/src/theme';
import { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useThemeColors } from '@/src/context/ThemeContext';
import { isDeviceVerifiedLocally } from '@/src/utils/anonymousAccess';
import { TurnstileVerification } from '@/src/components/TurnstileVerification';

export default function Index() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, loading } = useAuth();
  const router = useRouter();
  // null = still checking; true/false once known. Only relevant when
  // there's no logged-in user — a real account never needs Turnstile.
  const [deviceVerified, setDeviceVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading || user) return;
    isDeviceVerifiedLocally().then(setDeviceVerified);
  }, [loading, user]);

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace('/(tabs)/dashboard');
      return;
    }
    // Anonymous, but only once we know the device is already verified —
    // if it's not, we stay on this screen and show the Turnstile check
    // below instead of navigating away.
    if (deviceVerified === true) {
      router.replace('/(tabs)/dashboard');
    }
  }, [user, loading, deviceVerified, router]);

  if (!loading && !user && deviceVerified === false) {
    return (
      <TurnstileVerification
        onVerified={() => router.replace('/(tabs)/dashboard')}
        // If verification fails (or Turnstile isn't provisioned yet — see
        // the component's own fail-open note), don't strand someone on a
        // dead screen — fall back to requiring login the old way, which
        // is always a safe, working path regardless of Turnstile's state.
        onError={() => router.replace('/auth/login')}
      />
    );
  }

  return (
    <View style={styles.container} testID="splash-screen">
      <Text style={styles.title}>PUSHPAK</Text>
      <Text style={styles.subtitle}>WEATHER</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.onSurface, fontSize: 42, fontWeight: '800', letterSpacing: 6 },
  subtitle: { color: colors.brand, fontSize: 20, fontWeight: '600', letterSpacing: 8, marginTop: 4 },
});
