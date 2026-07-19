import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';

type Props = {
  visible: boolean;
  onAcknowledge: () => void;
};

/**
 * Full-screen safety disclaimer shown once per app session, right after
 * login. Covers the majority of the screen deliberately — this is a
 * safety-critical notice, not a dismissible tooltip.
 */
export function SafetyDisclaimer({ visible, onAcknowledge }: Props) {
  const colors = useThemeColors();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="safety-disclaimer">
          <View style={styles.iconWrap}>
            <Ionicons name="warning-outline" size={32} color={colors.warning} />
          </View>
          <Text style={styles.title}>Not for primary navigation</Text>
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <Text style={styles.text}>
              PushpakWx is a flight tracking and weather reference tool. It is not a certified
              navigation device and must not be used as your primary means of navigation, terrain
              or obstacle avoidance, or traffic separation.
            </Text>
            <Text style={[styles.text, { marginTop: spacing.md }]}>
              Always rely on your aircraft's certified instruments, current official charts, and
              appropriate ATC services for navigation and separation.
            </Text>
            <Text style={[styles.text, { marginTop: spacing.md }]}>
              Weather, GPS position, and altitude data shown in this app may be delayed, incomplete,
              or inaccurate. Always cross-check with official sources before and during flight.
            </Text>
          </ScrollView>
          <Pressable testID="acknowledge-disclaimer-button" onPress={onAcknowledge} style={styles.button}>
            <Text style={styles.buttonText}>I UNDERSTAND</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    minHeight: '62%',
    maxHeight: '80%',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning + '55',
    padding: spacing.lg,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.warning + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    flex: 1,
    width: '100%',
  },
  text: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: colors.onBrandPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
