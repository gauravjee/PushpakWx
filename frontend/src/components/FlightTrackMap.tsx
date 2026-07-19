import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, ColorPalette } from '@/src/theme';
import { useThemeColors } from '@/src/context/ThemeContext';
import { windDirLabel } from '@/src/utils/weather';
import { TILE_SIZE, latLonToWorldPixel, computeFitZoom } from '@/src/utils/mapTiles';

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

const MIN_ZOOM = 4;
const MAX_ZOOM = 15;

/**
 * Flight track "moving map" — real OpenStreetMap tiles under the flight
 * path, auto-zoomed to fit whatever was actually flown (tight for a 4nm
 * circuit, wide for a 250nm cross-country), with manual +/- override.
 *
 * Tiles are fetched via expo-image, which caches them to disk
 * automatically — once a tile has loaded, it's available offline from
 * then on. If a tile can't load (no signal, never cached), it's simply
 * left blank; the flight path and grid still render on top regardless,
 * so a lost connection never breaks the view, just the map imagery.
 */
export function FlightTrackMap({ samples, height = 260 }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [zoomOverride, setZoomOverride] = useState<number | null>(null);

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
  const pad = 20;

  const lats = valid.map(s => s.lat);
  const lons = valid.map(s => s.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  const autoZoom = computeFitZoom(minLat, minLon, maxLat, maxLon, width - pad * 2, height - pad * 2, MIN_ZOOM, MAX_ZOOM);
  const zoom = zoomOverride ?? autoZoom;

  // Project everything into world-pixel space at the chosen zoom, then
  // offset so the track's center sits in the middle of our viewport.
  const centerPx = latLonToWorldPixel(centerLat, centerLon, zoom);
  const originX = centerPx.x - width / 2;
  const originY = centerPx.y - height / 2;

  const projX = (lon: number) => latLonToWorldPixel(centerLat, lon, zoom).x - originX;
  const projY = (lat: number) => latLonToWorldPixel(lat, centerLon, zoom).y - originY;

  const points = valid.map(s => `${projX(s.lon).toFixed(1)},${projY(s.lat).toFixed(1)}`).join(' ');
  const start = valid[0];
  const now = valid[valid.length - 1];

  // Approx span in nm for the footer label (haversine-ish, good enough for display)
  const kmPerLat = 111.32;
  const kmPerLon = 111.32 * Math.cos((centerLat * Math.PI) / 180);
  const spanKm = Math.max((maxLat - minLat) * kmPerLat, (maxLon - minLon) * kmPerLon);
  const spanNm = spanKm * 0.539957;
  const scaleLabel = spanNm >= 1 ? `${spanNm.toFixed(1)} nm span` : `${(spanNm * 1000).toFixed(0)} m span`;

  // Which tiles cover the viewport at this zoom/origin
  const tiles: { tx: number; ty: number; left: number; top: number }[] = [];
  const firstTx = Math.floor(originX / TILE_SIZE);
  const firstTy = Math.floor(originY / TILE_SIZE);
  const lastTx = Math.floor((originX + width) / TILE_SIZE);
  const lastTy = Math.floor((originY + height) / TILE_SIZE);
  const maxTileIndex = Math.pow(2, zoom) - 1;
  for (let tx = firstTx; tx <= lastTx; tx++) {
    for (let ty = firstTy; ty <= lastTy; ty++) {
      if (tx < 0 || ty < 0 || tx > maxTileIndex || ty > maxTileIndex) continue;
      tiles.push({ tx, ty, left: tx * TILE_SIZE - originX, top: ty * TILE_SIZE - originY });
    }
  }

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

      <View style={[styles.mapFrame, { width, height }]}>
        {/* Base tile layer — cached to disk by expo-image once loaded */}
        {tiles.map(t => (
          <Image
            key={`${zoom}/${t.tx}/${t.ty}`}
            source={{
              uri: `https://tile.openstreetmap.org/${zoom}/${t.tx}/${t.ty}.png`,
              headers: { 'User-Agent': 'PushpakWX/1.1 (aviation training app)' },
            }}
            style={{ position: 'absolute', left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE }}
            cachePolicy="disk"
            recyclingKey={`${zoom}/${t.tx}/${t.ty}`}
          />
        ))}

        <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
          <Polyline
            points={points}
            fill="none"
            stroke={colors.brand}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Circle cx={projX(start.lon)} cy={projY(start.lat)} r={7} fill={colors.success} stroke="#000" strokeWidth={2} />
          <SvgText x={projX(start.lon) + 10} y={projY(start.lat) - 8} fill={colors.success} fontSize={10} fontWeight="bold">S</SvgText>
          <Circle cx={projX(now.lon)} cy={projY(now.lat)} r={8} fill={colors.brand} stroke="#000" strokeWidth={2} />
          <Circle cx={projX(now.lon)} cy={projY(now.lat)} r={14} fill="none" stroke={colors.brand} strokeWidth={1} opacity={0.4} />
        </Svg>

        {/* Zoom controls */}
        <View style={styles.zoomControls}>
          <Pressable
            testID="map-zoom-in"
            style={styles.zoomBtn}
            onPress={() => setZoomOverride(Math.min(MAX_ZOOM, zoom + 1))}
          >
            <Ionicons name="add" size={16} color={colors.onSurface} />
          </Pressable>
          <Pressable
            testID="map-zoom-out"
            style={styles.zoomBtn}
            onPress={() => setZoomOverride(Math.max(MIN_ZOOM, zoom - 1))}
          >
            <Ionicons name="remove" size={16} color={colors.onSurface} />
          </Pressable>
          {zoomOverride != null && (
            <Pressable testID="map-zoom-fit" style={styles.zoomBtn} onPress={() => setZoomOverride(null)}>
              <Ionicons name="scan-outline" size={15} color={colors.brand} />
            </Pressable>
          )}
        </View>

        <Text style={styles.attribution}>© OpenStreetMap</Text>
      </View>

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

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
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
  mapFrame: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  zoomControls: {
    position: 'absolute',
    right: 8,
    top: 8,
    gap: 6,
  },
  zoomBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary + 'E6',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attribution: {
    position: 'absolute',
    left: 4,
    bottom: 2,
    fontSize: 8,
    color: colors.onSurfaceTertiary,
    backgroundColor: colors.surfaceSecondary + 'B3',
    paddingHorizontal: 3,
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
