import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, Prefs } from '@/src/api/client';
import { useAuth } from './AuthContext';

const DEFAULT_PREFS: Prefs = { wind_unit: 'kt', altitude_unit: 'ft', temp_unit: 'C', auto_detect_flight: true, theme_mode: 'dark' };

type PrefsState = {
  prefs: Prefs;
  updatePrefs: (p: Partial<Prefs>) => Promise<void>;
};

const PrefsCtx = createContext<PrefsState | undefined>(undefined);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!user) {
      setPrefs(DEFAULT_PREFS);
      return;
    }
    (async () => {
      try {
        const p = await api.getPrefs();
        setPrefs(p);
      } catch {
        setPrefs(DEFAULT_PREFS);
      }
    })();
  }, [user]);

  const updatePrefs = useCallback(async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (user) {
      try {
        await api.updatePrefs(next);
      } catch {}
    }
  }, [prefs, user]);

  return <PrefsCtx.Provider value={{ prefs, updatePrefs }}>{children}</PrefsCtx.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsCtx);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}
