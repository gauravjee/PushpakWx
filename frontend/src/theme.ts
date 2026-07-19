// Design tokens from /app/design_guidelines.json - Dark-First Utility

export type ColorPalette = typeof darkColors;

export const darkColors = {
  surface: '#111315',
  onSurface: '#FFFFFF',
  surfaceSecondary: '#1C1F22',
  onSurfaceSecondary: '#A1A6AB',
  surfaceTertiary: '#262A2E',
  onSurfaceTertiary: '#8A9198',
  brand: '#FF9F0A',
  brandPrimary: '#FF9F0A',
  onBrandPrimary: '#000000',
  brandSecondary: '#CC7F08',
  brandTertiary: '#332002',
  onBrandTertiary: '#FF9F0A',
  success: '#32D74B',
  warning: '#FFD60A',
  error: '#FF453A',
  info: '#0A84FF',
  vfr: '#32D74B',
  mvfr: '#0A84FF',
  ifr: '#FF453A',
  lifr: '#BF5AF2',
  border: '#2A2F35',
  borderStrong: '#3E454D',
  divider: '#1F2328',
};

export const lightColors: ColorPalette = {
  surface: '#E9F3FC',
  onSurface: '#0F2238',
  surfaceSecondary: '#FFFFFF',
  onSurfaceSecondary: '#4A6076',
  surfaceTertiary: '#DBEAF7',
  onSurfaceTertiary: '#7A8FA3',
  brand: '#CC7F08',
  brandPrimary: '#CC7F08',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#FF9F0A',
  brandTertiary: '#FFEED1',
  onBrandTertiary: '#CC7F08',
  success: '#1E8A45',
  warning: '#B25E00',
  error: '#D0353F',
  info: '#0072C6',
  vfr: '#1E8A45',
  mvfr: '#0072C6',
  ifr: '#D0353F',
  lifr: '#8944AB',
  border: '#C6DCEF',
  borderStrong: '#98BCD9',
  divider: '#DCEAF5',
};

/**
 * Static dark palette — used by screens shown before login (auth flow) where
 * there's no saved preference to read yet, and as a safe default anywhere
 * useThemeColors() isn't available (outside ThemeProvider).
 */
export const colors: ColorPalette = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
};

export const typography = {
  displayFont: 'System', // Rajdhani placeholder - using system
  textFont: 'System',
  weightBold: '700' as const,
  weightMedium: '600' as const,
  weightRegular: '400' as const,
};
