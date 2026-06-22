import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  applyConvaiSessionApiKey,
  buildConvaiLoginRedirectUrl,
  convaiSessionToAuthUser,
  fetchConvaiAuthSession,
  getConvaiAuthMeUrl,
  isConvaiAuthConfigured,
} from './convaiAuth';

function stubLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
  vi.stubGlobal('window', {
    localStorage,
    location: { href: 'https://chess.convai.com/', hostname: 'chess.convai.com' },
  });
  return store;
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

  it('fetches the Convai auth session with credentials included', async () => {
    vi.stubGlobal('window', { location: { hostname: 'chess.convai.com' } });
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        apiKey: 'abc123',
        email: 'player@convai.com',
        username: 'Player',
        photoUrl: '',
      }),
    } as Response);

    const session = await fetchConvaiAuthSession();
    expect(session?.apiKey).toBe('abc123');
    expect(fetchMock).toHaveBeenCalledWith(getConvaiAuthMeUrl(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  });
});
