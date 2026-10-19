import type { UserPublic } from 'shared/types/user';

export interface AuthState {
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
}

const STORAGE_KEY = 'flowforge.auth';

export function getAuthState(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export function setAuthState(state: AuthState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — session stays in memory only */
  }
}

export function clearAuthState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
