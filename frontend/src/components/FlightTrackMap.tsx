import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { colors, radius, spacing } from '@/src/theme';
import { windDirLabel } from '@/src/utils/weather';

export type TrackSample = {
  t: number;
  lat: number;
  lon: number;
  altFt: number;
  speedKt: number;
  heading?: number;
};

type Props = {
  samples: TrackSample[];
  height?: number;
};

/**
 * Simple SVG-based flight track visualization ("moving map" style).
 * - Auto-fits samples to view with padding
 * - Draws polyline of the flight path
 * - Renders start marker (green), waypoints (dots), current position (orange arrow)
 * - Grid overlay for orientation
 */
export function FlightTrackMap({ samples, height = 260 }: Props) {
  const valid = samples.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  if (valid.length < 2) {
    return (
      <View style={[styles.emptyBox, { height }]} testID="flight-track-map-empty">
        <Text style={styles.emptyText}>
          {valid.length === 0 ? 'Waiting for GPS fix…' : 'Move to build track…'}
        </Text>
      </View>
    );
  }

  const width = 340;
  const pad = 16;

  const lats = valid.map(s => s.lat);
  const lons = valid.map(s => s.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Preserve aspect ratio using average latitude for longitude scale.
  const avgLat = (minLat + maxLat) / 2;
  const kmPerLat = 111.32;
  const kmPerLon = 111.32 * Math.cos((avgLat * Math.PI) / 180);

  const spanLatKm = Math.max(0.02, (maxLat - minLat) * kmPerLat);
  const spanLonKm = Math.max(0.02, (maxLon - minLon) * kmPerLon);

  const scale = Math.min(
    (width - pad * 2) / spanLonKm,
    (height - pad * 2) / spanLatKm,
  );

  const projX = (lon: number) => pad + ((lon - minLon) * kmPerLon) * scale + ((width - pad * 2) - spanLonKm * scale) / 2;
  const projY = (lat: number) => pad + ((maxLat - lat) * kmPerLat) * scale + ((height - pad * 2) - spanLatKm * scale) / 2;

  const points = valid.map(s => `${projX(s.lon).toFixed(1)},${projY(s.lat).toFixed(1)}`).join(' ');

  const start = valid[0];
  const now = valid[valid.length - 1];

  // Bounding box in km for scale display
  const totalKm = Math.max(spanLatKm, spanLonKm);
  const scaleLabel = totalKm >= 10 ? `${totalKm.toFixed(0)} km span` : `${totalKm.toFixed(1)} km span`;

  return (
    <View style={styles.mapWrap} testID="flight-track-map">
      <View style={styles.mapHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={styles.legendDotStart} />
          <Text style={styles.legendText}>START</Text>
          <View style={[styles.legendDotStart, { backgroundColor: colors.brand, marginLeft: spacing.sm }]} />
          <Text style={styles.legendText}>NOW</Text>
        </View>
        <Text style={styles.mapScale}>{scaleLabel}</Text>
      </View>
      <Svg width={width} height={height} style={styles.svg}>
        {/* Grid */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = (height / 4) * i;
          return <SvgLine key={`gh${i}`} x1={0} y1={y} x2={width} y2={y} stroke={colors.divider} strokeWidth={1} />;
        })}
        {Array.from({ length: 6 }).map((_, i) => {
          const x = (width / 5) * i;
          return <SvgLine key={`gv${i}`} x1={x} y1={0} x2={x} y2={height} stroke={colors.divider} strokeWidth={1} />;
        })}
        {/* Track polyline */}
        <Polyline
          points={points}
          fill="none"
          stroke={colors.brand}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Start marker */}
        <Circle cx={projX(start.lon)} cy={projY(start.lat)} r={7} fill={colors.success} stroke="#000" strokeWidth={2} />
        <SvgText x={projX(start.lon) + 10} y={projY(start.lat) - 8} fill={colors.success} fontSize={10} fontWeight="bold">S</SvgText>
        {/* Current position */}
        <Circle cx={projX(now.lon)} cy={projY(now.lat)} r={8} fill={colors.brand} stroke="#000" strokeWidth={2} />
        <Circle cx={projX(now.lon)} cy={projY(now.lat)} r={14} fill="none" stroke={colors.brand} strokeWidth={1} opacity={0.4} />
      </Svg>

      <View style={styles.mapFooter}>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>SAMPLES</Text>
          <Text style={styles.footerValue}>{valid.length}</Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>DURATION</Text>
          <Text style={styles.footerValue}>{formatDuration(now.t - start.t)}</Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>HDG</Text>
          <Text style={styles.footerValue}>
            {now.heading != null ? `${Math.round(now.heading).toString().padStart(3, '0')}° ${windDirLabel(now.heading)}` : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

const styles = StyleSheet.create({
  mapWrap: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  legendDotStart: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  legendText: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  mapScale: { color: colors.onSurfaceTertiary, fontSize: 10 },
  svg: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
  },
  mapFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  footerItem: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    padding: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  footerLabel: { color: colors.onSurfaceTertiary, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  footerValue: { color: colors.onSurface, fontSize: 12, fontWeight: '700', marginTop: 2 },
  emptyBox: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 12 },
});
