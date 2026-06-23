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

const DEFAULT_LOGIN_URL = 'https://login.convai.com';
const SAME_ORIGIN_AUTH_ME_URL = '/api/auth/me';
const SAME_ORIGIN_AUTH_LOGOUT_URL = '/api/auth/logout';
const CONVAI_AUTH_PENDING_KEY = 'classic-chess.convaiAuthPending.v1';

/** True on convai.com and its subdomains (e.g. chess.convai.com). */
export function isConvaiProductionHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'convai.com' || host.endsWith('.convai.com');
}

/** Always offered in the sign-in modal unless explicitly disabled. */
export function isConvaiAuthOffered(): boolean {
  const forced = import.meta.env.VITE_CONVAI_AUTH_ENABLED?.trim().toLowerCase();
  if (forced === 'false') return false;
  return true;
}

export function getConvaiLoginUrl(): string {
  return import.meta.env.VITE_CONVAI_LOGIN_URL?.trim() || DEFAULT_LOGIN_URL;
}

/**
 * Playground pattern: same-origin /api/auth/me on convai hosts.
 * The server reads CONVAI_AUTH cookies and decrypts them — no cross-origin fetch.
 */
export function getConvaiAuthMeUrl(): string {
  return import.meta.env.VITE_CONVAI_AUTH_ME_URL?.trim() || SAME_ORIGIN_AUTH_ME_URL;
}

export function getConvaiAuthLogoutUrl(): string {
  return import.meta.env.VITE_CONVAI_AUTH_LOGOUT_URL?.trim() || SAME_ORIGIN_AUTH_LOGOUT_URL;
}

/** True on *.convai.com deploys, when explicitly enabled, or when auth URLs are overridden. */
export function isConvaiAuthConfigured(): boolean {
  const forced = import.meta.env.VITE_CONVAI_AUTH_ENABLED?.trim().toLowerCase();
  if (forced === 'true') return true;
  if (forced === 'false') return false;
  if (import.meta.env.VITE_CONVAI_AUTH_ME_URL?.trim()) return true;
  if (isConvaiProductionHost()) return true;
  return false;
}

export function buildConvaiLoginRedirectUrl(returnUrl?: string): string {
  const loginUrl = new URL(getConvaiLoginUrl());
  const target = returnUrl ?? window.location.href;
  loginUrl.searchParams.set('redirect', target);
  loginUrl.searchParams.set('return_url', target);
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
    const response = await fetch(getConvaiAuthMeUrl(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const session = await response.json() as ConvaiAuthSession;
    if (!session.authenticated) return null;
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
  try {
    await fetch(getConvaiAuthLogoutUrl(), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Static hosts may not have a logout route yet.
  }
}
