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

type ConvaiAuthPayload = {
  apiKey?: string;
  email?: string;
  username?: string;
  photoUrl?: string;
  photoURL?: string;
  profilePicture?: string;
  companyName?: string;
  companyRole?: string;
  providers?: string[];
};

type DecryptResponse = {
  decryptedData?: string;
  decryptedString?: string;
};

const DEFAULT_LOGIN_URL = 'https://login.convai.com';
const DEFAULT_DECRYPT_URL = 'https://login.convai.com/api/decrypt';
const DEFAULT_AUTH_ME_URL = 'https://convai.com/api/auth/me';
const DEFAULT_AUTH_LOGOUT_URL = 'https://convai.com/api/auth/logout';
const CONVAI_AUTH_PENDING_KEY = 'classic-chess.convaiAuthPending.v1';

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
  if (import.meta.env.VITE_CONVAI_DECRYPT_URL?.trim()) return true;
  if (import.meta.env.VITE_CONVAI_AUTH_ME_URL?.trim()) return true;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'convai.com' || host.endsWith('.convai.com')) return true;
  }
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

function parseAuthPayload(raw: string): ConvaiAuthPayload | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    return JSON.parse(value) as ConvaiAuthPayload;
  } catch {
    return null;
  }
}

function sessionFromAuthPayload(payload: ConvaiAuthPayload): ConvaiAuthSession | null {
  const email = payload.email?.trim() ?? '';
  const username = payload.username?.trim() ?? '';
  if (!email && !username) return null;
  return {
    authenticated: true,
    apiKey: payload.apiKey?.trim() || undefined,
    email,
    username,
    photoUrl: (payload.photoUrl ?? payload.photoURL ?? payload.profilePicture ?? '').trim(),
    companyName: payload.companyName,
    companyRole: payload.companyRole,
    providers: payload.providers,
  };
}

function sessionFromDecryptResponse(body: DecryptResponse): ConvaiAuthSession | null {
  const raw = body.decryptedData ?? body.decryptedString ?? '';
  const payload = parseAuthPayload(raw);
  if (!payload) return null;
  return sessionFromAuthPayload(payload);
}

async function fetchConvaiAuthSessionViaDecrypt(): Promise<ConvaiAuthSession | null> {
  const response = await fetch(getConvaiDecryptUrl(), {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) return null;
  const body = await response.json() as DecryptResponse;
  return sessionFromDecryptResponse(body);
}

async function fetchConvaiAuthSessionViaMe(): Promise<ConvaiAuthSession | null> {
  const response = await fetch(getConvaiAuthMeUrl(), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const session = await response.json() as ConvaiAuthSession;
  if (!session.authenticated) return null;
  return session;
}

export async function fetchConvaiAuthSession(): Promise<ConvaiAuthSession | null> {
  if (!isConvaiAuthConfigured()) return null;
  try {
    const decrypted = await fetchConvaiAuthSessionViaDecrypt();
    if (decrypted) return decrypted;
  } catch {
    // Fall back to /api/auth/me when decrypt is blocked or unavailable.
  }
  try {
    return await fetchConvaiAuthSessionViaMe();
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
