import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/src/theme';
import {
  convertWind,
  convertTemp,
  weatherCodeInfo,
  windDirLabel,
} from '@/src/utils/weather';
import { Prefs as UserPrefs } from '@/src/api/client';

type Props = {
  hours: {
    time: string;
    temp: number;
    wind: number;
    windDir: number;
    gust: number;
    weatherCode: number;
    precip: number;
    cloud: number;
  }[];
  prefs: UserPrefs;
};

export function HourlyStrip({ hours, prefs }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
      testID="hourly-strip"
    >
      {hours.map((h, idx) => {
        const info = weatherCodeInfo(h.weatherCode);
        const d = new Date(h.time);
        const hourLabel = d.getHours().toString().padStart(2, '0') + ':00';
        const isNow = idx === 0;
        return (
          <View
            key={h.time}
            testID={`hour-item-${idx}`}
            style={[styles.card, isNow && styles.cardNow]}
          >
            <Text style={styles.hour}>{isNow ? 'NOW' : hourLabel}</Text>
            <Ionicons name={info.icon as any} size={22} color={info.isStorm ? colors.warning : colors.brand} />
            <Text style={styles.temp}>
              {Math.round(convertTemp(h.temp, prefs.temp_unit))}°
            </Text>
            <View style={styles.windRow}>
              <Ionicons
                name="navigate"
                size={12}
                color={colors.onSurfaceSecondary}
                style={{ transform: [{ rotate: `${h.windDir + 180}deg` }] }}
              />
              <Text style={styles.wind}>{Math.round(convertWind(h.wind, prefs.wind_unit))}</Text>
            </View>
            {h.gust > h.wind + 3 ? (
              <Text style={styles.gust}>G{Math.round(convertWind(h.gust, prefs.wind_unit))}</Text>
            ) : (
              <Text style={styles.gustPlaceholder}>·</Text>
            )}
            <Text style={styles.dir}>{windDirLabel(h.windDir)}</Text>
            {h.precip > 0 ? (
              <Text style={styles.precip}>{h.precip.toFixed(1)}mm</Text>
            ) : (
              <Text style={styles.cloud}>{Math.round(h.cloud)}%</Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 78,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  cardNow: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },
  hour: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  temp: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  windRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  wind: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  gust: { color: colors.warning, fontSize: 11, fontWeight: '700' },
  gustPlaceholder: { color: 'transparent', fontSize: 11 },
  dir: { color: colors.onSurfaceSecondary, fontSize: 10 },
  precip: { color: colors.info, fontSize: 10, fontWeight: '600' },
  cloud: { color: colors.onSurfaceTertiary, fontSize: 10 },
});
