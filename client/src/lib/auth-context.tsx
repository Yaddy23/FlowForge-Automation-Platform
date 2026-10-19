import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { UserPublic } from 'shared/types/user';
import { apiPost } from './api';
import { clearAuthState, getAuthState, setAuthState, type AuthState } from './auth-storage';

interface AuthContextValue {
  user: UserPublic | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface LoginResponse extends AuthState {}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(() => getAuthState()?.user ?? null);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (email, password) => {
        const res = await apiPost<LoginResponse>('/auth/login', { email, password });
        setAuthState({
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          user: res.user,
        });
        setUser(res.user);
      },
      logout: () => {
        clearAuthState();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
