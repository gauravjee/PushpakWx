import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, Prefs } from '@/src/api/client';
import { useAuth } from './AuthContext';
import { setAutoDetectPref } from '@/src/services/flightRecording';

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
      setAutoDetectPref(DEFAULT_PREFS.auto_detect_flight).catch(() => {});
      return;
    }
    (async () => {
      try {
        const p = await api.getPrefs();
        setPrefs(p);
        setAutoDetectPref(p.auto_detect_flight).catch(() => {});
      } catch {
        setPrefs(DEFAULT_PREFS);
        setAutoDetectPref(DEFAULT_PREFS.auto_detect_flight).catch(() => {});
      }
    })();
  }, [user]);

  const updatePrefs = useCallback(async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    // Mirrored into storage regardless of whether the backend save below
    // succeeds — the background task reading this later cares about the
    // pilot's actual toggle right now, not whether the sync landed.
    setAutoDetectPref(next.auto_detect_flight).catch(() => {});
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
