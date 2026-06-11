export type AuthUser = {
  id: string;
  name: string;
  email: string;
  picture?: string;
};

export type UserIdentity = {
  displayName: string;
  endUserId: string;
  endUserMetadata: Record<string, unknown>;
};

const STATIC_AUTH_STORAGE_KEY = 'classic-chess.googleUser.v1';

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
}

export function authUserToIdentity(user: AuthUser | null): UserIdentity | null {
  if (!user?.id) return null;
  const displayName = user.name.trim() || user.email.trim() || 'Student';
  return {
    displayName,
    endUserId: `google:${user.id}`,
    endUserMetadata: {
      name: displayName,
      email: user.email,
      picture: user.picture,
      provider: 'google',
    },
  };
}

export async function fetchAuthUser(): Promise<AuthUser | null> {
  const stored = getStoredStaticAuthUser();
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
  return { id, name: name || email || 'Student', email, picture };
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

function getStoredStaticAuthUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(STATIC_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function setStoredStaticAuthUser(user: AuthUser): void {
  try {
    window.localStorage.setItem(STATIC_AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

function clearStoredStaticAuthUser(): void {
  try {
    window.localStorage.removeItem(STATIC_AUTH_STORAGE_KEY);
  } catch {}
}
