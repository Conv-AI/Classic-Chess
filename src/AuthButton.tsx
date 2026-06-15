import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import {
  fetchAuthUser,
  getGoogleClientId,
  signInWithGoogleCredential,
  signOutGoogle,
  type AuthUser,
} from './auth';
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

export default function AuthButton({ user, onUserChange }: Props) {
  const googleClientId = getGoogleClientId();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchAuthUser()
      .then((nextUser) => {
        if (!cancelled) onUserChange(nextUser);
      })
      .catch(() => {
        if (!cancelled) onUserChange(null);
      });
    return () => { cancelled = true; };
  }, [onUserChange]);

  useEffect(() => {
    if (user && buttonRef.current) {
      buttonRef.current.innerHTML = '';
      renderedRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!googleClientId || user || renderedRef.current) return;
    let cancelled = false;
    void loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return;
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
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
        });
        renderedRef.current = true;
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : 'Google sign-in failed.'));
    return () => { cancelled = true; };
  }, [googleClientId, onUserChange, user]);

  async function handleSignOut() {
    unlockUiAudio();
    playUiSound('tap');
    setStatus('Signing out...');
    try {
      await signOutGoogle();
      window.google?.accounts?.id?.disableAutoSelect();
      onUserChange(null);
      setOpen(false);
      setStatus('');
      renderedRef.current = false;
    } catch {
      setStatus('Could not sign out.');
    }
  }

  if (!googleClientId && !user) return null;

  return (
    <div className="auth-control">
      {user ? (
        <div className="auth-user-menu">
          <Tooltip text="Google account and Convai memory" placement="bottom">
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
              <button type="button" onClick={() => void handleSignOut()}>
                <LogOut size={15} aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="auth-login-shell">
          <button type="button" className="auth-login-button" tabIndex={-1} aria-hidden="true">
            <span className="auth-google-mark">G</span>
            <span className="auth-login-copy">
              <strong>Sign in</strong>
            </span>
          </button>
          <div className="google-signin-hitbox" ref={buttonRef} />
        </div>
      )}
      {status && <div className="auth-status">{status}</div>}
    </div>
  );
}
