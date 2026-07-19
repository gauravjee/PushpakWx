import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { darkColors, lightColors, ColorPalette } from '@/src/theme';
import { usePrefs } from './PrefsContext';

type EffectiveScheme = 'dark' | 'light';

type ThemeState = {
  effectiveScheme: EffectiveScheme;
  colors: ColorPalette;
};

const ThemeCtx = createContext<ThemeState>({ effectiveScheme: 'dark', colors: darkColors });

function resolveScheme(mode: string | undefined): EffectiveScheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  // 'auto' (or unset) — follow the system appearance, defaulting to dark if unknown.
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = usePrefs();
  const mode = prefs.theme_mode ?? 'dark';
  const [effectiveScheme, setEffectiveScheme] = useState<EffectiveScheme>(() => resolveScheme(mode));

  useEffect(() => {
    setEffectiveScheme(resolveScheme(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'auto') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setEffectiveScheme(colorScheme === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, [mode]);

  const value = useMemo<ThemeState>(
    () => ({ effectiveScheme, colors: effectiveScheme === 'light' ? lightColors : darkColors }),
    [effectiveScheme]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** Returns { effectiveScheme, colors } — subscribe to this for the raw scheme/palette pair. */
export function useTheme() {
  return useContext(ThemeCtx);
}

/** Returns just the active color palette — this is what screens should use in place of the old static `colors` import. */
export function useThemeColors(): ColorPalette {
  return useContext(ThemeCtx).colors;
}
