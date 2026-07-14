// Design tokens from /app/design_guidelines.json - Dark-First Utility

export const colors = {
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
