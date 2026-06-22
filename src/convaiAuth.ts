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
const DEFAULT_AUTH_ME_URL = 'https://convai.com/api/auth/me';
const DEFAULT_AUTH_LOGOUT_URL = 'https://convai.com/api/auth/logout';

export function getConvaiLoginUrl(): string {
  return import.meta.env.VITE_CONVAI_LOGIN_URL?.trim() || DEFAULT_LOGIN_URL;
}

export function getConvaiAuthMeUrl(): string {
  return import.meta.env.VITE_CONVAI_AUTH_ME_URL?.trim() || DEFAULT_AUTH_ME_URL;
}

export function getConvaiAuthLogoutUrl(): string {
  return import.meta.env.VITE_CONVAI_AUTH_LOGOUT_URL?.trim() || DEFAULT_AUTH_LOGOUT_URL;
}

/** True on *.convai.com deploys, when explicitly enabled, or when auth URLs are overridden. */
export function isConvaiAuthConfigured(): boolean {
  const forced = import.meta.env.VITE_CONVAI_AUTH_ENABLED?.trim().toLowerCase();
  if (forced === 'true') return true;
  if (forced === 'false') return false;
  if (import.meta.env.VITE_CONVAI_AUTH_ME_URL?.trim()) return true;
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.convai.com')) return true;
  return false;
}

export function buildConvaiLoginRedirectUrl(returnUrl?: string): string {
  const loginUrl = new URL(getConvaiLoginUrl());
  loginUrl.searchParams.set('redirect', returnUrl ?? window.location.href);
  return loginUrl.toString();
}

export function signInWithConvaiRedirect(returnUrl?: string): void {
  window.location.href = buildConvaiLoginRedirectUrl(returnUrl);
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
    // Static hosts may not reach the Convai logout endpoint.
  }
}
