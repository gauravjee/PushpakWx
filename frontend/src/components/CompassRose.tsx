import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/theme';
import { windDirLabel } from '@/src/utils/weather';

/**
 * Big digital compass rose. The dial rotates so the current heading
 * is under the fixed top marker (heading-up style).
 */
export function CompassRose({ heading, size = 260 }: { heading: number; size?: number }) {
  const half = size / 2;
  const inner = size - 30;

  // Cardinal labels rendered on the ROTATING dial (positioned at 0,90,180,270 of dial)
  const cardinals = [
    { label: 'N', angle: 0, color: colors.brand },
    { label: 'E', angle: 90, color: colors.onSurfaceSecondary },
    { label: 'S', angle: 180, color: colors.onSurfaceSecondary },
    { label: 'W', angle: 270, color: colors.onSurfaceSecondary },
  ];

  return (
    <View testID="compass-rose" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer ring */}
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]} />
      {/* Rotating dial */}
      <View
        style={{
          position: 'absolute',
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          transform: [{ rotate: `${-heading}deg` }],
        }}
      >
        {/* Cardinal letters positioned on the dial */}
        {cardinals.map(c => {
          const rad = (c.angle * Math.PI) / 180;
          const r = inner / 2 - 20;
          const x = inner / 2 + r * Math.sin(rad) - 12;
          const y = inner / 2 - r * Math.cos(rad) - 14;
          return (
            <Text
              key={c.label}
              style={[
                styles.cardinal,
                {
                  left: x,
                  top: y,
                  color: c.color,
                  transform: [{ rotate: `${c.angle}deg` }],
                },
              ]}
            >
              {c.label}
            </Text>
          );
        })}
        {/* Tick marks every 30 deg */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = i * 30;
          const isMajor = angle % 90 === 0;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: 2,
                height: isMajor ? 14 : 8,
                backgroundColor: isMajor ? colors.brand : colors.borderStrong,
                top: 4,
                left: inner / 2 - 1,
                transformOrigin: `1px ${inner / 2 - 4}px`,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}
        {/* Degrees minor every 10 deg */}
        {Array.from({ length: 36 }).map((_, i) => {
          const angle = i * 10;
          if (angle % 30 === 0) return null;
          return (
            <View
              key={`m${i}`}
              style={{
                position: 'absolute',
                width: 1,
                height: 5,
                backgroundColor: colors.borderStrong,
                top: 4,
                left: inner / 2 - 0.5,
                transformOrigin: `0.5px ${inner / 2 - 4}px`,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}
      </View>

      {/* Fixed top marker (arrow pointing down at the heading value) */}
      <View style={[styles.topMarker, { top: half - inner / 2 - 4 }]} />

      {/* Center readout */}
      <View style={[styles.center, { pointerEvents: 'none' }]}>
        <Text style={styles.heading}>{Math.round(heading).toString().padStart(3, '0')}°</Text>
        <Text style={styles.dir}>{windDirLabel(heading)}</Text>
        <Text style={styles.mag}>MAG</Text>
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
  cardinal: {
    position: 'absolute',
    width: 24,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 16,
  },
  topMarker: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.brand,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { color: colors.onSurface, fontSize: 44, fontWeight: '800', letterSpacing: 2 },
  dir: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: '700', marginTop: 2 },
  mag: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 2, marginTop: 2 },
});
