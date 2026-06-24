import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  applyConvaiSessionApiKey,
  buildConvaiLoginRedirectUrl,
  clearConvaiAuthPending,
  CONVAI_API_KEY_COOKIE,
  CONVAI_AUTH_COOKIE,
  convaiSessionToAuthUser,
  decryptConvaiCookie,
  fetchConvaiAuthSession,
  fetchConvaiAuthSessionResult,
  getConvaiCookie,
  getConvaiDecryptUrl,
  isConvaiAuthConfigured,
  isConvaiAuthOffered,
  isConvaiAuthPending,
  markConvaiAuthPending,
  parseDecryptedAuthPayload,
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
  vi.stubGlobal('document', { cookie: '' });
  return { localStore, sessionStore };
}

function stubLocalStorage() {
  const { localStore } = stubBrowserStorage();
  return localStore;
}

function stubCookie(value: string) {
  vi.stubGlobal('document', { cookie: value });
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

  it('reads convai cookies from document.cookie', () => {
    stubCookie('other=1; CONVAI_AUTH=encrypted-auth; CONVAI_API_KEY=encrypted-key');
    expect(getConvaiCookie(CONVAI_AUTH_COOKIE)).toBe('encrypted-auth');
    expect(getConvaiCookie(CONVAI_API_KEY_COOKIE)).toBe('encrypted-key');
    expect(getConvaiCookie('missing')).toBeNull();
  });

  it('parses decrypted auth payload fields', () => {
    const payload = parseDecryptedAuthPayload(JSON.stringify({
      email: 'player@convai.com',
      username: 'Player',
      photoURL: 'https://example.com/avatar.png',
      apiKey: 'abc123',
    }));
    expect(payload.email).toBe('player@convai.com');
    expect(payload.photoURL).toBe('https://example.com/avatar.png');
  });

  it('decrypts cookie values via login.convai.com/api/decrypt', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ decryptedString: '{"email":"player@convai.com"}' }),
    } as Response);

    const decrypted = await decryptConvaiCookie('encrypted-value');
    expect(decrypted).toBe('{"email":"player@convai.com"}');
    expect(fetchMock).toHaveBeenCalledWith(getConvaiDecryptUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'encrypted-value' }),
      cache: 'no-store',
    });
  });

  it('builds a session from decrypted CONVAI_AUTH cookie', async () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    stubCookie(`${CONVAI_AUTH_COOKIE}=encrypted-auth`);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        decryptedString: JSON.stringify({
          email: 'player@convai.com',
          username: 'Player',
          apiKey: 'abc123',
          photoUrl: '',
        }),
      }),
    } as Response);

    const session = await fetchConvaiAuthSession();
    expect(session?.apiKey).toBe('abc123');
    expect(session?.email).toBe('player@convai.com');
  });

  it('falls back to CONVAI_API_KEY cookie when auth payload has no apiKey', async () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    stubCookie(`${CONVAI_AUTH_COOKIE}=encrypted-auth; ${CONVAI_API_KEY_COOKIE}=encrypted-key`);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          decryptedString: JSON.stringify({
            email: 'player@convai.com',
            username: 'Player',
          }),
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ decryptedString: 'fallback-api-key' }),
      } as Response);

    const session = await fetchConvaiAuthSession();
    expect(session?.apiKey).toBe('fallback-api-key');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when no auth cookie is present', async () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    stubCookie('');
    const fetchMock = vi.mocked(fetch);

    const result = await fetchConvaiAuthSessionResult();
    expect(result.session).toBeNull();
    expect(result.reason).toMatch(/CONVAI_AUTH cookie not visible/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts decrypt responses that return the auth payload object directly', async () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    stubCookie(`${CONVAI_AUTH_COOKIE}=encrypted-auth`);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        email: 'player@convai.com',
        username: 'Player',
        apiKey: 'direct-key',
      }),
    } as Response);

    const result = await fetchConvaiAuthSessionResult();
    expect(result.session?.apiKey).toBe('direct-key');
    expect(result.reason).toBeNull();
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
