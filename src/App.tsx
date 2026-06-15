import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Chess, type Move, type Square } from 'chess.js';
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Clipboard } from 'lucide-react';
import { analyzeGame } from './analysis';
import AuthButton from './AuthButton';
import { authUserToIdentity, fetchAuthUser, getCachedAuthUser, resolveConvaiConnectionEndUserId, type AuthUser, type UserIdentity } from './auth';
import ApiKeyModal from './ApiKeyModal';
import ChatDrawer from './ChatDrawer';
import { getCoach, getDifficulty, type CoachId, type DifficultyConfig, type DifficultyId } from './coachConfig';
import { hasConvaiApiKey as hasConvaiApiKeyConfigured, createCustomCoach, DEFAULT_MODEL, fetchLanguages, fetchVoices, filterVoicesForLanguage, MODEL_OPTIONS, pickDefaultVoice, type LanguageOption, type VoiceOption } from './convaiCoreApi';
import { hasConvaiApiKey } from './convaiApiKey';
import { saveCustomCoach } from './customCoaches';
import { analyzeCoachMoveContext, buildCoachInstruction, buildDynamicCoachInfo, buildGameOverDynamicInfo, buildWelcomeDynamicInfo, legalTargets } from './chessAi';
import { playUiSound, playYourTurnSound, unlockUiAudio } from './uiSounds';
import Tooltip from './Tooltip';
import { chessConvai } from './convaiManager';
import { copyLogToClipboard, debugLog } from './debugLog';
import CoachCard from './CoachCard';
import DatasetScreen from './DatasetScreen';
import LoadingScreen from './LoadingScreen';
import MenuScreen from './MenuScreen';
import { PUZZLES, puzzleScore, type Puzzle } from './puzzles';
import { stockfishEngine } from './stockfishEngine';
import {
  createSessionId,
  deleteSession,
  loadCoachingControlMode,
  loadPuzzleProgress,
  loadSessions,
  markPuzzleCompleted,
  resetPuzzleProgress,
  saveCoachingControlMode,
  saveSession,
  type AnalysisSummary,
  type CoachingControlMode,
  type KeyMoment,
  type MoveSnapshot,
  type StoredGameSession,
} from './storage';
import type { MoveRecord } from './types';

const DATASET_TOOLS_ENABLED = __DATASET_TOOLS_ENABLED__;

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PIECES: Record<string, string> = {
  wp: '\u2659',
  wn: '\u2658',
  wb: '\u2657',
  wr: '\u2656',
  wq: '\u2655',
  wk: '\u2654',
  bp: '\u265f',
  bn: '\u265e',
  bb: '\u265d',
  br: '\u265c',
  bq: '\u265b',
  bk: '\u265a',
};

type Screen = 'menu' | 'loading' | 'game' | 'puzzles' | 'games' | 'creator' | 'dataset';

type DialogueExchange = {
  timestamp: string;
  coachId: CoachId;
  coachName: string;
  difficultyId: DifficultyId;
  fen: string;
  dynamicInfo: string;
  prompt: string;
  coachResponse: string;
  wasSilent: boolean;
};

function squareAt(fileIndex: number, rankIndex: number): Square {
  return `${FILES[fileIndex]}${8 - rankIndex}` as Square;
}

function clickBack(action: () => void) {
  unlockUiAudio();
  playUiSound('back');
  action();
}

function addStudentContext(text: string, identity: UserIdentity | null): string {
  if (!identity) return text;
  return [
    text,
    `Signed-in student profile: their preferred name is ${identity.displayName}.`,
    'Use the student name naturally when it helps, but do not overuse it.',
  ].join(' ');
}

function buildLongTermGameMemory(analysis: AnalysisSummary, difficulty: DifficultyConfig): string {
  const firstTip = analysis.tips[0] ?? 'keep scanning checks, captures, and threats before quiet moves';
  const issue = analysis.blunders > 0
    ? `${analysis.blunders} blunder${analysis.blunders > 1 ? 's' : ''}`
    : analysis.mistakes > 0
      ? `${analysis.mistakes} mistake${analysis.mistakes > 1 ? 's' : ''}`
      : analysis.inaccuracies > 0
        ? `${analysis.inaccuracies} inaccuracy${analysis.inaccuracies > 1 ? 'ies' : 'y'}`
        : 'a mostly solid game';
  return `In a ${difficulty.label} chess game, the student had ${issue}; useful coaching focus: ${firstTip}.`;
}

function wheelDeltaToPixels(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

function canScrollVertically(el: HTMLElement, deltaY: number) {
  const maxScroll = el.scrollHeight - el.clientHeight;
  if (maxScroll <= 1) return false;
  if (deltaY > 0) return el.scrollTop < maxScroll - 1;
  if (deltaY < 0) return el.scrollTop > 1;
  return false;
}

function findScrollableAncestor(target: Element, root: HTMLElement, deltaY: number) {
  let el: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
  while (el && el !== root) {
    const style = window.getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && canScrollVertically(el, deltaY)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function createSmoothWheelScroller() {
  let target: HTMLElement | null = null;
  let targetTop = 0;
  let raf = 0;

  const step = () => {
    if (!target) {
      raf = 0;
      return;
    }

    const diff = targetTop - target.scrollTop;
    if (Math.abs(diff) < 0.5) {
      target.scrollTop = targetTop;
      target = null;
      raf = 0;
      return;
    }

    target.scrollTop += diff * 0.28;
    raf = requestAnimationFrame(step);
  };

  return {
    scroll(el: HTMLElement, deltaY: number) {
      if (target !== el) {
        target = el;
        targetTop = el.scrollTop;
      }
      const maxScroll = el.scrollHeight - el.clientHeight;
      targetTop = Math.max(0, Math.min(maxScroll, targetTop + deltaY));
      if (!raf) raf = requestAnimationFrame(step);
    },
    cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      target = null;
    },
  };
}

function useWheelScrollBridge() {
  useEffect(() => {
    const smoothScroller = createSmoothWheelScroller();

    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey) return;
      if (!(event.target instanceof Element)) return;

      const screen = event.target.closest('.game-screen, .menu-screen, .app-menu');
      if (!(screen instanceof HTMLElement) || screen.classList.contains('loading-screen')) return;

      const deltaY = wheelDeltaToPixels(event);
      if (!deltaY || findScrollableAncestor(event.target, screen, deltaY)) return;

      const pageScroller = document.scrollingElement instanceof HTMLElement
        ? document.scrollingElement
        : null;
      const scrollTarget = pageScroller && canScrollVertically(pageScroller, deltaY)
        ? pageScroller
        : canScrollVertically(screen, deltaY)
          ? screen
          : null;
      if (!scrollTarget || !canScrollVertically(scrollTarget, deltaY)) return;

      smoothScroller.scroll(scrollTarget, deltaY);
      event.preventDefault();
    };

    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true });
      smoothScroller.cancel();
    };
  }, []);
}

function MicButton({ className }: { className?: string }) {
  const [micOn, setMicOn] = useState(false);

  useEffect(() => {
    return chessConvai.onStatus((s) => setMicOn(s.micEnabled));
  }, []);

  function toggle() {
    unlockUiAudio();
    playUiSound('toggle');
    void chessConvai.setMicEnabled(!micOn);
  }

  return (
    <Tooltip text={micOn ? 'Mute microphone' : 'Enable microphone'} placement="bottom">
      <button
        className={`mic-button ${micOn ? 'mic-on' : ''} ${className ?? ''}`}
        onClick={toggle}
        aria-label={micOn ? 'Mute microphone' : 'Enable microphone'}
      >
        {micOn ? '🎙' : '🎤'}
      </button>
    </Tooltip>
  );
}

