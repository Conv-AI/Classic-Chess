import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAllEndUsers, deleteEndUser, isMauLimitError, listEndUsers } from './convaiEndUsers';

vi.mock('./convaiApiKey', () => ({
  getConvaiApiKey: () => 'test-api-key',
}));

describe('convaiEndUsers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('detects MAU limit errors', () => {
    expect(isMauLimitError('LTM speaker limit reached')).toBe(true);
    expect(isMauLimitError('RESOURCE_EXHAUSTED')).toBe(true);
    expect(isMauLimitError('Missing end_user_id')).toBe(false);
  });

  it('lists end users from nested API payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      end_users: [{ end_user_id: 'guest:one' }, { end_user_id: 'google:sub' }],
    }), { status: 200 }));

    await expect(listEndUsers()).resolves.toEqual(['guest:one', 'google:sub']);
  });

  it('treats 404 delete as success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      ERROR: 'End user not found or already deleted: guest:gone',
    }), { status: 404 }));

    await expect(deleteEndUser('guest:gone')).resolves.toBe(true);
  });

  it('deletes every listed end user', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
      },
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        end_user_ids: ['guest:a', 'guest:b'],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }));

    await expect(deleteAllEndUsers()).resolves.toEqual({ deleted: 2, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
