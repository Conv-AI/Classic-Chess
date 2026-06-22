import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import {
  fetchAuthUser,
  getGoogleClientId,
  signInWithGoogleCredential,
  signOutAuth,
  type AuthUser,
} from './auth';
import {
  applyConvaiSessionApiKey,
  convaiSessionToAuthUser,
  fetchConvaiAuthSession,
  isConvaiAuthConfigured,
  signInWithConvaiRedirect,
} from './convaiAuth';
import Tooltip from './Tooltip';
import { playUiSound, unlockUiAudio } from './uiSounds';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize(options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'small' | 'medium' | 'large';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
            },
          ): void;
          disableAutoSelect(): void;
        };
      };
    };
  }
}

type Props = {
  user: AuthUser | null;
  onUserChange: (user: AuthUser | null) => void;
  onApiKeyApplied?: () => void;
};

let googleScriptPromise: Promise<void> | null = null;
let googleIdentityInitialized = false;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google sign-in.'));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

async function restoreConvaiSession(
  onUserChange: (user: AuthUser | null) => void,
  onApiKeyApplied?: () => void,
): Promise<AuthUser | null> {
  const session = await fetchConvaiAuthSession();
  if (!session) return null;
  const nextUser = convaiSessionToAuthUser(session);
  if (applyConvaiSessionApiKey(session)) onApiKeyApplied?.();
  onUserChange(nextUser);
  return nextUser;
}

export default function AuthButton({ user, onUserChange, onApiKeyApplied }: Props) {
  const googleClientId = getGoogleClientId();
  const convaiAuthEnabled = isConvaiAuthConfigured();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleRenderedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cachedUser = await fetchAuthUser();
      if (cancelled) return;
      if (cachedUser) {
        onUserChange(cachedUser);
        return;
      }
      if (!convaiAuthEnabled) {
        onUserChange(null);
        return;
      }
      const convaiUser = await restoreConvaiSession(onUserChange, onApiKeyApplied);
      if (!cancelled && !convaiUser) onUserChange(null);
    })().catch(() => {
      if (!cancelled) onUserChange(null);
    });
    return () => { cancelled = true; };
  }, [convaiAuthEnabled, onApiKeyApplied, onUserChange]);

  useEffect(() => {
    if (user && googleButtonRef.current) {
      googleButtonRef.current.innerHTML = '';
      googleRenderedRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!googleClientId || user || googleRenderedRef.current) return;
    let cancelled = false;
    void loadGoogleScript()
      .then(() => {
        if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) return;
        if (!googleIdentityInitialized) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            ux_mode: 'popup',
            auto_select: false,
            callback: (response) => {
              const credential = response.credential;
              if (!credential) {
                setStatus('Google did not return a credential.');
                return;
              }
              setStatus('Signing in...');
              void signInWithGoogleCredential(credential)
                .then((nextUser) => {
                  onUserChange(nextUser);
                  setStatus('');
                })
                .catch((err) => {
                  setStatus(err instanceof Error ? err.message : 'Google sign-in failed.');
                });
            },
          });
          googleIdentityInitialized = true;
        }
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: convaiAuthEnabled ? 'medium' : 'large',
          shape: 'pill',
          text: 'signin_with',
        });
        googleRenderedRef.current = true;
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : 'Google sign-in failed.'));
    return () => { cancelled = true; };
  }, [convaiAuthEnabled, googleClientId, onUserChange, user]);

  async function handleSignOut() {
    unlockUiAudio();
    playUiSound('tap');
    setStatus('Signing out...');
    try {
      await signOutAuth(user);
      window.google?.accounts?.id?.disableAutoSelect();
      onUserChange(null);
      onApiKeyApplied?.();
      setOpen(false);
      setStatus('');
      googleRenderedRef.current = false;
    } catch {
      setStatus('Could not sign out.');
    }
  }

  function handleConvaiSignIn() {
    unlockUiAudio();
    playUiSound('tap');
    setStatus('Redirecting to Convai...');
    signInWithConvaiRedirect();
  }

  if (!googleClientId && !convaiAuthEnabled && !user) return null;

  const providerLabel = user?.provider === 'convai' ? 'Convai account and API key' : 'Google account and Convai memory';

  return (
    <div className="auth-control">
      {user ? (
        <div className="auth-user-menu">
          <Tooltip text={providerLabel} placement="bottom">
            <button
              type="button"
              className="auth-avatar-button"
              onClick={() => {
                unlockUiAudio();
                playUiSound('tap');
                setOpen((value) => !value);
              }}
            >
              {user.picture ? <img src={user.picture} alt="" /> : <UserRound size={17} aria-hidden="true" />}
              <span>{user.name || user.email}</span>
            </button>
          </Tooltip>
          {open && (
            <div className="auth-popover">
              <strong>{user.name || 'Signed in'}</strong>
              <span>{user.email}</span>
              {user.provider === 'convai' && <span className="auth-provider-tag">Convai</span>}
              <button type="button" onClick={() => void handleSignOut()}>
                <LogOut size={15} aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="auth-login-options">
          {googleClientId && (
            <div className="auth-login-shell">
              <button type="button" className="auth-login-button" tabIndex={-1} aria-hidden="true">
                <span className="auth-google-mark">G</span>
                <span className="auth-login-copy">
                  <strong>Google</strong>
                </span>
              </button>
              <div className="google-signin-hitbox" ref={googleButtonRef} />
            </div>
          )}
          {convaiAuthEnabled && (
            <button type="button" className="auth-login-button auth-convai-button" onClick={handleConvaiSignIn}>
              <span className="auth-convai-mark" aria-hidden="true">C</span>
              <span className="auth-login-copy">
                <strong>Convai</strong>
              </span>
            </button>
          )}
        </div>
      )}
      {status && <div className="auth-status">{status}</div>}
    </div>
  );
}
