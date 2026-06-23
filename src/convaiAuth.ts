import { setStoredConvaiApiKey } from './convaiApiKey';
import type { AuthUser } from './auth';

export type ConvaiAuthSession = {
  authenticated: boolean;
  apiKey?: string;
  email: string;
  username: string;
  photoUrl: string;
  companyName?: string;
  companyRole?: string;
  providers?: string[];
};

type DecryptedAuthPayload = {
  apiKey?: string;
  email?: string;
  username?: string;
  companyName?: string;
  companyRole?: string;
  providers?: string[];
  photoURL?: string;
  photoUrl?: string;
  profilePicture?: string;
};

const DEFAULT_LOGIN_URL = 'https://login.convai.com';
const DEFAULT_DECRYPT_URL = 'https://login.convai.com/api/decrypt';
const CONVAI_AUTH_PENDING_KEY = 'classic-chess.convaiAuthPending.v1';

export const CONVAI_AUTH_COOKIE = 'CONVAI_AUTH';
export const CONVAI_API_KEY_COOKIE = 'CONVAI_API_KEY';

/** Always offered in the sign-in modal unless explicitly disabled. */
export function isConvaiAuthOffered(): boolean {
  const forced = import.meta.env.VITE_CONVAI_AUTH_ENABLED?.trim().toLowerCase();
  if (forced === 'false') return false;
  return true;
}

export function getConvaiLoginUrl(): string {
  return import.meta.env.VITE_CONVAI_LOGIN_URL?.trim() || DEFAULT_LOGIN_URL;
}

export function getConvaiDecryptUrl(): string {
  return import.meta.env.VITE_CONVAI_DECRYPT_URL?.trim() || DEFAULT_DECRYPT_URL;
}

/** True on *.convai.com deploys, when explicitly enabled, or when decrypt URL is overridden. */
export function isConvaiAuthConfigured(): boolean {
  const forced = import.meta.env.VITE_CONVAI_AUTH_ENABLED?.trim().toLowerCase();
  if (forced === 'true') return true;
  if (forced === 'false') return false;
  if (import.meta.env.VITE_CONVAI_DECRYPT_URL?.trim()) return true;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'convai.com' || host.endsWith('.convai.com')) return true;
  }
  return false;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getConvaiCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  if (!match?.[1]) return null;
  return safeDecodeURIComponent(match[1].trim());
}

export function parseDecryptedAuthPayload(jsonString: string): DecryptedAuthPayload {
  if (!jsonString.trim()) return {};
  try {
    return JSON.parse(jsonString) as DecryptedAuthPayload;
  } catch {
    return {};
  }
}

export async function decryptConvaiCookie(encrypted: string): Promise<string | null> {
  const value = encrypted.trim();
  if (!value) return null;

  const url = getConvaiDecryptUrl();
  try {
    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: value }),
      cache: 'no-store',
    });

    if (response.status === 400) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedString: value }),
        cache: 'no-store',
      });
    }

    if (!response.ok) return null;

    const body = await response.json() as Record<string, unknown>;
    const decrypted = body.decryptedString ?? body.data ?? body.decrypted;
    return typeof decrypted === 'string' && decrypted.trim() ? decrypted : null;
  } catch {
    return null;
  }
}

async function buildSessionFromCookies(): Promise<ConvaiAuthSession | null> {
  const authCookie = getConvaiCookie(CONVAI_AUTH_COOKIE);
  if (!authCookie) return null;

  const decryptedAuth = await decryptConvaiCookie(authCookie);
  if (!decryptedAuth) return null;

  const payload = parseDecryptedAuthPayload(decryptedAuth);
  let apiKey = payload.apiKey?.trim() ?? '';

  if (!apiKey) {
    const apiKeyCookie = getConvaiCookie(CONVAI_API_KEY_COOKIE);
    if (apiKeyCookie) {
      const decryptedKey = await decryptConvaiCookie(apiKeyCookie);
      if (decryptedKey) apiKey = decryptedKey.trim();
    }
  }

  const email = (payload.email ?? '').trim();
  const username = (payload.username ?? '').trim();
  const photoUrl = (payload.photoUrl ?? payload.photoURL ?? payload.profilePicture ?? '').trim();

  if (!email && !username) return null;

  return {
    authenticated: true,
    apiKey: apiKey || undefined,
    email,
    username,
    photoUrl,
    companyName: payload.companyName,
    companyRole: payload.companyRole,
    providers: payload.providers,
  };
}

export function buildConvaiLoginRedirectUrl(returnUrl?: string): string {
  const loginUrl = new URL(getConvaiLoginUrl());
  loginUrl.searchParams.set('redirect', returnUrl ?? window.location.href);
  return loginUrl.toString();
}

export function signInWithConvaiRedirect(returnUrl?: string): void {
  window.location.href = buildConvaiLoginRedirectUrl(returnUrl);
}

export function markConvaiAuthPending(): void {
  try {
    window.sessionStorage.setItem(CONVAI_AUTH_PENDING_KEY, '1');
  } catch {}
}

export function isConvaiAuthPending(): boolean {
  try {
    return window.sessionStorage.getItem(CONVAI_AUTH_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearConvaiAuthPending(): void {
  try {
    window.sessionStorage.removeItem(CONVAI_AUTH_PENDING_KEY);
  } catch {}
}

export async function fetchConvaiAuthSession(): Promise<ConvaiAuthSession | null> {
  if (!isConvaiAuthConfigured()) return null;
  try {
    const session = await buildSessionFromCookies();
    if (!session?.authenticated) return null;
    return session;
  } catch {
    return null;
  }
}

export function convaiSessionToAuthUser(session: ConvaiAuthSession): AuthUser {
  const email = session.email.trim();
  const username = session.username.trim();
  const id = email || username;
  if (!id) throw new Error('Convai session is missing user identity.');
  return {
    id,
    name: username || email || 'Convai User',
    email: email || username,
    picture: session.photoUrl?.trim() || undefined,
    provider: 'convai',
  };
}

export function applyConvaiSessionApiKey(session: ConvaiAuthSession): boolean {
  const apiKey = session.apiKey?.trim();
  if (!apiKey) return false;
  setStoredConvaiApiKey(apiKey);
  return true;
}

export async function signOutConvai(): Promise<void> {
  // Static hosts cannot clear .convai.com cookies cross-origin; local state is cleared in signOutAuth.
}
