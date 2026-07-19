import { useMemo } from 'react';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlightCategory, categoryColor } from '@/src/utils/weather';
import { radius, spacing, ColorPalette} from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';

export function FlightConditionBadge({ category, size = 'md' }: { category: FlightCategory; size?: 'sm' | 'md' | 'lg' }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const color = categoryColor(category);
  const s = size === 'lg' ? styles.lg : size === 'sm' ? styles.sm : styles.md;
  const t = size === 'lg' ? 20 : size === 'sm' ? 11 : 14;
  return (
    <View
      testID={`flight-cat-badge-${category}`}
      style={[styles.badge, s, { backgroundColor: color + '22', borderColor: color }]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color, fontSize: t }]}>{category}</Text>
    </View>
  );
}
const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    gap: 6,
  },
  sm: { paddingHorizontal: spacing.sm, paddingVertical: 3 },
  md: { paddingHorizontal: spacing.md, paddingVertical: 5 },
  lg: { paddingHorizontal: spacing.lg, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  text: { fontWeight: '700', letterSpacing: 1 },
});
