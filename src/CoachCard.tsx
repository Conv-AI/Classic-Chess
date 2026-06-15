import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { CoachConfig } from './coachConfig';
import { chessConvai } from './convaiManager';
import { debugLog } from './debugLog';
import ReallusionCharacter from './ReallusionCharacter';
import Tooltip from './Tooltip';
import { playUiSound, unlockUiAudio } from './uiSounds';

const DEFAULT_CHARACTER_ASSET_BASE = import.meta.env.BASE_URL;
const CHARACTER_ASSET_BASE = import.meta.env.VITE_CHARACTER_ASSET_BASE_URL || DEFAULT_CHARACTER_ASSET_BASE;
const assetUrl = (fileName: string) => `${CHARACTER_ASSET_BASE.replace(/\/?$/, '/')}${fileName}`;

const FRAMING_BY_ASSET: Record<string, {
  topInsetWorld: number;
  portraitCropBias: number;
  horizontalOffset: number;
}> = {
  Vincent: { topInsetWorld: 0.035, portraitCropBias: 0.02, horizontalOffset: 0.07 },
  Tyler: { topInsetWorld: 0.035, portraitCropBias: 0.02, horizontalOffset: 0.07 },
  Cassandra: { topInsetWorld: 0.035, portraitCropBias: 0.02, horizontalOffset: 0 },
  Danielle: { topInsetWorld: 0.02, portraitCropBias: 0.01, horizontalOffset: 0 },
};

type Props = {
  coach: CoachConfig;
  status: string;
  lastLine?: string;
  onReady?: () => void;
  onAddToDataset?: () => void;
  chatOpen?: boolean;
  onChatToggle?: () => void;
};

type CharacterErrorBoundaryProps = {
  children: ReactNode;
  onError: (error: Error) => void;
  resetKey: string;
};

