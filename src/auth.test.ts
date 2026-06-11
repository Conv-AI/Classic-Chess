import { describe, expect, it } from 'vitest';
import { authUserFromGoogleCredential, authUserToIdentity } from './auth';

function fakeJwt(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `header.${encoded}.signature`;
}

describe('authUserToIdentity', () => {
  it('maps a verified Google user to a stable Convai end user id', () => {
    const identity = authUserToIdentity({
      id: 'google-sub-123',
      name: 'Akshi',
      email: 'akshi@example.com',
      picture: 'https://example.com/avatar.png',
    });

    expect(identity).toEqual({
      displayName: 'Akshi',
      endUserId: 'google:google-sub-123',
      endUserMetadata: {
        name: 'Akshi',
        email: 'akshi@example.com',
        picture: 'https://example.com/avatar.png',
        provider: 'google',
      },
    });
  });

  it('falls back to email as display name when Google name is absent', () => {
    const identity = authUserToIdentity({
      id: 'sub-456',
      name: '   ',
      email: 'student@example.com',
    });

    expect(identity?.displayName).toBe('student@example.com');
    expect(identity?.endUserId).toBe('google:sub-456');
  });

  it('returns null for guest users', () => {
    expect(authUserToIdentity(null)).toBeNull();
  });

  it('can derive the same auth user from a Google ID token payload for static hosting', () => {
    const user = authUserFromGoogleCredential(fakeJwt({
      sub: 'static-sub-789',
      name: 'Static User',
      email: 'static@example.com',
      picture: 'https://example.com/static.png',
    }));

    expect(user).toEqual({
      id: 'static-sub-789',
      name: 'Static User',
      email: 'static@example.com',
      picture: 'https://example.com/static.png',
    });
    expect(authUserToIdentity(user)?.endUserId).toBe('google:static-sub-789');
  });
});
