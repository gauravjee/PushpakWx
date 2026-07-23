import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { storage } from '@/src/utils/storage';
import { api, TOKEN_KEY, UserPublic } from '@/src/api/client';

type AuthState = {
  user: UserPublic | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name?: string) => Promise<{ email: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string, confirmEmail: string) => Promise<void>;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet<string>(TOKEN_KEY, '');
      if (token) {
        try {
          const me = await api.me();
          setUser(me);
        } catch {
          await storage.secureRemove(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, full_name?: string) => {
    const res = await api.register(email, password, full_name);
    return { email: res.email };
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const res = await api.verifyEmail(email, code);
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async (password: string, confirmEmail: string) => {
    await api.deleteAccount(password, confirmEmail);
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, verifyEmail, logout, deleteAccount }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
