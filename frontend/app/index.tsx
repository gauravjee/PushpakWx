import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/theme';

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace('/(tabs)/dashboard');
    else router.replace('/auth/login');
  }, [user, loading, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <Text style={styles.title}>PUSHPAK</Text>
      <Text style={styles.subtitle}>WEATHER</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.onSurface, fontSize: 42, fontWeight: '800', letterSpacing: 6 },
  subtitle: { color: colors.brand, fontSize: 20, fontWeight: '600', letterSpacing: 8, marginTop: 4 },
});
