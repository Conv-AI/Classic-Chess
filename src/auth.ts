import { signOutConvai } from './convaiAuth';
import { setStoredConvaiApiKey } from './convaiApiKey';

export type AuthProvider = 'google' | 'convai';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  picture?: string;
  provider: AuthProvider;
};

export type UserIdentity = {
  displayName: string;
  endUserId: string;
  endUserMetadata: Record<string, unknown>;
};

const STATIC_AUTH_STORAGE_KEY = 'classic-chess.authUser.v1';
const LEGACY_GOOGLE_AUTH_STORAGE_KEY = 'classic-chess.googleUser.v1';
const GUEST_END_USER_ID_KEY = 'classic-chess.guestEndUserId.v1';
const KNOWN_END_USER_IDS_KEY = 'classic-chess.knownEndUserIds.v1';
const MAX_KNOWN_END_USER_IDS = 64;

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
}

/** Convai long-term memory is only used for signed-in Google users. */
export function usesConvaiLongTermMemory(identity: UserIdentity | null | undefined): boolean {
  return Boolean(identity?.endUserId);
}

/** Google end user id when signed in; empty for guests. */
export function resolveConvaiEndUserId(identity: UserIdentity | null | undefined): string {
  return identity?.endUserId ?? '';
}

/** Stable guest id per browser — reused across visits on this device. */
export function getStableGuestEndUserId(): string {
  try {
    const existing = window.localStorage.getItem(GUEST_END_USER_ID_KEY)?.trim();
    if (existing) return existing;
    const created = `guest:${crypto.randomUUID()}`;
    window.localStorage.setItem(GUEST_END_USER_ID_KEY, created);
    registerKnownEndUserId(created);
    return created;
  } catch {
    const fallback = `guest:${crypto.randomUUID()}`;
    registerKnownEndUserId(fallback);
    return fallback;
  }
}

export function resolveConvaiConnectionEndUserId(identity: UserIdentity | null | undefined): string {
  if (identity?.endUserId) {
    registerKnownEndUserId(identity.endUserId);
    return identity.endUserId;
  }
  return getStableGuestEndUserId();
}

/** Tracks ids this browser has connected with — fallback when list API is unavailable. */
export function registerKnownEndUserId(endUserId: string): void {
  const value = endUserId.trim();
  if (!value) return;
  try {
    const existing = getKnownEndUserIds();
    if (existing.includes(value)) return;
    const next = [value, ...existing].slice(0, MAX_KNOWN_END_USER_IDS);
    window.localStorage.setItem(KNOWN_END_USER_IDS_KEY, JSON.stringify(next));
  } catch {}
}

export function getKnownEndUserIds(): string[] {
  try {
    const raw = window.localStorage.getItem(KNOWN_END_USER_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function getCachedAuthUser(): AuthUser | null {
  return getStoredStaticAuthUser();
}

export function authUserToIdentity(user: AuthUser | null): UserIdentity | null {
  if (!user?.id) return null;
  const displayName = user.name.trim() || user.email.trim() || 'Student';
  return {
    displayName,
    endUserId: `${user.provider}:${user.id}`,
    endUserMetadata: {
      name: displayName,
      email: user.email,
      picture: user.picture,
      provider: user.provider,
    },
  };
}

function shouldUseSameOriginGoogleAuth(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}

export async function fetchAuthUser(): Promise<AuthUser | null> {
  const stored = getStoredStaticAuthUser();
  if (!shouldUseSameOriginGoogleAuth()) return stored;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401 || res.status === 404) return stored;
    if (!res.ok) return stored;
    const payload = await res.json();
    return payload.user ?? stored;
  } catch {
    return stored;
  }
}

export async function signInWithGoogleCredential(credential: string): Promise<AuthUser> {
  const staticUser = authUserFromGoogleCredential(credential);

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (res.ok) {
      const payload = await res.json();
      if (!payload.user) throw new Error('Google sign-in did not return a user.');
      setStoredStaticAuthUser(payload.user);
      return payload.user;
    }
  } catch {
    // Static hosts such as GitHub Pages do not have /api/auth/google. Fall back to
    // the Google ID token payload so demos can still map a Google account to Convai.
  }

  setStoredStaticAuthUser(staticUser);
  return staticUser;
}

export async function signOutGoogle(): Promise<void> {
  clearStoredStaticAuthUser();
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Static-host fallback has no logout endpoint.
  }
}

export function authUserFromGoogleCredential(credential: string): AuthUser {
  const payload = decodeJwtPayload(credential);
  const id = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload.email === 'string' ? payload.email : '';
  const name = typeof payload.name === 'string' ? payload.name : email;
  const picture = typeof payload.picture === 'string' ? payload.picture : undefined;
  if (!id) throw new Error('Google credential is missing a stable subject.');
  return { id, name: name || email || 'Student', email, picture, provider: 'google' };
}

export async function signOutAuth(user: AuthUser | null): Promise<void> {
  clearStoredStaticAuthUser();
  if (user?.provider === 'convai') {
    await signOutConvai();
    setStoredConvaiApiKey('');
    return;
  }
  await signOutGoogle();
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Google credential is malformed.');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const json = decodeURIComponent(
    Array.from(atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  );
  return JSON.parse(json);
}

function normalizeStoredAuthUser(parsed: unknown): AuthUser | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  const provider = record.provider === 'convai' ? 'convai' : 'google';
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : '',
    email: typeof record.email === 'string' ? record.email : '',
    picture: typeof record.picture === 'string' ? record.picture : undefined,
    provider,
  };
}

function getStoredStaticAuthUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(STATIC_AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = normalizeStoredAuthUser(JSON.parse(raw));
      if (parsed) return parsed;
    }
    const legacyRaw = window.localStorage.getItem(LEGACY_GOOGLE_AUTH_STORAGE_KEY);
    if (!legacyRaw) return null;
    return normalizeStoredAuthUser(JSON.parse(legacyRaw));
  } catch {
    return null;
  }
}

function setStoredStaticAuthUser(user: AuthUser): void {
  try {
    window.localStorage.setItem(STATIC_AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

export function persistAuthUser(user: AuthUser): void {
  setStoredStaticAuthUser(user);
}

function clearStoredStaticAuthUser(): void {
  try {
    window.localStorage.removeItem(STATIC_AUTH_STORAGE_KEY);
  } catch {}
}