function App() {
  useWheelScrollBridge();

  const [screen, setScreen] = useState<Screen>('menu');
  const [coachId, setCoachId] = useState<CoachId>('leila');
  const [difficultyId, setDifficultyId] = useState<DifficultyId>('intermediate');
  const [coachingControlMode, setCoachingControlModeState] = useState<CoachingControlMode>(() => loadCoachingControlMode());
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('Setting up the board...');
  const avatarReadyResolverRef = useRef<(() => void) | null>(null);
  const gameReadyResolverRef = useRef<(() => void) | null>(null);
  const loadingPhaseRef = useRef(0);
  const [sessions, setSessions] = useState<StoredGameSession[]>(() => loadSessions());
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(() => !hasConvaiApiKey());
  const [apiKeyVersion, setApiKeyVersion] = useState(0);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getCachedAuthUser());
  const userIdentity = useMemo(() => authUserToIdentity(authUser), [authUser]);
  const handleAuthUserChange = useCallback((user: AuthUser | null) => {
    setAuthUser(user);
    chessConvai.syncEndUserIdentity(authUserToIdentity(user));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthUser()
      .then((user) => {
        if (!cancelled) {
          setAuthUser(user);
          chessConvai.syncEndUserIdentity(authUserToIdentity(user));
        }
      })
      .catch(() => {
        if (!cancelled) {
          const cached = getCachedAuthUser();
          setAuthUser(cached);
          chessConvai.syncEndUserIdentity(authUserToIdentity(cached));
        }
      });
    return () => { cancelled = true; };
  }, []);

  const coach = getCoach(coachId);

  const handleCoachingControlModeChange = useCallback((mode: CoachingControlMode) => {
    setCoachingControlModeState(mode);
    saveCoachingControlMode(mode);
    debugLog('App', `coachingControlMode -> ${mode}`);
  }, []);

  const handleCoachAvatarReady = useCallback(() => {
    avatarReadyResolverRef.current?.();
    avatarReadyResolverRef.current = null;
  }, []);

  const handleGameReady = useCallback(() => {
    gameReadyResolverRef.current?.();
    gameReadyResolverRef.current = null;
  }, []);

  const advanceLoading = useCallback((phase: number, progress: number, step: string) => {
    if (phase < loadingPhaseRef.current) return;
    loadingPhaseRef.current = phase;
    setLoadingProgress(progress);
    setLoadingStep(step);
  }, []);

  useEffect(() => {
    return chessConvai.onStatus((status) => {
      if (status.activeCoachId !== coachId) return;
      if (screen !== 'loading' || loadingPhaseRef.current >= 4) return;
      if (status.botReady) {
        advanceLoading(3, 80, `Getting ${coach.name} ready...`);
      } else if (status.connected) {
        advanceLoading(2, 72, `Warming up ${coach.name}...`);
      } else if (status.connecting) {
        advanceLoading(1, 45, `Connecting ${coach.name}...`);
      }
    });
  }, [coach.name, coachId, screen, advanceLoading]);

  async function startQuickPlay() {
    if (!hasConvaiApiKey()) {
      setApiKeyModalOpen(true);
      return;
    }
    debugLog('App', `startQuickPlay — mode=quick-play coach=${coach.id} difficulty=${difficultyId}`);
    chessConvai.unlockAudio();
    const selectedCoach = coach;
    setScreen('loading');
    loadingPhaseRef.current = 0;
    advanceLoading(1, 18, `Loading ${selectedCoach.name} and the chess room...`);
    const avatarReady = new Promise<void>((resolve) => {
      avatarReadyResolverRef.current = resolve;
    });
    debugLog('App', `Awaiting connectCoach + avatar prewarm for ${selectedCoach.name}`);
    const gameReady = new Promise<void>((resolve) => {
      gameReadyResolverRef.current = resolve;
    });
    const staticPolicy = buildCoachInstruction(selectedCoach, getDifficulty(difficultyId), 'move');
    await Promise.all([
      chessConvai.connectCoach(selectedCoach, {
        staticPolicy,
        waitForBotReady: true,
        readyWaitMs: 5000,
        endUserId: resolveConvaiConnectionEndUserId(userIdentity),
        endUserMetadata: userIdentity?.endUserMetadata,
      }),
      avatarReady,
    ]);
    const convaiStatus = chessConvai.getStatus();
    if (!convaiStatus.connected || !convaiStatus.botReady) {
      debugLog(
        'App',
        `Convai not ready for ${selectedCoach.name} — connected=${convaiStatus.connected} botReady=${convaiStatus.botReady}. Starting game without voice.`,
      );
      gameReadyResolverRef.current?.();
      gameReadyResolverRef.current = null;
    } else {
      debugLog('App', `Coach connected — finishing game setup before revealing board`);
      advanceLoading(4, 92, `${selectedCoach.name} is about to speak...`);
      await Promise.race([
        gameReady,
        new Promise<void>((resolve) => window.setTimeout(resolve, 22000)),
      ]);
      gameReadyResolverRef.current = null;
    }
    setScreen('game');
  }

  const refreshSessions = useCallback(() => {
    setSessions(loadSessions());
  }, []);

  let body: ReactNode;
  if (screen === 'loading' || screen === 'game') {
    body = (
      <>
        <ChessGame
          coachId={coachId}
          difficultyId={difficultyId}
          coachingControlMode={coachingControlMode}
          userIdentity={userIdentity}
          isCovered={screen === 'loading'}
          onBackToMenu={() => {
            refreshSessions();
            setScreen('menu');
          }}
          onSessionsChanged={refreshSessions}
          onCoachReady={handleCoachAvatarReady}
          onGameReady={handleGameReady}
          key={`game-${coachId}-${coachingControlMode}`}
        />
        {screen === 'loading' && (
          <LoadingScreen progress={loadingProgress} step={loadingStep} />
        )}
      </>
    );
  } else if (screen === 'puzzles') {
    body = <PuzzleScreen coachId={coachId} difficultyId={difficultyId} userIdentity={userIdentity} onBack={() => setScreen('menu')} key={`puzzles-${coachId}`} />;
  } else if (screen === 'games') {
    body = (
      <MyGamesScreen
        sessions={sessions}
        onBack={() => {
          refreshSessions();
          setScreen('menu');
        }}
        onDelete={(id) => {
          deleteSession(id);
          refreshSessions();
        }}
      />
    );
  } else if (screen === 'creator') {
    body = <CustomCoachCreator onBack={() => setScreen('menu')} />;
  } else if (screen === 'dataset' && DATASET_TOOLS_ENABLED) {
    body = <DatasetScreen onBack={() => setScreen('menu')} />;
  } else {
    body = (
      <MenuScreen
        key={`menu-${apiKeyVersion}`}
        coachId={coachId}
        difficultyId={difficultyId}
        savedGameCount={sessions.length}
        coachingControlMode={coachingControlMode}
        onCoachChange={setCoachId}
        onDifficultyChange={setDifficultyId}
        onCoachingControlModeChange={handleCoachingControlModeChange}
        onQuickPlay={() => void startQuickPlay()}
        onPuzzles={() => setScreen('puzzles')}
        onGames={() => {
          refreshSessions();
          setScreen('games');
        }}
        onCreator={() => setScreen('creator')}
        onDataset={DATASET_TOOLS_ENABLED ? () => setScreen('dataset') : undefined}
        onManageApiKey={() => setApiKeyModalOpen(true)}
        authSlot={<AuthButton user={authUser} onUserChange={handleAuthUserChange} />}
      />
    );
  }

  return (
    <>
      {body}
      <ApiKeyModal
        open={apiKeyModalOpen}
        required={!hasConvaiApiKey()}
        onSaved={() => {
          setApiKeyModalOpen(false);
          setApiKeyVersion((v) => v + 1);
        }}
        onDismiss={hasConvaiApiKey() ? () => setApiKeyModalOpen(false) : undefined}
      />
    </>
  );
}

function CopyLogsButton() {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    unlockUiAudio();
    playUiSound('tap');
    try {
      await copyLogToClipboard();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (err) {
      console.warn('Failed to copy logs', err);
    }
  };
  return (
    <div className="debug-copy-wrap">
      <Tooltip text={copied ? 'Copied debug logs' : 'Copy debug logs'} placement="bottom">
        <button
          className="debug-copy-button"
          type="button"
          onClick={onCopy}
          aria-label="Copy debug logs"
        >
          <Clipboard size={20} strokeWidth={2.2} />
        </button>
      </Tooltip>
      {copied && <span className="debug-copy-tooltip">Copied!</span>}
    </div>
  );
}

