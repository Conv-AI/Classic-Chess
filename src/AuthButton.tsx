import { useEffect, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import {
  fetchAuthUser,
  getGoogleClientId,
  signOutAuth,
  type AuthUser,
} from './auth';
import AuthSignInModal from './AuthSignInModal';
import {
  applyConvaiSessionApiKey,
  clearConvaiAuthPending,
  convaiSessionToAuthUser,
  fetchConvaiAuthSession,
  isConvaiAuthOffered,
  isConvaiAuthPending,
} from './convaiAuth';
import { disableGoogleAutoSelect } from './googleSignIn';
import Tooltip from './Tooltip';
import { playUiSound, unlockUiAudio } from './uiSounds';

type Props = {
  user: AuthUser | null;
  onUserChange: (user: AuthUser | null) => void;
  onApiKeyApplied?: () => void;
};

export function isAuthOffered(): boolean {
  return Boolean(getGoogleClientId()) || isConvaiAuthOffered();
}

export default function AuthButton({ user, onUserChange, onApiKeyApplied }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [convaiSuccessUser, setConvaiSuccessUser] = useState<AuthUser | null>(null);
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

      if (isConvaiAuthPending() && isConvaiAuthOffered()) {
        const session = await fetchConvaiAuthSession();
        if (cancelled) return;
        if (session) {
          const nextUser = convaiSessionToAuthUser(session);
          if (applyConvaiSessionApiKey(session)) onApiKeyApplied?.();
          clearConvaiAuthPending();
          onUserChange(nextUser);
          setConvaiSuccessUser(nextUser);
          setSignInModalOpen(true);
          return;
        }
        clearConvaiAuthPending();
      }

      if (!cancelled) onUserChange(null);
    })().catch(() => {
      if (!cancelled) onUserChange(null);
    });
    return () => { cancelled = true; };
  }, [onApiKeyApplied, onUserChange]);

  async function handleSignOut() {
    unlockUiAudio();
    playUiSound('tap');
    setStatus('Signing out...');
    try {
      await signOutAuth(user);
      disableGoogleAutoSelect();
      onUserChange(null);
      onApiKeyApplied?.();
      setPopoverOpen(false);
      setStatus('');
    } catch {
      setStatus('Could not sign out.');
    }
  }

  function openSignInModal() {
    unlockUiAudio();
    playUiSound('tap');
    setConvaiSuccessUser(null);
    setSignInModalOpen(true);
  }

  function closeSignInModal() {
    setSignInModalOpen(false);
    setConvaiSuccessUser(null);
  }

  function handleSignedIn(nextUser: AuthUser) {
    onUserChange(nextUser);
    if (nextUser.provider === 'convai') onApiKeyApplied?.();
  }

  if (!isAuthOffered() && !user) return null;

  const providerLabel = user?.provider === 'convai' ? 'Convai account and API key' : 'Google account and Convai memory';

  return (
    <>
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
                  setPopoverOpen((value) => !value);
                }}
              >
                {user.picture ? <img src={user.picture} alt="" /> : <UserRound size={17} aria-hidden="true" />}
                <span>{user.name || user.email}</span>
              </button>
            </Tooltip>
            {popoverOpen && (
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
          <button type="button" className="auth-signin-trigger" onClick={openSignInModal}>
            Sign in
          </button>
        )}
        {status && <div className="auth-status">{status}</div>}
      </div>

      <AuthSignInModal
        open={signInModalOpen}
        onClose={closeSignInModal}
        onUserChange={handleSignedIn}
        startInSuccess={convaiSuccessUser}
      />
    </>
  );
}
