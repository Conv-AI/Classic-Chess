import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  applyConvaiSessionApiKey,
  buildConvaiLoginRedirectUrl,
  clearConvaiAuthPending,
  convaiSessionToAuthUser,
  fetchConvaiAuthSession,
  getConvaiDecryptUrl,
  isConvaiAuthConfigured,
  isConvaiAuthOffered,
  isConvaiAuthPending,
  markConvaiAuthPending,
} from './convaiAuth';

function stubBrowserStorage() {
  const localStore = new Map<string, string>();
  const sessionStore = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => localStore.get(key) ?? null,
    setItem: (key: string, value: string) => { localStore.set(key, value); },
    removeItem: (key: string) => { localStore.delete(key); },
    clear: () => { localStore.clear(); },
  };
  const sessionStorage = {
    getItem: (key: string) => sessionStore.get(key) ?? null,
    setItem: (key: string, value: string) => { sessionStore.set(key, value); },
    removeItem: (key: string) => { sessionStore.delete(key); },
    clear: () => { sessionStore.clear(); },
  };
  vi.stubGlobal('window', {
    localStorage,
    sessionStorage,
    location: { href: 'https://chess.convai.com/', hostname: 'chess.convai.com' },
  });
  return { localStore, sessionStore };
}

function stubLocalStorage() {
  const { localStore } = stubBrowserStorage();
  return localStore;
}

describe('convaiAuth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('enables Convai auth automatically on convai.com subdomains', () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    expect(isConvaiAuthConfigured()).toBe(true);
  });

  it('builds a login redirect with the current page as return url', () => {
    vi.stubGlobal('window', { location: { href: 'https://chess.convai.com/?coach=leila' } });
    const url = new URL(buildConvaiLoginRedirectUrl());
    expect(url.origin).toBe('https://login.convai.com');
    expect(url.searchParams.get('redirect')).toBe('https://chess.convai.com/?coach=leila');
    expect(url.searchParams.get('return_url')).toBe('https://chess.convai.com/?coach=leila');
  });

  it('maps an authenticated Convai session to an auth user and stores the API key', () => {
    const storage = stubLocalStorage();
    const session = {
      authenticated: true,
      apiKey: 'convai-test-key',
      email: 'player@convai.com',
      username: 'Convai Player',
      photoUrl: 'https://example.com/avatar.png',
    };

    expect(convaiSessionToAuthUser(session)).toEqual({
      id: 'player@convai.com',
      name: 'Convai Player',
      email: 'player@convai.com',
      picture: 'https://example.com/avatar.png',
      provider: 'convai',
    });
    expect(applyConvaiSessionApiKey(session)).toBe(true);
    expect(storage.get('classic-chess.convaiApiKey.v1')).toBe('convai-test-key');
  });

  it('uses login.convai.com decrypt endpoint by default', () => {
    expect(getConvaiDecryptUrl()).toBe('https://login.convai.com/api/decrypt');
  });

  it('fetches the Convai auth session via decrypt with credentials included', async () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        decryptedData: JSON.stringify({
          apiKey: 'abc123',
          email: 'player@convai.com',
          username: 'Player',
          photoUrl: '',
        }),
      }),
    } as Response);

    const session = await fetchConvaiAuthSession();
    expect(session?.apiKey).toBe('abc123');
    expect(fetchMock).toHaveBeenCalledWith(getConvaiDecryptUrl(), {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  it('falls back to /api/auth/me when decrypt returns empty data', async () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    const fetchMock = vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ decryptedData: '' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          apiKey: 'fallback-key',
          email: 'player@convai.com',
          username: 'Player',
          photoUrl: '',
        }),
      } as Response);

    const session = await fetchConvaiAuthSession();
    expect(session?.apiKey).toBe('fallback-key');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tracks pending Convai redirect state in sessionStorage', () => {
    stubBrowserStorage();
    expect(isConvaiAuthPending()).toBe(false);
    markConvaiAuthPending();
    expect(isConvaiAuthPending()).toBe(true);
    clearConvaiAuthPending();
    expect(isConvaiAuthPending()).toBe(false);
  });

  it('offers Convai sign-in by default', () => {
    expect(isConvaiAuthOffered()).toBe(true);
  });

  it('can disable Convai sign-in via env flag', () => {
    vi.stubEnv('VITE_CONVAI_AUTH_ENABLED', 'false');
    expect(isConvaiAuthOffered()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('offers Convai auth on convai.com subdomains', () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    expect(isConvaiAuthOffered()).toBe(true);
    expect(isConvaiAuthConfigured()).toBe(true);
  });
});
