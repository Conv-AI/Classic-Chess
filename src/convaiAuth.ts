import { debugLog } from './debugLog';
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

export type ConvaiAuthFetchResult = {
  session: ConvaiAuthSession | null;
  reason: string | null;
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

type DecryptResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

const DEFAULT_LOGIN_URL = 'https://login.convai.com';
const DEFAULT_DECRYPT_URL = 'https://login.convai.com/api/decrypt';
const CONVAI_AUTH_PENDING_KEY = 'classic-chess.convaiAuthPending.v1';

export const CONVAI_AUTH_COOKIE = 'CONVAI_AUTH';
export const CONVAI_API_KEY_COOKIE = 'CONVAI_API_KEY';

let sessionFetchPromise: Promise<ConvaiAuthFetchResult> | null = null;

function convaiLog(message: string): void {
  if (import.meta.env.DEV) debugLog('ConvaiAuth', message);
}

function convaiWarn(message: string): void {
  debugLog('ConvaiAuth', message);
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

export function listVisibleCookieNames(): string[] {
  if (typeof document === 'undefined' || !document.cookie.trim()) return [];
  return document.cookie
    .split(';')
    .map((part) => part.trim().split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name));
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

function summarizePayloadFields(payload: DecryptedAuthPayload): string {
  return Object.keys(payload).join(',') || 'none';
}

function summarizeResponseBody(body: Record<string, unknown>): string {
  const keys = Object.keys(body);
  if (keys.length === 0) return 'empty JSON body';
  return `keys=${keys.join(',')}`;
}

function extractDecryptedValue(body: Record<string, unknown>): string | null {
  const wrapped = body.decryptedString
    ?? body.decryptedData
    ?? body.data
    ?? body.decrypted
    ?? body.result;

  if (typeof wrapped === 'string' && wrapped.trim()) return wrapped.trim();

  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
    const record = wrapped as Record<string, unknown>;
    if (typeof record.email === 'string' || typeof record.username === 'string' || typeof record.apiKey === 'string') {
      return JSON.stringify(record);
    }
  }

  if (typeof body.email === 'string' || typeof body.username === 'string') {
    return JSON.stringify(body);
  }

  return null;
}

async function postDecryptRequest(
  url: string,
  body: Record<string, string>,
  label: string,
): Promise<DecryptResult> {
  const bodyKey = Object.keys(body)[0] ?? 'data';
  const started = performance.now();
  convaiLog(`decrypt request (${label}) field=${bodyKey} len=${body[bodyKey]?.length ?? 0}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const rawText = await response.text().catch(() => '');
    let parsed: Record<string, unknown> = {};
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        convaiWarn(`decrypt ${label} non-JSON response (${rawText.slice(0, 120)}${rawText.length > 120 ? '...' : ''})`);
        parsed = {};
      }
    }

    const elapsedMs = Math.round(performance.now() - started);

    if (!response.ok) {
      const detail = typeof parsed.error === 'string'
        ? parsed.error
        : (rawText || summarizeResponseBody(parsed));
      const reason = `decrypt ${label} failed: HTTP ${response.status}${detail ? ` (${detail.slice(0, 160)})` : ''}`;
      convaiWarn(`${reason} (${elapsedMs}ms)`);
      return { ok: false, reason };
    }

    const value = extractDecryptedValue(parsed);
    if (!value) {
      const reason = `decrypt ${label} returned 200 but no decrypted payload (${summarizeResponseBody(parsed)})`;
      convaiWarn(`${reason} (${elapsedMs}ms)`);
      return { ok: false, reason };
    }

    convaiLog(`decrypt ${label} ok (${elapsedMs}ms)`);
    return { ok: true, value };
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - started);
    const message = error instanceof Error ? error.message : String(error);
    const corsHint = message === 'Failed to fetch'
      ? ' (likely CORS — ask Convai to allow https://chess.convai.com on POST /api/decrypt)'
      : '';
    const reason = `decrypt ${label} network error: ${message}${corsHint}`;
    convaiWarn(`${reason} (${elapsedMs}ms)`);
    return { ok: false, reason };
  }
}

export async function decryptConvaiCookie(encrypted: string): Promise<string | null> {
  const result = await decryptConvaiCookieDetailed(encrypted);
  return result.ok ? result.value : null;
}

export async function decryptConvaiCookieDetailed(encrypted: string): Promise<DecryptResult> {
  const value = encrypted.trim();
  if (!value) {
    return { ok: false, reason: 'decrypt skipped: empty cookie value' };
  }

  const url = getConvaiDecryptUrl();
  const primary = await postDecryptRequest(url, { data: value }, 'data');
  if (primary.ok) return primary;

  if (primary.reason.includes('HTTP 400')) {
    convaiLog('retrying decrypt with encryptedString field after HTTP 400');
    const fallback = await postDecryptRequest(url, { encryptedString: value }, 'encryptedString');
    if (fallback.ok) return fallback;
    return fallback;
  }

  convaiLog(`skipping encryptedString fallback (${primary.reason})`);
  return primary;
}

async function buildSessionFromCookies(): Promise<ConvaiAuthFetchResult> {
  const visibleCookies = listVisibleCookieNames();
  convaiLog(`visible cookies: ${visibleCookies.length ? visibleCookies.join(', ') : 'none'}`);

  const authCookie = getConvaiCookie(CONVAI_AUTH_COOKIE);
  if (!authCookie) {
    const reason = visibleCookies.includes(CONVAI_AUTH_COOKIE)
      ? 'CONVAI_AUTH cookie exists but could not be read'
      : 'CONVAI_AUTH cookie not visible to JavaScript (missing or HttpOnly)';
    convaiWarn(`session restore failed: ${reason}`);
    return { session: null, reason };
  }

  convaiLog(`CONVAI_AUTH present (${authCookie.length} chars)`);

  const decryptedAuthResult = await decryptConvaiCookieDetailed(authCookie);
  if (!decryptedAuthResult.ok) {
    return { session: null, reason: decryptedAuthResult.reason };
  }

  const payload = parseDecryptedAuthPayload(decryptedAuthResult.value);
  if (!payload.email && !payload.username) {
    const reason = 'decrypted CONVAI_AUTH payload is missing email and username';
    convaiWarn(`${reason} payloadFields=${summarizePayloadFields(payload)}`);
    return { session: null, reason };
  }

  let apiKey = payload.apiKey?.trim() ?? '';

  if (!apiKey) {
    const apiKeyCookie = getConvaiCookie(CONVAI_API_KEY_COOKIE);
    if (apiKeyCookie) {
      convaiLog(`CONVAI_API_KEY present (${apiKeyCookie.length} chars), decrypting`);
      const decryptedKeyResult = await decryptConvaiCookieDetailed(apiKeyCookie);
      if (decryptedKeyResult.ok) {
        apiKey = decryptedKeyResult.value.trim();
      } else {
        convaiWarn(`api key decrypt failed: ${decryptedKeyResult.reason}`);
      }
    } else {
      convaiLog('no apiKey in auth payload and CONVAI_API_KEY cookie missing');
    }
  }

  const email = (payload.email ?? '').trim();
  const username = (payload.username ?? '').trim();
  const photoUrl = (payload.photoUrl ?? payload.photoURL ?? payload.profilePicture ?? '').trim();

  convaiLog(`session ok email=${email || '(none)'} username=${username || '(none)'} apiKey=${apiKey ? 'yes' : 'no'}`);

  return {
    session: {
      authenticated: true,
      apiKey: apiKey || undefined,
      email,
      username,
      photoUrl,
      companyName: payload.companyName,
      companyRole: payload.companyRole,
      providers: payload.providers,
    },
    reason: null,
  };
}

export function buildConvaiLoginRedirectUrl(returnUrl?: string): string {
  const loginUrl = new URL(getConvaiLoginUrl());
  loginUrl.searchParams.set('redirect', returnUrl ?? window.location.href);
  return loginUrl.toString();
}

export function signInWithConvaiRedirect(returnUrl?: string): void {
  const redirectUrl = buildConvaiLoginRedirectUrl(returnUrl);
  convaiLog(`redirecting to login`);
  window.location.href = redirectUrl;
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

export async function fetchConvaiAuthSessionResult(): Promise<ConvaiAuthFetchResult> {
  if (!isConvaiAuthConfigured()) {
    return { session: null, reason: 'Convai auth is not configured for this host' };
  }

  if (sessionFetchPromise) return sessionFetchPromise;

  sessionFetchPromise = (async () => {
    convaiLog(`session restore start host=${window.location.hostname} pending=${isConvaiAuthPending()}`);
    try {
      const result = await buildSessionFromCookies();
      if (!result.session) {
        convaiWarn(`session restore failed: ${result.reason ?? 'unknown'}`);
      }
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unexpected Convai auth error';
      convaiWarn(`session restore threw: ${reason}`);
      return { session: null, reason };
    } finally {
      sessionFetchPromise = null;
    }
  })();

  return sessionFetchPromise;
}

export async function fetchConvaiAuthSession(): Promise<ConvaiAuthSession | null> {
  const { session } = await fetchConvaiAuthSessionResult();
  return session;
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
  if (!apiKey) {
    convaiLog('api key not stored: session had no apiKey');
    return false;
  }
  const stored = setStoredConvaiApiKey(apiKey);
  if (stored) convaiLog(`api key stored len=${apiKey.length}`);
  return stored;
}

export async function signOutConvai(): Promise<void> {
  // Static hosts cannot clear .convai.com cookies cross-origin; local state is cleared in signOutAuth.
}
