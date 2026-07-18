import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '@/src/theme';
import { windDirLabel } from '@/src/utils/weather';

type Props = {
  direction: number;   // degrees 0-360
  speed: number;       // converted (already in user unit)
  gust?: number | null;
  unitLabel: string;
  size?: number;
};

export function WindRose({ direction, speed, gust, unitLabel, size = 220 }: Props) {
  const half = size / 2;
  const outer = size;
  const inner = size - 24;
  return (
    <View testID="wind-rose" style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer ring */}
      <View style={[styles.ring, { width: outer, height: outer, borderRadius: outer / 2 }]} />
      {/* Inner ring */}
      <View style={[styles.ringInner, { width: inner, height: inner, borderRadius: inner / 2, position: 'absolute' }]} />
      {/* Cardinal markers */}
      {(['N', 'E', 'S', 'W'] as const).map((c, i) => {
        const angle = i * 90;
        const rad = (angle * Math.PI) / 180;
        const r = half - 6;
        const x = half + r * Math.sin(rad) - 8;
        const y = half - r * Math.cos(rad) - 10;
        return (
          <Text
            key={c}
            style={[styles.cardinal, { left: x, top: y, color: c === 'N' ? colors.brand : colors.onSurfaceSecondary }]}
          >
            {c}
          </Text>
        );
      })}
      {/* Tick marks every 30 deg */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = i * 30;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: 2,
              height: 8,
              backgroundColor: colors.borderStrong,
              top: half - inner / 2 + 2,
              left: half - 1,
              transform: [
                { translateY: 0 },
                { rotate: `${angle}deg` },
                { translateY: -(inner / 2 - 8) },
              ],
            }}
          />
        );
      })}
      {/* Direction arrow (points FROM wind coming from — i.e., barb points to origin direction) */}
      <View
        style={{
          position: 'absolute',
          width: 4,
          height: inner - 40,
          backgroundColor: colors.brand,
          borderRadius: 4,
          transform: [{ rotate: `${direction}deg` }],
          pointerEvents: 'none',
        }}
      />
      {/* Arrow head at N-side of stick, so rotate group */}
      <View
        style={{
          position: 'absolute',
          transform: [{ rotate: `${direction}deg` }],
          alignItems: 'center',
          justifyContent: 'flex-start',
          height: inner - 40,
          pointerEvents: 'none',
        }}
      >
        <View style={styles.arrowHead} />
      </View>
      {/* Center readout */}
      <View style={[styles.center, { pointerEvents: 'none' }]}>
        <Text style={styles.speed}>{Math.round(speed)}</Text>
        <Text style={styles.unit}>{unitLabel}</Text>
        <Text style={styles.dir}>{windDirLabel(direction)} · {Math.round(direction)}°</Text>
        {gust != null && gust > 0 ? (
          <Text style={styles.gust}>G {Math.round(gust)}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  ringInner: {
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cardinal: {
    position: 'absolute',
    width: 16,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.brand,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  speed: { color: colors.onSurface, fontSize: 44, fontWeight: '800', lineHeight: 48 },
  unit: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1 },
  dir: { color: colors.onSurface, fontSize: 14, marginTop: 4, fontWeight: '600' },
  gust: { color: colors.warning, fontSize: 13, marginTop: 2, fontWeight: '700' },
});