class CharacterErrorBoundary extends Component<CharacterErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  componentDidUpdate(prevProps: CharacterErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function CoachCard({
  coach,
  status,
  lastLine,
  onReady,
  onAddToDataset,
  chatOpen = false,
  onChatToggle,
}: Props) {
  const modelUrl = assetUrl(coach.modelFile);
  const idleUrl = assetUrl(coach.idleFile);
  const framing = FRAMING_BY_ASSET[coach.assetName] ?? FRAMING_BY_ASSET.Danielle;
  const lineRef = useRef<HTMLParagraphElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const readyNotifiedRef = useRef(false);
  const [characterReady, setCharacterReady] = useState(false);
  const [characterFailed, setCharacterFailed] = useState(false);
  const [isMobileCanvas] = useState(() => (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse), (max-width: 700px)').matches
  ));
  const [displayedLine, setDisplayedLine] = useState('');
  const revealTargetRef = useRef('');
  const revealShownRef = useRef('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const suppressThinkingUntilRef = useRef(0);

  useEffect(() => chessConvai.onStatus((s) => {
    const now = Date.now();
    if (s.speaking) suppressThinkingUntilRef.current = now + 650;
    setMicEnabled(s.micEnabled);
    setBotSpeaking(s.speaking);
    setBotThinking(s.thinking && !s.speaking && now >= suppressThinkingUntilRef.current);
  }), []);

  useGLTF.preload(modelUrl);
  useGLTF.preload(idleUrl);
  debugLog('CoachCard', `Rendering coach=${coach.id} model=${coach.modelFile}`);

  const MAX_BUBBLE_HEIGHT = 210;
  const characterResetKey = `${coach.id}:${modelUrl}:${idleUrl}`;

  useEffect(() => {
    readyNotifiedRef.current = false;
    setCharacterReady(false);
    setCharacterFailed(false);
  }, [characterResetKey]);

  const handleCharacterReady = useCallback(() => {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    debugLog('CoachCard', `Portrait ready for coach=${coach.id}`);
    setCharacterReady(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onReady?.();
      });
    });
  }, [onReady]);

  const handleCharacterError = useCallback((error: Error) => {
    setCharacterFailed(true);
    debugLog('CoachCard', `Character failed to load for coach=${coach.id}: ${error.message}`);
  }, [coach.id]);

  // Keep the typewriter target in sync with the latest coach line. When the new
  // text isn't a continuation of what's already shown (i.e. a brand-new line),
  // restart the reveal from the beginning.
  useEffect(() => {
    const target = lastLine ?? '';
    revealTargetRef.current = target;
    if (!target || !target.startsWith(revealShownRef.current)) {
      revealShownRef.current = '';
      setDisplayedLine('');
    }
  }, [lastLine]);

  // Reveal the coach line smoothly at roughly her speaking cadence so the caption
  // streams in as she talks instead of appearing all at once when speech ends.
  useEffect(() => {
    const CHARS_PER_SEC = 26;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      const target = revealTargetRef.current;
      const shown = revealShownRef.current;
      if (shown.length < target.length) {
        carry += (dt / 1000) * CHARS_PER_SEC;
        if (carry >= 1) {
          const add = Math.min(target.length - shown.length, Math.floor(carry));
          carry -= add;
          const nextShown = target.slice(0, shown.length + add);
          revealShownRef.current = nextShown;
          setDisplayedLine(nextShown);
        }
      } else {
        carry = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    if (!displayedLine) {
      wrap.style.height = '0px';
      wrap.classList.remove('is-clipped');
      return;
    }

    const el = lineRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      const natural = el.offsetHeight;
      const capped = Math.min(natural, MAX_BUBBLE_HEIGHT);
      wrap.style.height = `${capped}px`;
      wrap.classList.toggle('is-clipped', natural > MAX_BUBBLE_HEIGHT);
      // Keep the newest revealed text in view while the line types out.
      wrap.scrollTop = wrap.scrollHeight;
    });
  }, [displayedLine]);

  return (
    <section className="coach-card character-card" aria-label={`${coach.name} chess coach`}>
      <div className={`character-window${characterReady ? ' is-ready' : ''}${characterFailed ? ' has-error' : ''}`}>
        <Canvas
          camera={{ position: [0, 1.4, 0.9], fov: 36 }}
          dpr={isMobileCanvas ? [1, 1.35] : [1.25, 2]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          style={{ background: coach.bgColor }}
          onCreated={({ camera, gl, scene }) => {
            debugLog('CoachCard', `3D scene ready for coach=${coach.id}`);
            camera.lookAt(0, 1.4, 0);
            scene.background = null;
            gl.setClearColor(coach.bgColor, 1);
            gl.toneMappingExposure = 1.08;
          }}
        >
          <ambientLight intensity={0.9} />
          <directionalLight position={[1, 2, 2]} intensity={1.1} />
          <directionalLight position={[-1, 1, 0]} intensity={0.45} />
          <pointLight position={[0, 1.5, 1]} intensity={0.35} color="#ffe0c0" />
          <CharacterErrorBoundary resetKey={characterResetKey} onError={handleCharacterError}>
            <Suspense fallback={null}>
              <ReallusionCharacter
                coachId={coach.id as import('./coachConfig').CoachId}
                assetName={coach.assetName}
                charUrl={modelUrl}
                animUrl={idleUrl}
                onReady={handleCharacterReady}
                framing={{
                  cameraZ: 0.9,
                  fov: 36,
                  lookAtY: 1.4,
                  topInsetWorld: framing.topInsetWorld,
                  portraitCropBias: framing.portraitCropBias,
                  horizontalOffset: framing.horizontalOffset,
                }}
              />
            </Suspense>
          </CharacterErrorBoundary>
        </Canvas>
        {!characterReady && (
          <div className="character-loading" aria-live="polite">
            <span className="character-loading-mark">{characterFailed ? '!' : coach.name.charAt(0)}</span>
            <strong>{characterFailed ? 'Coach could not load' : `Loading ${coach.name}`}</strong>
          </div>
        )}
        {characterReady && (
          <CharacterActivity
            micEnabled={micEnabled}
            thinking={botThinking}
            botSpeaking={botSpeaking}
          />
        )}
      </div>
      <div className="character-caption">
        <div className="caption-info">
          <strong>{coach.name}</strong>
          <span>{status}</span>
        </div>
        <div className="caption-actions">
          {onChatToggle && (
            <Tooltip text="Ask your coach about the position" placement="top">
              <button
                type="button"
                className={`coach-chat-btn${chatOpen ? ' is-open' : ''}`}
                onClick={() => {
                  unlockUiAudio();
                  playUiSound('tap');
                  onChatToggle();
                }}
                aria-label={chatOpen ? 'Close chat' : `Chat with ${coach.name}`}
                aria-expanded={chatOpen}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"
                  />
                </svg>
              </button>
            </Tooltip>
          )}
          {onAddToDataset && (
            <Tooltip text="Log this dialogue exchange to dataset" placement="top">
              <button
                type="button"
                className="add-dataset-btn"
                onClick={() => {
                  unlockUiAudio();
                  playUiSound('tap');
                  onAddToDataset();
                }}
                aria-label="Add to dataset"
              >
                +
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      <div ref={wrapRef} className="coach-line-wrap">
        {displayedLine && <p ref={lineRef} className="coach-line">{displayedLine}</p>}
      </div>
    </section>
  );
}

/**
 * Overlays the character window with a compact status chip for live mic listening or
 * coach thinking. Speech itself is handled by the caption below the portrait.
 */
function CharacterActivity({
  micEnabled,
  thinking,
  botSpeaking,
}: {
  micEnabled: boolean;
  thinking: boolean;
  botSpeaking: boolean;
}) {
  const mode = thinking ? 'thinking' : (micEnabled && !botSpeaking) ? 'listening' : null;
  if (!mode) return null;

  return (
    <div className={`coach-activity-chip is-${mode}`} aria-live="polite">
      {mode === 'thinking' ? (
        <>
          <span>Thinking</span>
          <span className="activity-dots"><i /><i /><i /></span>
        </>
      ) : (
        <>
          <span className="activity-mic-dot" />
          <span>Listening</span>
        </>
      )}
    </div>
  );
}
