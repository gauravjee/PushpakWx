import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { spacing, radius, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function UsageCapModal({ visible, onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemoStyles(colors);
  const router = useRouter();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card} testID="usage-cap-modal">
          <View style={styles.icon}>
            <Ionicons name="lock-closed-outline" size={28} color={colors.brand} />
          </View>
          <Text style={styles.title}>You've used your 5 free searches</Text>
          <Text style={styles.body}>
            Sign up free to keep searching — plus save flights to your logbook.
          </Text>
          <Pressable
            testID="cap-modal-register"
            onPress={() => { onClose(); router.push('/auth/register'); }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>CREATE FREE ACCOUNT</Text>
          </Pressable>
          <Pressable
            testID="cap-modal-login"
            onPress={() => { onClose(); router.push('/auth/login'); }}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>I ALREADY HAVE ONE</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function useMemoStyles(colors: ColorPalette) {
  return React.useMemo(() => StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 360, alignItems: 'center' },
    icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
    title: { color: colors.onSurface, fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: spacing.sm },
    body: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: spacing.lg },
    primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 14, width: '100%', alignItems: 'center' },
    primaryBtnText: { color: '#000', fontWeight: '800', letterSpacing: 1, fontSize: 13 },
    secondaryBtn: { marginTop: spacing.sm, borderRadius: radius.md, paddingVertical: 14, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    secondaryBtnText: { color: colors.onSurface, fontWeight: '800', letterSpacing: 1, fontSize: 13 },
  }), [colors]);
}