function ChessGame({
  coachId,
  difficultyId,
  coachingControlMode,
  userIdentity,
  onBackToMenu,
  onSessionsChanged,
  onCoachReady,
  onGameReady,
  isCovered = false,
}: {
  coachId: CoachId;
  difficultyId: DifficultyId;
  coachingControlMode: CoachingControlMode;
  userIdentity: UserIdentity | null;
  onBackToMenu: () => void;
  onSessionsChanged: () => void;
  onCoachReady?: () => void;
  onGameReady?: () => void;
  isCovered?: boolean;
}) {
  const coach = getCoach(coachId);
  const difficulty = getDifficulty(difficultyId);
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [thinking, setThinking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [coachLine, setCoachLine] = useState('');
  const [hintText, setHintText] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [analysisPending, setAnalysisPending] = useState(false);
  const sessionIdRef = useRef(createSessionId());
  const analysisStartedRef = useRef(false);
  const gameOverHandledRef = useRef(false);
  const welcomeSpokenRef = useRef(false);
  const [welcomeDelivered, setWelcomeDelivered] = useState(false);
  const moveListRef = useRef<HTMLOListElement | null>(null);
  const prevThinkingRef = useRef(false);
  const [yourTurnPulse, setYourTurnPulse] = useState(false);
  const [convaiStatus, setConvaiStatus] = useState(chessConvai.getStatus());
  const [recentCoachSpeech, setRecentCoachSpeech] = useState(false);
  // Track which speech reasons were last fired and at which fullmove number, so we can
  // suppress repeated positional advice (e.g. "your king is still in the center").
  const spokenReasonsRef = useRef<Map<string, number>>(new Map());

  const [coachResponding, setCoachResponding] = useState(false);
  const [resigned, setResigned] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedMoveIdx, setSelectedMoveIdx] = useState<number | null>(null);
  const [coachGuidance, setCoachGuidance] = useState('');
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  const [lastExchange, setLastExchange] = useState<DialogueExchange | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [selectedExpected, setSelectedExpected] = useState<'silent' | 'talk'>('silent');

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? '' : current));
    }, 3000);
  }

  function openSaveModal() {
    if (!lastExchange) {
      showToast('No recent dialogue exchange to save.');
      return;
    }
    setSelectedExpected(lastExchange.wasSilent ? 'silent' : 'talk');
    setShowSaveModal(true);
  }

  async function handleAddToDataset(expectedResponse: 'silent' | 'talk') {
    if (!lastExchange) {
      showToast('No recent dialogue exchange to save.');
      return;
    }
    const payload = {
      ...lastExchange,
      sessionId: sessionIdRef.current,
      coachingControlMode,
      expectedResponse,
    };
    try {
      const res = await fetch('/api/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`Saved to dataset! Total entries: ${result.count}`);
      } else {
        showToast('Failed to save dialogue.');
      }
    } catch {
      showToast('Error connecting to dataset API.');
    }
  }

  const legalMoves = useMemo(() => {
    if (!selected) return [];
    return legalTargets(game.fen(), selected);
  }, [game, selected]);

  const lastMove = history[history.length - 1];
  const identityKey = userIdentity?.endUserId ?? 'guest';
  const convaiPreparing = convaiStatus.thinking || convaiStatus.convaiTurnInFlight || coachResponding || guidanceLoading;
  const status = convaiStatus.speaking
    ? `${coach.name} is speaking...`
    : thinking && !recentCoachSpeech
      ? `${coach.name} is calculating...`
      : convaiPreparing && !recentCoachSpeech
        ? `${coach.name} is thinking...`
        : resigned
          ? `You resigned. ${coach.name} wins.`
          : getStatus(game, coach.name);

  useEffect(() => chessConvai.onStatus(setConvaiStatus), []);

  useEffect(() => {
    if (convaiStatus.speaking) {
      setRecentCoachSpeech(true);
      return undefined;
    }
    if (!recentCoachSpeech) return undefined;
    const timer = window.setTimeout(() => setRecentCoachSpeech(false), 650);
    return () => window.clearTimeout(timer);
  }, [convaiStatus.speaking, recentCoachSpeech]);

  useEffect(() => {
    if (!isCovered || welcomeSpokenRef.current) return;
    if (!convaiStatus.botReady) return;
    welcomeSpokenRef.current = true;
    const freshGame = new Chess();
    const openingInfo = addStudentContext(buildDynamicCoachInfo(freshGame, null, null, coach, difficulty), userIdentity);
    const welcomeInfo = addStudentContext(buildWelcomeDynamicInfo(freshGame, coach, difficulty, sessionIdRef.current), userIdentity);
    void (async () => {
      let peeled = false;
      const peelLoading = () => {
        if (peeled) return;
        peeled = true;
        onGameReady?.();
      };

      const unsubResponse = chessConvai.onResponse((response) => {
        if (response.coachId === coach.id && response.text.trim()) peelLoading();
      });
      const unsubStatus = chessConvai.onStatus((status) => {
        if (status.activeCoachId === coach.id && status.speaking) peelLoading();
      });

      try {
        const spoken = await chessConvai.beginNewGame(
          coach,
          difficulty,
          sessionIdRef.current,
          openingInfo,
          userIdentity,
          welcomeInfo,
        );
        if (spoken) setCoachLine(spoken);
      } finally {
        unsubResponse();
        unsubStatus();
        peelLoading();
        setWelcomeDelivered(true);
      }
    })();
  }, [isCovered, convaiStatus.botReady, coach, difficulty, userIdentity, onGameReady]);

  useEffect(() => {
    if (isCovered || !welcomeDelivered) return;
    const staticPolicy = buildCoachInstruction(coach, difficulty, 'move');
    const dynamicInfo = addStudentContext(
      buildDynamicCoachInfo(game, null, lastMove ? moveRecordToMoveLike(lastMove) : null, coach, difficulty, history),
      userIdentity,
    );
    void chessConvai.connectCoach(coach, {
      waitForBotReady: true,
      readyWaitMs: 3500,
      reconnectIfStale: false,
      staticPolicy,
      endUserId: resolveConvaiConnectionEndUserId(userIdentity),
      endUserMetadata: userIdentity?.endUserMetadata ?? null,
    }).then(() => chessConvai.updateCoachContext(coach, dynamicInfo));
  }, [identityKey, welcomeDelivered, isCovered, coach, difficulty, userIdentity]);

  useEffect(() => {
    return chessConvai.onResponse((response) => {
      if (response.coachId === coach.id) {
        setCoachLine(response.text);
      }
    });
  }, [coach.id]);

  useEffect(() => {
    if (moveListRef.current) moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
  }, [history]);

  useEffect(() => {
    if (!history.length) return;
    persistCurrentSession(game, history, hintsUsed, coachId, difficultyId, analysis);
    onSessionsChanged();
  }, [analysis, coachId, difficultyId, game, hintsUsed, history, onSessionsChanged]);

  const gameEnded = game.isGameOver() || resigned;

  useEffect(() => {
    if (!gameEnded || analysisStartedRef.current) return;
    if (!history.length && !resigned) return;
    analysisStartedRef.current = true;
    setAnalysisPending(true);
    void analyzeGame(history, game.fen(), async (fen) => {
      // Analysis grades at full engine strength regardless of the level the game
      // was played at, capturing the evaluation so accuracy reflects how much each
      // move changed the position rather than just whether it matched the top move.
      const result = await stockfishEngine.analyzePosition(fen, 300, 20);
      return { bestSan: result.bestMove?.san ?? null, whiteCp: result.whiteCp };
    }).then((summary) => {
      setAnalysis(summary);
      setAnalysisPending(false);
      if (userIdentity) {
        void chessConvai.rememberGameSummary(coach, buildLongTermGameMemory(summary, difficulty));
      }
    });
  }, [coach, difficulty, userIdentity, game, history, gameEnded]);

  useEffect(() => {
    if (!gameEnded || gameOverHandledRef.current) return;
    gameOverHandledRef.current = true;
    let cancelled = false;
    void (async () => {
      if (resigned && history.length === 0) {
        chessConvai.interruptBot(coach);
        if (!cancelled) setShowGameOverModal(true);
        return;
      }
      const gameOverInfo = buildGameOverDynamicInfo(game, coach, difficulty, resigned);
      const spoken = await chessConvai.speakGameOver(coach, gameOverInfo);
      if (cancelled) return;
      if (spoken) setCoachLine(spoken);
      if (!cancelled) setShowGameOverModal(true);
    })();
    return () => { cancelled = true; };
  }, [coach, difficulty, game, gameEnded, history.length, resigned]);

  useEffect(() => {
    const wasThinking = prevThinkingRef.current;
    prevThinkingRef.current = thinking;
    if (wasThinking && !thinking && !gameEnded && game.turn() === 'w') {
      playYourTurnSound();
      setYourTurnPulse(true);
      const timer = window.setTimeout(() => setYourTurnPulse(false), 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [thinking, game, gameEnded]);

  function persistCurrentSession(
    currentGame: Chess,
    moves: MoveSnapshot[],
    hintCount: number,
    selectedCoachId: CoachId,
    selectedDifficultyId: DifficultyId,
    currentAnalysis: AnalysisSummary | null,
  ) {
    const now = new Date().toISOString();
    saveSession({
      id: sessionIdRef.current,
      createdAt: moves[0]?.fenBefore ? sessionIdRef.current.split('-').slice(1, 2)[0] ?? now : now,
      updatedAt: now,
      mode: 'quick-play',
      coachId: selectedCoachId,
      difficultyId: selectedDifficultyId,
      result: resultLabel(currentGame, coach.name, resigned),
      finalFen: currentGame.fen(),
      hintsUsed: hintCount,
      moves,
      analysis: currentAnalysis ?? undefined,
    });
  }

  async function resetGame() {
    const newSessionId = createSessionId();
    sessionIdRef.current = newSessionId;
    analysisStartedRef.current = false;
    gameOverHandledRef.current = false;
    welcomeSpokenRef.current = false;
    setWelcomeDelivered(false);
    spokenReasonsRef.current.clear();
    const freshGame = new Chess();
    setGame(freshGame);
    setSelected(null);
    setHistory([]);
    setThinking(false);
    setCoachLine('');
    setHintText('');
    setHintLevel(0);
    setHintsUsed(0);
    setAnalysis(null);
    setAnalysisPending(false);
    setCoachResponding(false);
    setResigned(false);
    setShowResignConfirm(false);
    setShowGameOverModal(false);
    setShowAnalysis(false);
    setSelectedMoveIdx(null);
    setCoachGuidance('');
    setGuidanceLoading(false);

    const openingInfo = addStudentContext(buildDynamicCoachInfo(freshGame, null, null, coach, difficulty), userIdentity);
    const welcomeInfo = addStudentContext(buildWelcomeDynamicInfo(freshGame, coach, difficulty, newSessionId), userIdentity);
    const spoken = await chessConvai.beginNewGame(
      coach,
      difficulty,
      newSessionId,
      openingInfo,
      userIdentity,
      welcomeInfo,
    );
    welcomeSpokenRef.current = true;
    setWelcomeDelivered(true);
    if (spoken) setCoachLine(spoken);
  }

  function makePlayerMove(from: Square, to: Square) {
    const next = new Chess(game.fen());
    const fenBefore = next.fen();
    const move = next.move({ from, to, promotion: 'q' });
    if (!move) return false;
    const record = toRecord(move, 'You', fenBefore, next.fen());
    debugLog('App', `Player move: ${move.san} (${from}→${to}) moveNo=${Number(next.fen().split(' ')[5])} fen="${next.fen()}"`);

    setGame(next);
    chessConvai.refreshBoardVision(coach, next.fen());
    setHistory((moves) => [...moves, record]);
    setSelected(null);
    setHintText('');
    setHintLevel(0);

    if (!next.isGameOver()) {
      chessConvai.interruptBot(coach);
      setThinking(true);
      void makeCoachMove(next.fen(), move, [...history, record]);
    }
    return true;
  }

  async function makeCoachMove(fen: string, playerMove?: Move, moveHistory: MoveRecord[] = history) {
    const next = new Chess(fen);
    const planned = await stockfishEngine.bestMove(next.fen(), difficulty.moveTimeMs, difficulty.stockfishSkill);
    const fullMoveNo = Number(next.fen().split(' ')[5]);
    const recentTopics = recentlySpokenTopics(spokenReasonsRef.current, fullMoveNo);
    const dynamicInfo = buildDynamicCoachInfo(next, planned, playerMove, coach, difficulty, moveHistory, recentTopics);
    const staticPolicy = buildCoachInstruction(coach, difficulty, 'move');
    await chessConvai.seedStaticCoachPolicy(coach, staticPolicy);
    chessConvai.refreshBoardVision(coach, next.fen());

    if (coachingControlMode === 'coach') {
      debugLog('makeCoachMove', `[coach-decides] dynamic context auto-LLM turn moveNo=${fullMoveNo} fen="${next.fen()}"`);
      const spoken = await chessConvai.runCoachTurn(coach, dynamicInfo, { runLlm: 'auto', waitForFullSpeech: true, preflightSilence: false, maxWaitMs: 18000 });

      if (DATASET_TOOLS_ENABLED) {
        setLastExchange({
          timestamp: new Date().toISOString(),
          coachId: coach.id,
          coachName: coach.name,
          difficultyId: difficulty.id,
          fen: next.fen(),
          dynamicInfo,
          prompt: '',
          coachResponse: spoken || '',
          wasSilent: !spoken,
        });
      }

      if (spoken) {
        setCoachLine(spoken);
      } else {
        setCoachLine('');
      }
    } else {
      const speech = analyzeCoachMoveContext(next, planned, playerMove, difficulty, moveHistory);
      const suppression = applyRepeatSuppression(speech, spokenReasonsRef.current, fullMoveNo);
      debugLog('makeCoachMove', `[game-decides] planned="${planned?.san ?? 'none'}" lastMove="${playerMove?.san ?? 'none'}" speech=${suppression.shouldSpeak ? 'yes' : 'no'} reason=${speech.reason}${suppression.suppressed ? ' [suppressed: ' + suppression.suppressedReasons.join(',') + ']' : ''} phase=${speech.phase} moveNo=${fullMoveNo} fen="${next.fen()}"`);
      if (suppression.shouldSpeak) {
        const spoken = await chessConvai.runCoachTurn(coach, dynamicInfo, { runLlm: 'true', waitForFullSpeech: true, preflightSilence: false, maxWaitMs: 18000 });

        if (DATASET_TOOLS_ENABLED) {
          setLastExchange({
            timestamp: new Date().toISOString(),
            coachId: coach.id,
            coachName: coach.name,
            difficultyId: difficulty.id,
            fen: next.fen(),
            dynamicInfo,
            prompt: '',
            coachResponse: spoken || '',
            wasSilent: !spoken,
          });
        }

        if (spoken) {
          setCoachLine(spoken);
          for (const r of speech.reasons) spokenReasonsRef.current.set(r, fullMoveNo);
        }
      } else {
        await chessConvai.updateCoachContext(coach, dynamicInfo);
      }
    }

    if (planned) {
      const fenBefore = next.fen();
      const applied = next.move(planned);
      if (applied) {
        const coachRecord = toRecord(applied, coach.name, fenBefore, next.fen());
        debugLog('App', `Coach move applied: ${applied.san} (${applied.from}→${applied.to}) moveNo=${Number(next.fen().split(' ')[5])} fen="${next.fen()}"`);
        setGame(next);
        chessConvai.refreshBoardVision(coach, next.fen());
        setHistory((moves) => [...moves, coachRecord]);
        if (coachingControlMode === 'game') {
          const afterReplyInfo = buildDynamicCoachInfo(next, null, applied, coach, difficulty, [...moveHistory, coachRecord], recentTopics);
          void chessConvai.updateCoachContext(coach, afterReplyInfo);
        }
      }
    }
    setThinking(false);
  }

  function handleSquareClick(square: Square) {
    chessConvai.unlockAudio();
    if (thinking || gameEnded || game.turn() !== 'w') return;
    const piece = game.get(square);
    if (selected) {
      if (selected === square) {
        setSelected(null);
        return;
      }
      if (piece?.color === 'w') {
        setSelected(square);
        return;
      }
      if (makePlayerMove(selected, square)) return;
      return;
    }
    if (piece?.color === 'w') setSelected(square);
  }

  async function askHint() {
    if (thinking || game.isGameOver() || game.turn() !== 'w') return;
    setCoachResponding(true);
    const nextLevel = Math.min(3, hintLevel + 1);
    setHintLevel(nextLevel);
    setHintsUsed((count) => count + 1);
    const best = await stockfishEngine.bestMove(game.fen(), 520, Math.max(10, difficulty.stockfishSkill));
    const localHint = buildHintText(nextLevel, best, coach.name);
    setHintText(localHint);
    const dynamicInfo = buildDynamicCoachInfo(game, best, lastMove ? moveRecordToMoveLike(lastMove) : null, coach, difficulty);
    await chessConvai.seedStaticCoachPolicy(coach, buildCoachInstruction(coach, difficulty, 'hint'));
    const prompt = [
      `The student asked for hint level ${nextLevel} of 3.`,
      nextLevel < 3 ? 'Do not reveal the exact move.' : `You may reveal this move naturally: ${best?.san ?? 'the best move'}.`,
      localHint,
      'Use 1-2 useful teaching sentences.',
    ].join(' ');
    const spoken = await chessConvai.speakCoachMessage(coach, prompt, dynamicInfo);

    if (DATASET_TOOLS_ENABLED) {
      setLastExchange({
        timestamp: new Date().toISOString(),
        coachId: coach.id,
        coachName: coach.name,
        difficultyId: difficulty.id,
        fen: game.fen(),
        dynamicInfo,
        prompt,
        coachResponse: spoken || '',
        wasSilent: !spoken,
      });
    }

    if (spoken) setCoachLine(spoken);
    setCoachResponding(false);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    unlockUiAudio();
    playUiSound('send');
    setChatInput('');
    setCoachResponding(true);
    const dynamicInfo = buildDynamicCoachInfo(game, null, lastMove ? moveRecordToMoveLike(lastMove) : null, coach, difficulty);
    const spoken = await chessConvai.sendUserChat(
      coach,
      difficulty,
      text,
      dynamicInfo,
    );

    if (DATASET_TOOLS_ENABLED) {
      setLastExchange({
        timestamp: new Date().toISOString(),
        coachId: coach.id,
        coachName: coach.name,
        difficultyId: difficulty.id,
        fen: game.fen(),
        dynamicInfo: `${buildCoachInstruction(coach, difficulty, 'chat')} ${dynamicInfo}`,
        prompt: `Student question: "${text}". Please answer as the chess coach using the current board context.`,
        coachResponse: spoken || '',
        wasSilent: !spoken,
      });
    }

    if (spoken) setCoachLine(spoken);
    setCoachResponding(false);
  }

  async function askAboutMove(moveIdx: number) {
    const move = history[moveIdx];
    if (!move || guidanceLoading) return;
    setGuidanceLoading(true);
    setCoachGuidance('');

    const moveNumber = Math.ceil((moveIdx + 1) / 2);
    const km = analysis?.keyMoments.find((m) => m.moveNumber === moveNumber && move.color === 'w');
    const quality = km ? km.label.toLowerCase() : (move.color === 'w' ? 'solid' : 'opponent');
    const studentMove = move.color === 'w';
    const moveOwner = studentMove
      ? 'you, the student playing White'
      : `I, ${coach.name}, playing Black`;

    const dynamicCtx = [
      `FEN before the move: ${move.fenBefore}`,
      `Move ${moveNumber}: ${moveOwner} played ${move.san}.`,
      studentMove
        ? 'Pronoun rule for this review: say "you/your" for the side that made this move.'
        : 'Pronoun rule for this review: say "I/my" for the side that made this move; do not call it the student\'s move.',
      quality !== 'opponent' && quality !== 'solid' ? `This was classified as a ${quality}.` : '',
      km?.bestMove ? `Stockfish preferred ${km.bestMove} in this position.` : '',
      km?.description ?? '',
    ].filter(Boolean).join(' ');

    const promptSubject = studentMove ? 'your move' : 'my move';
    const prompt = quality === 'solid' || quality === 'opponent'
      ? `In 2 sentences, explain what makes ${promptSubject} ${move.san} on move ${moveNumber} a reasonable choice and what chess principle it follows.`
      : `In 2-3 sentences, explain concretely why ${promptSubject} ${move.san} on move ${moveNumber} was a ${quality}${km?.bestMove ? ` and what makes ${km.bestMove} stronger` : ''}.`;

    await chessConvai.seedStaticCoachPolicy(coach, buildCoachInstruction(coach, difficulty, 'move'));
    const spoken = await chessConvai.speakCoachMessage(coach, prompt, dynamicCtx);
    if (spoken) {
      setCoachLine(spoken);
      setCoachGuidance(spoken);
    }
    setGuidanceLoading(false);
  }

  const selectedBoardGame = useMemo(() => {
    if (selectedMoveIdx === null || !history[selectedMoveIdx]) return null;
    return new Chess(history[selectedMoveIdx].fenAfter);
  }, [selectedMoveIdx, history]);

  if (showAnalysis) {
    const movePairs = buildMovePairs(history);
    const errorMap = buildErrorMap(analysis?.keyMoments ?? []);

    return (
      <main className="game-screen">
        <header className="topbar">
          <button onClick={() => clickBack(onBackToMenu)}>Menu</button>
          <h1>Post-Game Analysis</h1>
          <div className="topbar-actions">
            <button className="ghost-action" onClick={() => setShowAnalysis(false)} title="Back to game">Back</button>
            <button className="ghost-action" onClick={resetGame}>New Game</button>
          </div>
        </header>

        <div className="app-shell analysis-shell">
          <CoachCard
            coach={coach}
            status={status}
            lastLine={coachLine}
            onAddToDataset={DATASET_TOOLS_ENABLED ? openSaveModal : undefined}
            chatOpen={chatOpen}
            onChatToggle={() => setChatOpen((open) => !open)}
          />

          <div className="analysis-panel invisible-scroll">

            <div className="analysis-header">
              <h2>{resultLabel(game, coach.name, resigned)}</h2>
              <p className="analysis-meta">
                {analysis?.opening ?? 'Identifying opening…'} · {Math.ceil(history.length / 2)} move{Math.ceil(history.length / 2) !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Performance */}
            <section className="analysis-section">
              <p className="eyebrow">Your Performance</p>
              {analysisPending && <p className="muted-text">Stockfish is reviewing your moves…</p>}
              {analysis && (
                <div className="perf-grid">
                  <div className="perf-card">
                    <div className="perf-score">{analysis.whiteAccuracy}%</div>
                    <div className="perf-label">Accuracy</div>
                    <div className="perf-desc">{describeAccuracy(analysis.whiteAccuracy)}</div>
                  </div>
                  <div className="perf-card">
                    <div className="error-badges">
                      {analysis.blunders > 0 && <span className="err-badge blunder">{analysis.blunders} blunder{analysis.blunders > 1 ? 's' : ''}</span>}
                      {analysis.mistakes > 0 && <span className="err-badge mistake">{analysis.mistakes} mistake{analysis.mistakes > 1 ? 's' : ''}</span>}
                      {analysis.inaccuracies > 0 && <span className="err-badge inaccuracy">{analysis.inaccuracies} inaccurac{analysis.inaccuracies > 1 ? 'ies' : 'y'}</span>}
                      {analysis.blunders === 0 && analysis.mistakes === 0 && analysis.inaccuracies === 0 && (
                        <span className="err-badge clean">Clean game</span>
                      )}
                    </div>
                    <div className="error-legend">
                      <span className="legend-item"><span className="err-dot blunder" />Blunder — serious error that changes the outcome</span>
                      <span className="legend-item"><span className="err-dot mistake" />Mistake — misses a clearly better option</span>
                      <span className="legend-item"><span className="err-dot inaccuracy" />Inaccuracy — slightly suboptimal, still reasonable</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Move Timeline */}
            <section className="analysis-section">
              <p className="eyebrow">Move Timeline</p>
              <p className="section-hint">Click any move to review it — red = blunder, orange = mistake, yellow = inaccuracy</p>
              <div className="move-timeline">
                {movePairs.map(([w, b], pairIdx) => (
                  <div key={pairIdx} className="move-pair">
                    <span className="move-number-label">{pairIdx + 1}.</span>
                    {w && (
                      <button
                        className={`move-chip ${getChipClass(w.historyIdx, history, errorMap)} ${selectedMoveIdx === w.historyIdx ? 'selected' : ''}`}
                        onClick={() => { setSelectedMoveIdx(w.historyIdx); setCoachGuidance(''); }}
                      >
                        {w.san}
                      </button>
                    )}
                    {b && (
                      <button
                        className={`move-chip coach-chip ${selectedMoveIdx === b.historyIdx ? 'selected' : ''}`}
                        onClick={() => { setSelectedMoveIdx(b.historyIdx); setCoachGuidance(''); }}
                      >
                        {b.san}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Selected move detail */}
            {selectedMoveIdx !== null && selectedBoardGame && (() => {
              const move = history[selectedMoveIdx];
              const moveNumber = Math.ceil((selectedMoveIdx + 1) / 2);
              const km = analysis?.keyMoments.find((m) => m.moveNumber === moveNumber && move?.color === 'w');
              const quality = km ? km.label : (move?.color === 'w' ? 'Good' : null);
              return (
                <section className="analysis-section move-detail-section">
                  <p className="eyebrow">Move {moveNumber} — {history[selectedMoveIdx]?.by}: {history[selectedMoveIdx]?.san}</p>
                  <div className="move-detail-layout">
                    <div className="mini-board-wrap">
                      <div className="mini-board-viewport">
                        <ChessBoard
                          className="mini-board-focus"
                          game={selectedBoardGame}
                          lastMove={move ? { from: move.from, to: move.to } : null}
                          style={move ? miniBoardFocusStyle(move) : undefined}
                        />
                      </div>
                    </div>
                    <div className="move-detail-info">
                      {km ? (
                        <div className={`moment-info ${km.label.toLowerCase()}`}>
                          <strong>{km.label}</strong> — {km.description}
                          {km.bestMove && <p className="better-move">Better: <code>{km.bestMove}</code></p>}
                        </div>
                      ) : quality === 'Good' ? (
                        <div className="moment-info good">
                          <strong>Good move</strong> — no better option found by Stockfish in this position
                        </div>
                      ) : null}
                      <div className="guidance-area">
                        {coachGuidance ? (
                          <p className="coach-guidance-text">{coachGuidance}</p>
                        ) : guidanceLoading ? (
                          <p className="muted-text">{coach.name} is analyzing this position…</p>
                        ) : (
                          <button className="primary-action" onClick={() => void askAboutMove(selectedMoveIdx)}>
                            Ask {coach.name} about this move
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Key Moments */}
            {analysis && analysis.keyMoments.length > 0 && (
              <section className="analysis-section">
                <p className="eyebrow">Key Moments</p>
                {analysis.keyMoments.map((km, idx) => {
                  const mIdx = history.findIndex((m, i) => m.color === 'w' && Math.ceil((i + 1) / 2) === km.moveNumber);
                  return (
                    <div
                      key={idx}
                      className={`moment-item ${km.label.toLowerCase()}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => { if (mIdx !== -1) { setSelectedMoveIdx(mIdx); setCoachGuidance(''); }}}
                      onKeyDown={(e) => { if (e.key === 'Enter' && mIdx !== -1) { setSelectedMoveIdx(mIdx); setCoachGuidance(''); }}}
                    >
                      <div className="moment-header">
                        <span className={`moment-badge ${km.label.toLowerCase()}`}>{km.label}</span>
                        <span className="moment-movenumber">Move {km.moveNumber}</span>
                      </div>
                      <p>{km.description}</p>
                      {km.bestMove && <p className="better-move">Better: <code>{km.bestMove}</code></p>}
                    </div>
                  );
                })}
              </section>
            )}

            {/* Coach Tips */}
            {analysis && analysis.tips.length > 0 && (
              <section className="analysis-section">
                <p className="eyebrow">Coach's Tips for Next Time</p>
                <ul className="tips-list">
                  {analysis.tips.map((tip, idx) => <li key={idx}>{tip}</li>)}
                </ul>
              </section>
            )}

          </div>
        </div>

        <ChatDrawer
          coachName={coach.name}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSend={() => void sendChat()}
          mic={<MicButton className="chat-mic" />}
        />
      </main>
    );
  }

  return (
    <main className={`game-screen${isCovered ? ' is-loading-cover-target' : ''}`}>
      <header className="topbar">
        <button onClick={() => clickBack(onBackToMenu)}>Menu</button>
        <h1>Classic Chess</h1>
        <div className="topbar-actions">
          <span>{difficulty.label}</span>
          <MicButton />
          <CopyLogsButton />
        </div>
      </header>

      <div className="app-shell">
        <CoachCard
          coach={coach}
          status={status}
          lastLine={coachLine || hintText}
          onReady={onCoachReady}
          onAddToDataset={DATASET_TOOLS_ENABLED ? openSaveModal : undefined}
          chatOpen={chatOpen}
          onChatToggle={() => setChatOpen((open) => !open)}
        />

        <section className={`game-stage${yourTurnPulse ? ' your-turn-pulse' : ''}`} aria-label="Chess board">
          <ChessBoard
            game={game}
            selected={selected}
            legalMoves={legalMoves}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
          />
        </section>

        <aside className="side-panel">
          <div className="panel-card turn-card">
            <p className="eyebrow">Game State</p>
            <h2>{game.turn() === 'w' ? 'Your move' : `${coach.name} to move`}</h2>
            <p>{getStatus(game, coach.name)}</p>
            {hintText && <p className="hint-text">{hintText}</p>}
            <button
              className="primary-action"
              onClick={() => void askHint()}
              disabled={game.turn() !== 'w' || thinking || gameEnded}
            >
              Ask Hint {hintLevel ? `(${hintLevel}/3)` : ''}
            </button>
            <button className="ghost-action" onClick={resetGame}>New game</button>
            <button
              className="ghost-action danger-action"
              onClick={() => { if (!gameEnded) setShowResignConfirm(true); }}
              disabled={gameEnded}
            >
              Resign
            </button>
          </div>

          <div className="panel-card move-card">
            <p className="eyebrow">Move List</p>
            <ol className="invisible-scroll" ref={moveListRef}>
              {history.map((move, index) => (
                <li key={`${move.san}-${index}`}>
                  <span>{move.by}</span>
                  <strong>{pieceName(move.piece)} {move.san}</strong>
                </li>
              ))}
            </ol>
          </div>

        </aside>
      </div>

      <ChatDrawer
        coachName={coach.name}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        chatInput={chatInput}
        onChatInputChange={setChatInput}
        onSend={() => void sendChat()}
        mic={<MicButton className="chat-mic" />}
      />

      {showGameOverModal && createPortal(
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
          <div className="gameover-modal">
            <div className="gameover-result" id="gameover-title">{resultLabel(game, coach.name, resigned)}</div>
            <p className="gameover-status">{resigned ? `You resigned. ${coach.name} wins.` : getStatus(game, coach.name)}</p>
            <div className="gameover-actions">
              <button
                className="primary-action"
                onClick={() => { setShowGameOverModal(false); setShowAnalysis(true); }}
              >
                View Analysis
              </button>
              <button
                className="ghost-action"
                onClick={() => { setShowGameOverModal(false); resetGame(); }}
              >
                New Game
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showResignConfirm && createPortal(
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="resign-title">
          <div className="gameover-modal">
            <div className="gameover-result" id="resign-title">Resign?</div>
            <p className="gameover-status">{coach.name} will be credited with the win.</p>
            <div className="gameover-actions">
              <button
                className="ghost-action"
                onClick={() => setShowResignConfirm(false)}
              >
                Keep Playing
              </button>
              <button
                className="primary-action danger-action"
                onClick={() => { setShowResignConfirm(false); setResigned(true); }}
              >
                Resign
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}


      {DATASET_TOOLS_ENABLED && toastMessage && (
        <div className="toast-notification" role="status" aria-live="polite">
          <span>{toastMessage}</span>
        </div>
      )}

      {DATASET_TOOLS_ENABLED && showSaveModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dataset-save-title">
          <div className="save-modal">
            <h2 id="dataset-save-title">Add Dialogue to Dataset</h2>
            <p className="save-modal-sub">
              Mark whether the coach should have spoken in this situation so the dataset reflects the ideal behaviour.
            </p>
            <label className="save-modal-field">
              <span>Expected response</span>
              <select
                value={selectedExpected}
                onChange={(event) => setSelectedExpected(event.target.value as 'silent' | 'talk')}
              >
                <option value="silent">Silent</option>
                <option value="talk">Talk</option>
              </select>
            </label>
            <div className="save-modal-actions">
              <button className="ghost-action" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
              <button
                className="primary-action"
                onClick={() => {
                  void handleAddToDataset(selectedExpected);
                  setShowSaveModal(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export function ChessBoard({
  game,
  selected,
  legalMoves,
  lastMove,
  onSquareClick,
  orientation = 'w',
  className,
  style,
}: {
  game: Chess;
  selected?: Square | null;
  legalMoves?: Square[];
  lastMove?: Pick<MoveSnapshot, 'from' | 'to'> | null;
  onSquareClick?: (square: Square) => void;
  orientation?: 'w' | 'b';
  className?: string;
  style?: CSSProperties;
}) {
  const rankLabels = orientation === 'w'
    ? [8, 7, 6, 5, 4, 3, 2, 1]
    : [1, 2, 3, 4, 5, 6, 7, 8];
  const fileLabels = orientation === 'w' ? FILES : [...FILES].slice().reverse();
  return (
    <div className={`board-wrap ${className ?? ''}`.trim()} style={style}>
      <div className="rank-labels">
        {rankLabels.map((rank) => <span key={rank}>{rank}</span>)}
      </div>
      <div className="chess-board">
        {Array.from({ length: 8 }).map((_, rankIndex) =>
          Array.from({ length: 8 }).map((__, fileIndex) => {
            const fileIdx = orientation === 'w' ? fileIndex : 7 - fileIndex;
            const rankIdx = orientation === 'w' ? rankIndex : 7 - rankIndex;
            const square = squareAt(fileIdx, rankIdx);
            const piece = game.get(square);
            const isLight = (rankIdx + fileIdx) % 2 === 0;
            const isSelected = selected === square;
            const isTarget = legalMoves?.includes(square);
            const isLastMove = lastMove?.from === square || lastMove?.to === square;
            return (
              <button
                className={[
                  'square',
                  isLight ? 'light' : 'dark',
                  isSelected ? 'selected' : '',
                  isTarget ? 'target' : '',
                  isLastMove ? 'last-move' : '',
                ].join(' ')}
                key={square}
                onClick={() => onSquareClick?.(square)}
                aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
              >
                {piece && <span className={`piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}>{PIECES[`${piece.color}${piece.type}`]}</span>}
              </button>
            );
          }),
        )}
      </div>
      <div className="file-labels">
        {fileLabels.map((file) => <span key={file}>{file}</span>)}
      </div>
    </div>
  );
}

function miniBoardFocusStyle(move: Pick<MoveRecord, 'from' | 'to'>): CSSProperties {
  const viewport = 178;
  const board = 300;
  const from = squareCenter(move.from);
  const to = squareCenter(move.to);
  const centerX = (from.x + to.x) / 2;
  const centerY = (from.y + to.y) / 2;
  const x = Math.min(0, Math.max(viewport - board, viewport / 2 - centerX * board));
  const y = Math.min(0, Math.max(viewport - board, viewport / 2 - centerY * board));
  return {
    '--focus-x': `${x}px`,
    '--focus-y': `${y}px`,
  } as CSSProperties;
}

function squareCenter(square: string) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return {
    x: (file + 0.5) / 8,
    y: (8 - rank + 0.5) / 8,
  };
}

const PUZZLE_GROUP_SIZE = 5;

function PuzzleScreen({
  coachId,
  difficultyId,
  userIdentity,
  onBack,
}: {
  coachId: CoachId;
  difficultyId: DifficultyId;
  userIdentity: UserIdentity | null;
  onBack: () => void;
}) {
  const coach = getCoach(coachId);
  const allForDifficulty = useMemo(
    () => PUZZLES.filter((puzzle) => puzzle.difficultyId === difficultyId),
    [difficultyId],
  );
  const [completedIds, setCompletedIds] = useState<string[]>(
    () => loadPuzzleProgress()[difficultyId] ?? [],
  );

  function buildBatch(completed: string[]): string[] {
    const completedSet = new Set(completed);
    const fresh = allForDifficulty.filter((puzzle) => !completedSet.has(puzzle.id));
    return fresh.slice(0, PUZZLE_GROUP_SIZE).map((puzzle) => puzzle.id);
  }

  const [batchIds, setBatchIds] = useState<string[]>(() => buildBatch(completedIds));
  const [batchPos, setBatchPos] = useState(0);
  const [wrongInBatch, setWrongInBatch] = useState<string[]>([]);
  const [showIntro, setShowIntro] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [reviewPos, setReviewPos] = useState(0);
  const [groupComplete, setGroupComplete] = useState(false);

  const activePuzzleId = reviewMode ? reviewIds[reviewPos] : batchIds[batchPos];
  const allDone = batchIds.length === 0;
  const fallbackPuzzle = allForDifficulty[0] ?? PUZZLES[0];
  const puzzle = useMemo(
    () => allForDifficulty.find((item) => item.id === activePuzzleId) ?? fallbackPuzzle,
    [allForDifficulty, activePuzzleId, fallbackPuzzle],
  );
  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [selected, setSelected] = useState<Square | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [coachReady, setCoachReady] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(10);
  const [loadingStep, setLoadingStep] = useState(`Loading ${coach.name}...`);
  const avatarReadyRef = useRef<boolean>(false);

  // Connect Convai coach on mount
  useEffect(() => {
    debugLog('PuzzleScreen', `Mounting — connecting coach ${coach.name} (${coach.id})`);
    chessConvai.unlockAudio();
    void chessConvai.connectCoach(coach, {
      endUserId: resolveConvaiConnectionEndUserId(userIdentity),
      endUserMetadata: userIdentity?.endUserMetadata,
    }).then(() => {
      debugLog('PuzzleScreen', `connectCoach resolved for ${coach.name}`);
    });

    const unsub = chessConvai.onStatus((status) => {
      if (status.activeCoachId !== coach.id) return;
      debugLog('PuzzleScreen', `Status update — connecting=${status.connecting} connected=${status.connected} botReady=${status.botReady}`);
      if (status.botReady) {
        setLoadingProgress(100);
        setLoadingStep(`${coach.name} is ready.`);
        setCoachReady(true);
      } else if (status.connected) {
        setLoadingProgress(70);
        setLoadingStep(`Warming up ${coach.name}...`);
      } else if (status.connecting) {
        setLoadingProgress(40);
        setLoadingStep(`Connecting ${coach.name} to Convai...`);
      }
    });

    return () => {
      debugLog('PuzzleScreen', 'Unmounting — unsubscribing status listener');
      unsub();
    };
  }, [coach, userIdentity]);

  // Listen for AI text responses
  useEffect(() => {
    const unsub = chessConvai.onResponse((response) => {
      if (response.coachId !== coach.id) return;
      debugLog('PuzzleScreen', `AI response received (${response.text.length} chars): ${response.text.slice(0, 80)}`);
      setFeedback(response.text);
    });
    return unsub;
  }, [coach.id]);

  const ready = coachReady && avatarReady;

  useEffect(() => {
    debugLog('PuzzleScreen', `Loaded puzzle id="${puzzle.id}" title="${puzzle.title}" sideToMove=${puzzle.sideToMove} solution="${puzzle.solution[0]}" fen="${puzzle.fen}"`);
    setGame(new Chess(puzzle.fen));
    setSelected(null);
    setHintsUsed(0);
    setFeedback('');
    setPuzzleSolved(false);
  }, [puzzle, activePuzzleId]);

  const legalMoves = useMemo(() => selected ? legalTargets(game.fen(), selected) : [], [game, selected]);

  function handleAvatarReady() {
    if (avatarReadyRef.current) return;
    avatarReadyRef.current = true;
    debugLog('PuzzleScreen', 'Avatar onReady fired');
    setAvatarReady(true);
    setLoadingProgress((p) => Math.max(p, 60));
  }

  async function handlePuzzleSquare(square: Square) {
    if (game.isGameOver()) return;
    const piece = game.get(square);
    if (selected) {
      if (selected === square) {
        setSelected(null);
        return;
      }
      if (piece?.color === puzzle.sideToMove) {
        setSelected(square);
        return;
      }
      const next = new Chess(game.fen());
      const move = next.move({ from: selected, to: square, promotion: 'q' });
      if (move) {
        const normPlayed = normalizeSan(move.san);
        const normExpected = normalizeSan(puzzle.solution[0]);
        const correct = normPlayed === normExpected;
        debugLog('PuzzleScreen', `Move attempted: played="${move.san}" norm="${normPlayed}" expected="${puzzle.solution[0]}" norm="${normExpected}" correct=${correct} puzzle="${puzzle.id}"`);
        const earned = puzzleScore(hintsUsed, correct);
        if (correct) {
          const bonus = hintsUsed === 0 && (streak + 1) % 5 === 0 ? 50 : 0;
          setScore((v) => v + earned + bonus);
          setStreak((v) => hintsUsed === 0 ? v + 1 : 0);
          debugLog('PuzzleScreen', `Correct move — brief praise. bonus=${bonus}`);
          markPuzzleCompleted(difficultyId, puzzle.id);
          setCompletedIds((prev) => prev.includes(puzzle.id) ? prev : [...prev, puzzle.id]);
          const isReview = reviewMode;
          const prompt = isReview
            ? `The student is revisiting a puzzle they got wrong. They just played the correct move (theme: ${puzzle.theme}). ${puzzle.explanation} Give one brief teaching sentence explaining why that move works. Do not say "great job" or generic praise — name the chess idea.`
            : `The student played the correct move in a puzzle (theme: ${puzzle.theme}). Give only a very short confirmation: 1-5 words max. For example: "Good eye.", "Exactly.", "That's it.", "Nice find." Do not explain the move unless this is a review session.`;
          void chessConvai.speakCoachMessage(coach, prompt, `Puzzle theme: ${puzzle.theme}. Side to move: ${puzzle.sideToMove}.`);
          setPuzzleSolved(true);
        } else {
          setStreak(0);
          if (!reviewMode) {
            setWrongInBatch((prev) => prev.includes(puzzle.id) ? prev : [...prev, puzzle.id]);
          }
          debugLog('PuzzleScreen', `Incorrect move ${move.san} — correct was ${puzzle.solution[0]}`);
          const prompt = `The student made a wrong move in a puzzle (theme: ${puzzle.theme}). Give only a single short line flagging the mistake, for example: "Uh oh — not the best move there. We will revisit this one." Do not reveal the correct answer. Do not explain the position. Keep it to one brief sentence.`;
          void chessConvai.speakCoachMessage(coach, prompt, `Puzzle theme: ${puzzle.theme}. Side to move: ${puzzle.sideToMove}.`);
        }
        setGame(next);
        setSelected(null);
        return;
      }
      return;
    }
    if (piece?.color === puzzle.sideToMove) setSelected(square);
  }

  async function askPuzzleHint() {
    const next = Math.min(3, hintsUsed + 1);
    setHintsUsed(next);
    debugLog('PuzzleScreen', `Hint requested — level ${next}`);
    const hintText = puzzle.hints[next - 1] ?? '';
    const prompt = [
      `The student asked for hint level ${next} of 3. Puzzle theme: ${puzzle.theme}.`,
      next === 1 ? 'Give only a directional clue — point to a region of the board or type of move. Do not name the piece or square.' : '',
      next === 2 ? 'Name the tactical or strategic idea (for example: pin, fork, outpost, open file). Do not reveal the piece or destination square.' : '',
      next === 3 ? `Reveal the move. Use natural language only — no raw chess notation. Say the piece name and the target square using a capital letter for the file and a space before the rank number. For example: "Move your knight to F 3" or "Take with your bishop on E 5". The solution square is ${puzzle.solution[0]}.` : '',
      `Teaching context: ${hintText}`,
      'Give exactly 1-2 sentences. Do not pad with encouragement.',
    ].filter(Boolean).join(' ');
    void chessConvai.speakCoachMessage(coach, prompt, `Puzzle theme: ${puzzle.theme}. Side to move: ${puzzle.sideToMove}.`);
  }

  function startNextBatch(extraCompleted: string[] = []) {
    const updatedCompleted = Array.from(new Set([...completedIds, ...extraCompleted]));
    const nextBatch = buildBatch(updatedCompleted);
    debugLog('PuzzleScreen', `Starting next batch — fresh count=${nextBatch.length}`);
    setBatchIds(nextBatch);
    setBatchPos(0);
    setWrongInBatch([]);
    setGroupComplete(false);
    setReviewMode(false);
    setReviewIds([]);
    setReviewPos(0);
  }

  function nextPuzzle() {
    if (reviewMode) {
      if (reviewPos + 1 < reviewIds.length) {
        setReviewPos((v) => v + 1);
      } else {
        debugLog('PuzzleScreen', 'Review complete — starting next batch');
        startNextBatch();
      }
      return;
    }
    // If the user skips without solving, count it as "not clean" so the
    // group-complete summary is honest and the puzzle goes into the review
    // pile alongside any wrong-answer puzzles.
    let nextWrong = wrongInBatch;
    if (!puzzleSolved && !wrongInBatch.includes(puzzle.id)) {
      debugLog('PuzzleScreen', `Skipping unsolved puzzle "${puzzle.id}" — marking for review`);
      nextWrong = [...wrongInBatch, puzzle.id];
      setWrongInBatch(nextWrong);
    }
    if (batchPos + 1 < batchIds.length) {
      debugLog('PuzzleScreen', `Advancing to batch position ${batchPos + 1}/${batchIds.length}`);
      setBatchPos((v) => v + 1);
    } else {
      debugLog('PuzzleScreen', `Batch finished — showing group-complete screen (clean=${batchIds.length - nextWrong.length}/${batchIds.length})`);
      setGroupComplete(true);
    }
  }

  function startReview() {
    if (wrongInBatch.length === 0) {
      startNextBatch();
      return;
    }
    debugLog('PuzzleScreen', `Starting review — ${wrongInBatch.length} puzzles to revisit`);
    setReviewIds(wrongInBatch);
    setReviewPos(0);
    setReviewMode(true);
    setGroupComplete(false);
  }

  function resetProgress() {
    debugLog('PuzzleScreen', `Resetting puzzle progress for difficulty=${difficultyId}`);
    resetPuzzleProgress(difficultyId);
    setCompletedIds([]);
    setBatchIds(buildBatch([]));
    setBatchPos(0);
    setWrongInBatch([]);
    setGroupComplete(false);
    setReviewMode(false);
    setReviewIds([]);
    setReviewPos(0);
  }

  if (ready && !showIntro && allDone) {
    const totalForDifficulty = allForDifficulty.length;
    return (
      <main className="game-screen">
        <header className="topbar">
          <button onClick={() => clickBack(onBack)}>Menu</button>
          <h1>Puzzles with AI</h1>
          <div className="topbar-actions"><span>{score} pts</span></div>
        </header>
        <div className="puzzle-intro-overlay">
          <div className="puzzle-intro-card panel-card">
            <p className="eyebrow">All Done</p>
            <h2>You finished every {getDifficulty(difficultyId).label} puzzle</h2>
            <p>You've solved all {totalForDifficulty} puzzles at this difficulty. Try a harder level from the menu, or reset to replay them.</p>
            <div className="puzzle-group-actions">
              <button className="primary-action" onClick={() => clickBack(onBack)}>Back to menu</button>
              <button className="ghost-action" onClick={resetProgress}>Reset progress</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (ready && !showIntro && groupComplete) {
    const wrongCount = wrongInBatch.length;
    const batchSize = batchIds.length;
    const cleanCount = batchSize - wrongCount;
    return (
      <main className="game-screen">
        <header className="topbar">
          <button onClick={() => clickBack(onBack)}>Menu</button>
          <h1>Puzzles with AI</h1>
          <div className="topbar-actions"><span>{score} pts</span></div>
        </header>
        <div className="puzzle-intro-overlay">
          <div className="puzzle-intro-card panel-card">
            <p className="eyebrow">Batch Complete</p>
            <h2>{cleanCount} of {batchSize} solved cleanly</h2>
            {wrongCount > 0
              ? <p>You have {wrongCount} puzzle{wrongCount > 1 ? 's' : ''} to revisit. Review them now for extra learning, or skip ahead.</p>
              : <p>Clean sweep — no mistakes. Moving on to the next batch.</p>
            }
            <div className="puzzle-group-actions">
              {wrongCount > 0 && (
                <button className="primary-action" onClick={startReview}>Review mistakes ({wrongCount})</button>
              )}
              <button className="ghost-action" onClick={() => startNextBatch()}>
                {wrongCount > 0 ? 'Skip review' : 'Next batch'}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  async function sendPuzzleChat() {
    const text = chatInput.trim();
    if (!text) return;
    unlockUiAudio();
    playUiSound('send');
    setChatInput('');
    const dynamicInfo = `Puzzle theme: ${puzzle.theme}. Side to move: ${puzzle.sideToMove}. Position FEN: ${puzzle.fen}.`;
    const spoken = await chessConvai.sendUserChat(
      coach,
      getDifficulty(difficultyId),
      text,
      dynamicInfo,
    );
    if (spoken) setFeedback(spoken);
  }

  const sideLabel = puzzle.sideToMove === 'w' ? 'White' : 'Black';

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={() => clickBack(onBack)}>Menu</button>
        <h1>{reviewMode ? 'Review Mode' : 'Puzzles'}</h1>
        <div className="topbar-actions">
          <span>{score} pts</span>
          {streak > 0 && <span>{streak} streak</span>}
          {!reviewMode && <span>{batchPos + 1}/{batchIds.length}</span>}
          {reviewMode && <span>{reviewPos + 1}/{reviewIds.length}</span>}
          <Tooltip text="Total progress for this difficulty" placement="bottom">
            <span>{completedIds.length}/{allForDifficulty.length}</span>
          </Tooltip>
          <MicButton />
        </div>
      </header>
      <div className="training-layout">
        <div className="puzzle-left-col">
          <CoachCard
            coach={coach}
            status={coach.name}
            lastLine={feedback || undefined}
            onReady={handleAvatarReady}
            chatOpen={chatOpen}
            onChatToggle={() => setChatOpen((o) => !o)}
          />
          <div className="puzzle-theme-label">
            <span className="eyebrow">{reviewMode ? 'Review' : puzzle.theme}</span>
            <strong>{puzzle.title}</strong>
          </div>
          <div className="puzzle-actions">
            <button className="primary-action" onClick={() => void askPuzzleHint()} disabled={hintsUsed >= 3 || puzzleSolved}>
              Hint {hintsUsed > 0 ? `(${hintsUsed}/3)` : ''}
            </button>
            <button className="ghost-action" onClick={nextPuzzle}>
              {reviewMode ? (reviewPos + 1 < reviewIds.length ? 'Next' : 'Finish review') : puzzleSolved ? 'Next Puzzle' : 'Skip'}
            </button>
          </div>
        </div>
        <section className="game-stage puzzle-board-stage">
          <ChessBoard
            game={game}
            selected={selected}
            legalMoves={legalMoves}
            onSquareClick={(sq) => void handlePuzzleSquare(sq)}
            orientation={puzzle.sideToMove}
          />
        </section>
      </div>

      <ChatDrawer
        coachName={coach.name}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        chatInput={chatInput}
        onChatInputChange={setChatInput}
        onSend={() => void sendPuzzleChat()}
        placeholder="Ask about the puzzle..."
        mic={<MicButton className="chat-mic" />}
      />

      {ready && showIntro && (
        <div className="puzzle-cover">
          <div className="puzzle-intro-card panel-card">
            <p className="eyebrow">Puzzle Challenge</p>
            <h2>Find the best move for {sideLabel}</h2>
            <ul className="puzzle-intro-rules">
              <li>Tap a piece, then tap where you want it to go.</li>
              <li>You can ask for up to 3 hints per puzzle.</li>
              <li>After {PUZZLE_GROUP_SIZE} puzzles, you can review the ones you got wrong.</li>
              <li>The coach will stay quiet during routine moves — listen when they speak.</li>
            </ul>
            <button className="primary-action" onClick={() => setShowIntro(false)}>Start puzzles</button>
          </div>
        </div>
      )}
      {!ready && <LoadingScreen progress={loadingProgress} step={loadingStep} />}
    </main>
  );
}

function MyGamesScreen({
  sessions,
  onBack,
  onDelete,
}: {
  sessions: StoredGameSession[];
  onBack: () => void;
  onDelete: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(sessions[0]?.id ?? '');
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0];

  useEffect(() => {
    if (!selectedId && sessions[0]) setSelectedId(sessions[0].id);
  }, [selectedId, sessions]);

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={() => clickBack(onBack)}>Menu</button>
        <h1>My Games</h1>
        <div className="topbar-actions"><span>{sessions.length} saved</span></div>
      </header>
      <div className="games-layout">
        <section className="panel-card games-list">
          <p className="eyebrow">Sessions</p>
          {sessions.length === 0 && <p>No saved games yet. Finish or start a Quick Play game first.</p>}
          {sessions.map((session) => {
            const coach = getCoach(session.coachId);
            return (
              <button key={session.id} className={session.id === selected?.id ? 'selected-option' : ''} onClick={() => setSelectedId(session.id)}>
                <strong>{coach.name} - {getDifficulty(session.difficultyId).label}</strong>
                <span>{new Date(session.updatedAt).toLocaleString()} - {session.result}</span>
              </button>
            );
          })}
          {selected && <button className="ghost-action danger-action" onClick={() => onDelete(selected.id)}>Delete selected</button>}
        </section>
        {selected && <ReplayViewer session={selected} />}
      </div>
    </main>
  );
}

function ReplayViewer({ session }: { session: StoredGameSession }) {
  const [ply, setPly] = useState(session.moves.length);
  const game = useMemo(() => new Chess(ply === 0 ? undefined : session.moves[Math.max(0, ply - 1)]?.fenAfter), [ply, session.moves]);

  useEffect(() => {
    setPly(session.moves.length);
  }, [session.id, session.moves.length]);

  return (
    <section className="replay-layout">
      <ChessBoard game={game} lastMove={session.moves[Math.max(0, ply - 1)]} />
      <aside className="panel-card replay-panel">
        <p className="eyebrow">{getCoach(session.coachId).name} Review</p>
        <h2>{session.result}</h2>
        <p>{session.analysis?.opening ?? 'Analysis pending or not generated yet.'}</p>
        <div className="replay-controls">
          <Tooltip text="Start" placement="top">
            <button aria-label="Start" onClick={() => { unlockUiAudio(); playUiSound('nav'); setPly(0); }}><ChevronsLeft size={18} /></button>
          </Tooltip>
          <Tooltip text="Previous" placement="top">
            <button aria-label="Previous" onClick={() => { unlockUiAudio(); playUiSound('nav'); setPly((value) => Math.max(0, value - 1)); }}><ChevronLeft size={18} /></button>
          </Tooltip>
          <span>{ply}/{session.moves.length}</span>
          <Tooltip text="Next" placement="top">
            <button aria-label="Next" onClick={() => { unlockUiAudio(); playUiSound('nav'); setPly((value) => Math.min(session.moves.length, value + 1)); }}><ChevronRight size={18} /></button>
          </Tooltip>
          <Tooltip text="End" placement="top">
            <button aria-label="End" onClick={() => { unlockUiAudio(); playUiSound('nav'); setPly(session.moves.length); }}><ChevronsRight size={18} /></button>
          </Tooltip>
        </div>
        <ol className="replay-moves invisible-scroll">
          {session.moves.map((move, index) => (
            <li key={`${move.san}-${index}`}>
              <button className={ply === index + 1 ? 'selected-option' : ''} onClick={() => setPly(index + 1)}>
                {index + 1}. {move.by} {move.san}
              </button>
            </li>
          ))}
        </ol>
        {session.analysis && <AnalysisPanel analysis={session.analysis} pending={false} compact />}
      </aside>
    </section>
  );
}

const DEFAULT_SPEAKING_STYLE = `**General rules:** Silence is the default. Only speak when there is a tactical moment — a tactic found or missed, a forcing move available, a calculation error, or a hint requested. Never narrate what the student just moved. Never narrate your own moves. Real content only — never hype or generic encouragement. Reference the calculation habit directly: "Count checks first.", "The capture works only if the defender is overloaded." One to two sentences maximum.

For hints: level 1 — checks/captures/threats; level 2 — name the motif; level 3 — move and why it works. Natural language only — "knight to F 3" not "Nf3", "E 4" not "e4". Capitalize file letters for TTS.

**New (unrated–800):** Sofia rarely coaches beginners. If you must, introduce forcing moves without the term: "some moves your opponent must answer right away, like a check or a capture." Name patterns only when they appear and define immediately.

**Beginner (800–1200):** Introduce the checks-captures-threats routine by name and repeat it often. Name and briefly explain each pattern when it appears: pin, fork, skewer, discovered attack. Energetic but grounded — no reaction unless the move has tactical content.

**Intermediate (1200–1600):** Full tactical vocabulary without definition — pin, skewer, deflection, decoy, overload, clearance, double attack. When a tactic is missed, identify exactly what the student should have scanned. When a combination is found, describe the motif and calculation structure.

**Advanced (1600–2000):** Dense, no hand-holding. Name the motif and exact sequence in natural language. Discuss initiative — when to sacrifice material to keep the attack. Push for best move, not just a good one.

**Expert (2000+):** Speak only at genuinely non-trivial combinations — a queen sacrifice, a quiet move in a forcing sequence, a defensive resource the engine finds. Go directly to the calculation structure.`;

const DEFAULT_SAMPLE_DIALOGUE = `**Routine move:** *(silence)*

**New player spots a free capture:**
"Good — you saw you could take a piece for free. Before any move, always look for what you can capture."

**Beginner misses a fork:**
"There was a fork — one move attacking two pieces at once. Always scan for those before choosing a quiet move."

**Intermediate finds a pin:**
"That pin is real. The knight cannot move without exposing the queen behind it — follow up correctly and you win material."

**Advanced misses a deflection:**
"There was a deflection on the queenside — sacrifice to pull the rook off the back rank and the king is exposed. Remove the defender by force."

**Student blunders into a pin:**
"That piece is now pinned — moving it exposes something more valuable. Check for pins before you commit."

**Correct puzzle move:** "That is it. Good calculation."

**Wrong puzzle move:** "Not quite. Let us flag this one and come back to it."

**Hint 1:** "Start with checks — what pieces can give check right now?"

**Hint 2:** "Think about a fork. Two of the opponent's pieces are close enough to attack at once."

**Hint 3:** "Move your knight to D 7. It forks the rook and the king — both cannot be saved."

**Coach's own move (teaching):** "I created a discovered attack threat. When one piece moves, the piece behind it becomes dangerous — one of the most powerful tactical patterns."

**Post-game:** "On move 18 a check-capture-threat sequence would have won material outright. The habit: scan forcing moves before quiet ones, every turn."`;

function CustomCoachCreator({ onBack }: { onBack: () => void }) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [name, setName] = useState('My Chess Coach');
  const [backstory, setBackstory] = useState('A patient chess coach who adapts to my level, explains ideas clearly, and gives progressive hints before revealing answers.');
  const [speakingStyle, setSpeakingStyle] = useState(DEFAULT_SPEAKING_STYLE);
  const [sampleDialogue, setSampleDialogue] = useState(DEFAULT_SAMPLE_DIALOGUE);
  const [voice, setVoice] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [temperature, setTemperature] = useState(0.45);
  const [status, setStatus] = useState('');
  const [createdId, setCreatedId] = useState('');

  const compatibleVoices = useMemo(
    () => filterVoicesForLanguage(voices, language),
    [voices, language],
  );

  useEffect(() => {
    if (hasConvaiApiKey()) void loadOptions();
  }, []);

  useEffect(() => {
    if (!compatibleVoices.length) return;
    if (!compatibleVoices.some((option) => option.value === voice)) {
      setVoice(pickDefaultVoice(voices, language));
    }
  }, [compatibleVoices, language, voice, voices]);

  async function loadOptions() {
    try {
      const [voiceOptions, languageOptions] = await Promise.all([fetchVoices(), fetchLanguages()]);
      setVoices(voiceOptions);
      setLanguages(languageOptions);
      const lang = languageOptions.find((option) => option.code === 'en-US')?.code
        ?? languageOptions[0]?.code
        ?? 'en-US';
      setLanguage(lang);
      setVoice(pickDefaultVoice(voiceOptions, lang));
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load Convai options.');
    }
  }

  async function createCoach() {
    if (!hasConvaiApiKey()) {
      setStatus('Add a Convai API key from the main menu first.');
      return;
    }
    if (!voice) {
      setStatus('Choose a voice first — use Load voices if the list is empty.');
      return;
    }
    setStatus('Creating character in Convai...');
    try {
      const result = await createCustomCoach({
        charName: name,
        voiceType: voice,
        backstory,
        languageCodes: [language],
        model,
        temperature,
        speakingStyleDescription: speakingStyle,
        sampleDialogue,
      });
      const customId = `custom-${result.charID.slice(0, 8)}` as CoachId;
      saveCustomCoach({
        id: customId,
        name: name.trim() || 'My Coach',
        characterId: result.charID,
        backstory,
        createdAt: new Date().toISOString(),
        speakingStyleDescription: speakingStyle.trim() || undefined,
        sampleDialogue: sampleDialogue.trim() || undefined,
      });
      setCreatedId(result.charID);
      setStatus(`Coach created and added to the menu as "${name}". Select them from the coach list on the main screen.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to create coach.');
    }
  }

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={() => clickBack(onBack)}>Menu</button>
        <h1>Custom Coach</h1>
        <div className="topbar-actions" />
      </header>
      <section className="creator-layout">
        <div className="panel-card creator-form">
          <h2>Create your coach</h2>
          {!hasConvaiApiKeyConfigured() && <p className="warning-text">Add a Convai API key from the main menu before creating a coach.</p>}
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Backstory<textarea value={backstory} onChange={(event) => setBackstory(event.target.value)} /></label>
          <label>
            Speaking style
            <span className="field-hint">How the coach talks — tone, pacing, and when to stay quiet.</span>
            <textarea
              className="creator-tall-field"
              value={speakingStyle}
              onChange={(event) => setSpeakingStyle(event.target.value)}
            />
          </label>
          <label>
            Sample dialogue
            <span className="field-hint">A few example lines in the coach's voice to anchor their delivery.</span>
            <textarea
              className="creator-tall-field"
              value={sampleDialogue}
              onChange={(event) => setSampleDialogue(event.target.value)}
            />
          </label>
          <div className="form-row">
            <label>Voice<select value={voice} onChange={(event) => setVoice(event.target.value)}>
              <option value="">{compatibleVoices.length ? 'Choose a voice' : 'Loading voices…'}</option>
              {compatibleVoices.map((option) => (
                <option key={option.value} value={option.value}>{option.name} ({option.gender})</option>
              ))}
            </select></label>
            <label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languages.length === 0 && <option value="en-US">English</option>}
              {languages.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
            </select></label>
          </div>
          <div className="form-row">
            <label>LLM Model<select value={model} onChange={(event) => setModel(event.target.value)}>
              {MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
            <label>Temperature<input type="number" min="0" max="1" step="0.05" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></label>
          </div>
          <div className="creator-actions">
            <button className="primary-action" onClick={() => void createCoach()}>Create coach</button>
          </div>
          {status && <p className="hint-text">{status}</p>}
          {createdId && <code className="created-id">{createdId}</code>}
        </div>
      </section>
    </main>
  );
}

function AnalysisPanel({ analysis, pending, compact = false }: { analysis: AnalysisSummary | null; pending: boolean; compact?: boolean }) {
  return (
    <div className={`panel-card analysis-card ${compact ? 'compact-analysis' : ''}`}>
      <p className="eyebrow">Post-game Analysis</p>
      {pending && <p>Stockfish is reviewing key moments...</p>}
      {analysis && (
        <>
          <div className="accuracy-grid">
            <span>White {analysis.whiteAccuracy}%</span>
            <span>Black {analysis.blackAccuracy}%</span>
          </div>
          <p>{analysis.opening}</p>
          <p>{analysis.blunders} blunders, {analysis.mistakes} mistakes, {analysis.inaccuracies} inaccuracies</p>
          <ol>
            {analysis.keyMoments.map((moment) => (
              <li key={`${moment.moveNumber}-${moment.label}`}>
                <strong>{moment.label}</strong> {moment.description}
              </li>
            ))}
          </ol>
          <ul>
            {analysis.tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function toRecord(move: Move, by: string, fenBefore: string, fenAfter: string): MoveRecord {
  return { san: move.san, from: move.from, to: move.to, piece: move.piece, captured: move.captured, color: move.color, by, fenBefore, fenAfter };
}

function moveRecordToMoveLike(move: MoveRecord) {
  return {
    san: move.san,
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured,
    color: move.color,
  } as Move;
}

function pieceName(piece: string) {
  const names: Record<string, string> = {
    p: 'Pawn',
    n: 'Knight',
    b: 'Bishop',
    r: 'Rook',
    q: 'Queen',
    k: 'King',
  };
  return names[piece] ?? 'Piece';
}

function buildHintText(level: number, best: Move | null, coachName: string) {
  if (!best) return `${coachName}: Look for checks, captures, and threats before choosing a quiet move.`;
  if (level === 1) return `${coachName}: Start with forcing moves — which of your pieces can become more active?`;
  if (level === 2) return `${coachName}: The idea involves your ${pieceName(best.piece).toLowerCase()} — look for a square where it creates immediate pressure.`;
  const toFile = best.to[0].toUpperCase();
  const toRank = best.to[1];
  const action = best.captured ? 'takes' : 'to';
  return `${coachName}: Move your ${pieceName(best.piece).toLowerCase()} ${action} ${toFile} ${toRank}. That is the best move in this position.`;
}

function getStatus(game: Chess, coachName: string) {
  if (game.isCheckmate()) return game.turn() === 'w' ? `Checkmate. ${coachName} wins.` : 'Checkmate. You win.';
  if (game.isStalemate()) return 'Stalemate. No legal move is available.';
  if (game.isDraw()) return 'Drawn position.';
  if (game.isCheck()) return 'Check. The king needs attention.';
  return game.turn() === 'w' ? 'Your move — choose a piece.' : `${coachName} to move.`;
}

function resultLabel(game: Chess, coachName: string, resigned = false) {
  if (resigned) return `${coachName} won by resignation`;
  if (!game.isGameOver()) return 'In progress';
  if (game.isCheckmate()) return game.turn() === 'w' ? `${coachName} won by checkmate` : 'You won by checkmate';
  if (game.isStalemate()) return 'Draw by stalemate';
  return 'Draw';
}

function normalizeSan(san: string) {
  return san.replace(/[+#?!]/g, '');
}

// Reasons that describe a persistent positional state (not a one-off tactical event).
// Once spoken about, we hold off repeating them for a few moves.
const PERSISTENT_POSITIONAL_REASONS = new Set([
  'uncastled-open-center',
  'too-many-pawn-moves',
  'repeated-piece-move',
  'opened-king-file',
  'king-pawn-shield',
]);
const PERSISTENT_REPEAT_WINDOW = 5;

function recentlySpokenTopics(spoken: Map<string, number>, currentMoveNo: number): string[] {
  const out: string[] = [];
  for (const [reason, moveNo] of spoken) {
    if (PERSISTENT_POSITIONAL_REASONS.has(reason) && currentMoveNo - moveNo < PERSISTENT_REPEAT_WINDOW) {
      out.push(reason);
    }
  }
  return out;
}

function applyRepeatSuppression(
  speech: { shouldSpeak: boolean; reasons: string[] },
  spoken: Map<string, number>,
  currentMoveNo: number,
): { shouldSpeak: boolean; suppressed: boolean; suppressedReasons: string[] } {
  if (!speech.shouldSpeak) return { shouldSpeak: false, suppressed: false, suppressedReasons: [] };
  const fresh = speech.reasons.filter((r) => {
    if (!PERSISTENT_POSITIONAL_REASONS.has(r)) return true;
    const last = spoken.get(r);
    return last === undefined || currentMoveNo - last >= PERSISTENT_REPEAT_WINDOW;
  });
  // If every reason that fired is a recently-spoken persistent one, suppress.
  if (fresh.length === 0) {
    return { shouldSpeak: false, suppressed: true, suppressedReasons: speech.reasons };
  }
  return { shouldSpeak: true, suppressed: false, suppressedReasons: [] };
}

type MovePairEntry = { san: string; historyIdx: number; color: 'w' | 'b' };

function buildMovePairs(history: MoveRecord[]): [MovePairEntry | null, MovePairEntry | null][] {
  const pairs: [MovePairEntry | null, MovePairEntry | null][] = [];
  for (let i = 0; i < history.length; i += 2) {
    const w = history[i] ? { san: history[i].san, historyIdx: i, color: history[i].color } : null;
    const b = history[i + 1] ? { san: history[i + 1].san, historyIdx: i + 1, color: history[i + 1].color } : null;
    pairs.push([w, b]);
  }
  return pairs;
}

function buildErrorMap(keyMoments: KeyMoment[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const km of keyMoments) {
    map.set(km.moveNumber, km.label);
  }
  return map;
}

function getChipClass(historyIdx: number, history: MoveRecord[], errorMap: Map<number, string>): string {
  const move = history[historyIdx];
  if (!move || move.color !== 'w') return '';
  const moveNumber = Math.ceil((historyIdx + 1) / 2);
  const label = errorMap.get(moveNumber);
  if (!label) return 'good';
  return label.toLowerCase();
}

function describeAccuracy(acc: number): string {
  if (acc >= 90) return 'Near-perfect — computer-level precision';
  if (acc >= 80) return 'Very strong play this game';
  if (acc >= 70) return 'Solid play with a few lapses';
  if (acc >= 60) return 'Decent — room to sharpen your tactics';
  return 'Plenty of room to grow — keep practicing!';
}

export default App;
