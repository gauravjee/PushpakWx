import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { convertWind, windUnitLabel } from '@/src/utils/weather';

type Props = {
  windDirDeg: number;
  windSpeedKt: number;
  gustKt?: number | null;
  unit: 'kt' | 'kmh' | 'mph';
};

/**
 * Runway wind component calculator.
 * User enters a runway designator (e.g. "27" -> 270°) or an arbitrary heading.
 * Computes headwind/tailwind + crosswind components.
 */
export function WindComponentCalc({ windDirDeg, windSpeedKt, gustKt, unit }: Props) {
  const [rwyText, setRwyText] = useState('27');

  const rwyHeading = useMemo(() => {
    const n = parseInt(rwyText, 10);
    if (isNaN(n)) return null;
    // Support "27" (=270°) up to "36"; also raw degree entry 0-360
    if (n >= 1 && n <= 36) return (n * 10) % 360;
    if (n >= 0 && n <= 360) return n;
    return null;
  }, [rwyText]);

  const components = useMemo(() => {
    if (rwyHeading == null) return null;
    // Wind direction is where wind is coming FROM.
    const rel = (((windDirDeg - rwyHeading) % 360) + 360) % 360; // 0..360
    const relRad = (rel * Math.PI) / 180;
    const hw = windSpeedKt * Math.cos(relRad); // + head, - tail
    const xwSigned = windSpeedKt * Math.sin(relRad); // + right, - left
    const xw = Math.abs(xwSigned);
    const gustHw = gustKt != null ? gustKt * Math.cos(relRad) : null;
    const gustXw = gustKt != null ? Math.abs(gustKt * Math.sin(relRad)) : null;
    return { hw, xw, xwSigned, gustHw, gustXw, rel };
  }, [rwyHeading, windDirDeg, windSpeedKt, gustKt]);

  const bumpRwy = (delta: number) => {
    const cur = parseInt(rwyText, 10);
    if (isNaN(cur)) return;
    let next = cur + delta;
    if (cur >= 1 && cur <= 36) {
      if (next < 1) next = 36;
      if (next > 36) next = 1;
    }
    setRwyText(next.toString());
  };

  return (
    <View style={styles.card} testID="wind-component-card">
      <View style={styles.headerRow}>
        <Text style={styles.title}>RUNWAY WIND</Text>
        <View style={styles.rwyRow}>
          <Pressable
            testID="rwy-dec"
            onPress={() => bumpRwy(-1)}
            style={styles.stepBtn}
          >
            <Ionicons name="remove" size={16} color={colors.brand} />
          </Pressable>
          <View style={styles.rwyInputWrap}>
            <Text style={styles.rwyPrefix}>RWY</Text>
            <TextInput
              testID="rwy-input"
              style={styles.rwyInput}
              value={rwyText}
              onChangeText={t => setRwyText(t.replace(/[^0-9]/g, '').slice(0, 3))}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
            />
          </View>
          <Pressable
            testID="rwy-inc"
            onPress={() => bumpRwy(1)}
            style={styles.stepBtn}
          >
            <Ionicons name="add" size={16} color={colors.brand} />
          </Pressable>
        </View>
      </View>

      {rwyHeading == null || !components ? (
        <Text style={styles.error}>Enter a runway (1–36) or heading (0–360)</Text>
      ) : (
        <>
          <View style={styles.headingLabel}>
            <Text style={styles.headingText}>Heading {rwyHeading.toString().padStart(3, '0')}°</Text>
            <Text style={styles.relText}>Wind {Math.round(components.rel)}° off nose</Text>
          </View>
          <View style={styles.grid}>
            <Component
              testID="wind-comp-headwind"
              label={components.hw >= 0 ? 'HEADWIND' : 'TAILWIND'}
              value={Math.abs(components.hw)}
              gust={components.gustHw != null ? Math.abs(components.gustHw) : null}
              unit={unit}
              accent={components.hw >= 0 ? colors.success : colors.warning}
              icon={components.hw >= 0 ? 'arrow-down' : 'arrow-up'}
            />
            <Component
              testID="wind-comp-crosswind"
              label={`CROSSWIND ${components.xwSigned >= 0 ? '→R' : '←L'}`}
              value={components.xw}
              gust={components.gustXw}
              unit={unit}
              accent={components.xw > 15 ? colors.error : components.xw > 10 ? colors.warning : colors.info}
              icon={components.xwSigned >= 0 ? 'arrow-forward' : 'arrow-back'}
            />
          </View>
          {components.xw > 15 && (
            <View style={styles.warn}>
              <Ionicons name="warning" size={14} color={colors.error} />
              <Text style={styles.warnText}>High crosswind — check aircraft demonstrated limit</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Component({
  label, value, gust, unit, accent, icon, testID,
}: {
  label: string;
  value: number;
  gust: number | null;
  unit: 'kt' | 'kmh' | 'mph';
  accent: string;
  icon: string;
  testID?: string;
}) {
  const converted = convertWind(value, unit);
  const convertedGust = gust != null ? convertWind(gust, unit) : null;
  return (
    <View style={[styles.compCard, { borderColor: accent + '55' }]} testID={testID}>
      <View style={styles.compHead}>
        <Ionicons name={icon as any} size={14} color={accent} />
        <Text style={[styles.compLabel, { color: accent }]}>{label}</Text>
      </View>
      <View style={styles.compValRow}>
        <Text style={[styles.compVal, { color: accent }]}>{Math.round(converted)}</Text>
        <Text style={styles.compUnit}>{windUnitLabel(unit)}</Text>
      </View>
      {convertedGust != null && convertedGust > converted + 1 ? (
        <Text style={styles.compGust}>Gust {Math.round(convertedGust)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, fontWeight: '700', flexShrink: 1 },
  rwyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  stepBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  rwyInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: 6, borderWidth: 1, borderColor: colors.border },
  rwyPrefix: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  rwyInput: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: '800',
    paddingVertical: 3,
    paddingHorizontal: 4,
    width: 40,
    textAlign: 'center',
  },
  headingLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  headingText: { color: colors.onSurface, fontSize: 12, fontWeight: '600' },
  relText: { color: colors.onSurfaceSecondary, fontSize: 11 },
  grid: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  compCard: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, gap: 2 },
  compHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compLabel: { fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  compValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  compVal: { fontSize: 24, fontWeight: '800' },
  compUnit: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: '600' },
  compGust: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  error: { color: colors.onSurfaceTertiary, fontSize: 12, fontStyle: 'italic' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, backgroundColor: 'rgba(255,69,58,0.08)', borderRadius: radius.sm },
  warnText: { color: colors.error, fontSize: 11, fontWeight: '600', flex: 1 },
});
