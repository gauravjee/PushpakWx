import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { spacing, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { windDirLabel } from '@/src/utils/weather';

type Props = {
  direction: number;   // degrees 0-360
  speed: number;       // converted (already in user unit)
  gust?: number | null;
  unitLabel: string;
  size?: number;
};

/**
 * Wind direction dial, styled to match CompassRose's instrument-panel look
 * (dark gauge face, brand-colored ticks/N marker) so the WX tab and InFlight
 * tab feel like the same instrument family. Unlike CompassRose (which
 * rotates the whole dial heading-up), the ring here stays fixed — north is
 * always up — and only the direction arrow rotates, since this shows wind
 * direction relative to true/mag north, not aircraft heading.
 */
export function WindRose({ direction, speed, gust, unitLabel, size = 240 }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const inner = size - 30;
  const arrowW = Math.max(18, inner * 0.13);
  const arrowH = Math.max(26, inner * 0.22);

  const cardinals = [
    { label: 'N', angle: 0, color: colors.brand },
    { label: 'E', angle: 90, color: '#C7CCD1' },
    { label: 'S', angle: 180, color: '#C7CCD1' },
    { label: 'W', angle: 270, color: '#C7CCD1' },
  ];

  return (
    <View testID="wind-rose" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: size / 2 }}>
      {/* Outer ring (fixed dark gauge face, matches CompassRose) */}
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]} />

      {/* Fixed dial: cardinal letters + tick marks (north stays up) */}
      <View style={{ position: 'absolute', width: inner, height: inner, borderRadius: inner / 2 }}>
        {cardinals.map((c) => {
          const rad = (c.angle * Math.PI) / 180;
          const r = inner / 2 - 20;
          const x = inner / 2 + r * Math.sin(rad) - 12;
          const y = inner / 2 - r * Math.cos(rad) - 14;
          return (
            <Text
              key={c.label}
              style={[styles.cardinal, { left: x, top: y, color: c.color }]}
            >
              {c.label}
            </Text>
          );
        })}
        {/* Major ticks every 30deg */}
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
                backgroundColor: isMajor ? colors.brand : '#5A6068',
                top: 4,
                left: inner / 2 - 1,
                transformOrigin: `1px ${inner / 2 - 4}px`,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}
        {/* Minor ticks every 10deg */}
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
                backgroundColor: '#5A6068',
                top: 4,
                left: inner / 2 - 0.5,
                transformOrigin: `0.5px ${inner / 2 - 4}px`,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}
      </View>

      {/* Direction arrow — this is the part that rotates. A two-tone
          navigation-arrow shape (SVG, so it renders identically on web
          and the Android app), kept confined to the outer ring so it
          never overlaps the digital readout sitting in the center hub. */}
      <View
        style={{
          position: 'absolute',
          width: inner,
          height: inner,
          transform: [{ rotate: `${direction}deg` }],
          pointerEvents: 'none',
        }}
      >
        <Svg
          width={arrowW}
          height={arrowH}
          viewBox={`0 0 ${arrowW} ${arrowH}`}
          style={{ position: 'absolute', top: 14, left: inner / 2 - arrowW / 2 }}
        >
          <Polygon
            points={`${arrowW / 2},0 ${arrowW / 2},${arrowH * 0.72} 0,${arrowH}`}
            fill={colors.brand}
            fillOpacity={0.6}
          />
          <Polygon
            points={`${arrowW / 2},0 ${arrowW},${arrowH} ${arrowW / 2},${arrowH * 0.72}`}
            fill={colors.brand}
          />
        </Svg>
      </View>

      {/* Center readout (stays upright, doesn't rotate) */}
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

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  ring: {
    borderWidth: 2,
    borderColor: colors.brand + '55',
    backgroundColor: '#0A0C0E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  cardinal: {
    position: 'absolute',
    width: 24,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 16,
  },
  center: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speed: { color: '#FFFFFF', fontSize: 40, fontWeight: '800', lineHeight: 44 },
  unit: { color: '#C7CCD1', fontSize: 12, letterSpacing: 1 },
  dir: { color: '#FFFFFF', fontSize: 13, marginTop: 4, fontWeight: '600' },
  gust: { color: colors.warning, fontSize: 13, marginTop: 2, fontWeight: '700' },
});
