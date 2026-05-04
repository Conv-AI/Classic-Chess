import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { analyzeGame } from './analysis';
import { COACHES, DIFFICULTIES, getCoach, getDifficulty, type CoachId, type DifficultyId } from './coachConfig';
import { createCustomCoach, fetchLanguages, fetchVoices, hasConvaiApiKey, MODEL_OPTIONS, type LanguageOption, type VoiceOption } from './convaiCoreApi';
import { buildCoachInstruction, buildDynamicCoachInfo, legalTargets } from './chessAi';
import { chessConvai } from './convaiManager';
import { debugLog } from './debugLog';
import CoachCard from './DanielleCoach';
import LoadingScreen from './LoadingScreen';
import MenuScreen from './MenuScreen';
import { PUZZLES, puzzleScore, type Puzzle } from './puzzles';
import { stockfishEngine } from './stockfishEngine';
import { createSessionId, deleteSession, loadSessions, saveSession, type AnalysisSummary, type MoveSnapshot, type StoredGameSession } from './storage';
import type { MoveRecord } from './types';

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

type Screen = 'menu' | 'loading' | 'game' | 'puzzles' | 'games' | 'creator';

function squareAt(fileIndex: number, rankIndex: number): Square {
  return `${FILES[fileIndex]}${8 - rankIndex}` as Square;
}

function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [coachId, setCoachId] = useState<CoachId>('arjun');
  const [difficultyId, setDifficultyId] = useState<DifficultyId>('beginner');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('Setting up the board...');
  const [prewarmCoachId, setPrewarmCoachId] = useState<CoachId | null>(null);
  const avatarReadyResolverRef = useRef<(() => void) | null>(null);
  const [sessions, setSessions] = useState<StoredGameSession[]>(() => loadSessions());
  const coach = getCoach(coachId);

  useEffect(() => {
    return chessConvai.onStatus((status) => {
      if (status.activeCoachId !== coachId) return;
      if (status.botReady) {
        setLoadingProgress(100);
        setLoadingStep(`${coach.name} is ready.`);
      } else if (status.connected) {
        setLoadingProgress(78);
        setLoadingStep(`Waiting for ${coach.name} to finish warming up...`);
      } else if (status.connecting) {
        setLoadingProgress(45);
        setLoadingStep(`Connecting ${coach.name} to Convai...`);
      }
    });
  }, [coach.name, coachId]);

  async function startQuickPlay() {
    debugLog('App', `startQuickPlay — coach=${coach.id} difficulty=${difficultyId}`);
    chessConvai.unlockAudio();
    const selectedCoach = coach;
    setScreen('loading');
    setPrewarmCoachId(selectedCoach.id);
    setLoadingProgress(18);
    setLoadingStep(`Loading ${selectedCoach.name} and the chess room...`);
    const avatarReady = new Promise<void>((resolve) => {
      avatarReadyResolverRef.current = resolve;
      window.setTimeout(resolve, 12000);
    });
    debugLog('App', `Awaiting connectCoach + avatar prewarm for ${selectedCoach.name}`);
    await Promise.all([chessConvai.connectCoach(selectedCoach), avatarReady]);
    debugLog('App', `Coach and avatar ready — transitioning to game`);
    setLoadingProgress(100);
    setLoadingStep(`${selectedCoach.name} is ready.`);
    window.setTimeout(() => setScreen('game'), 450);
  }

  function refreshSessions() {
    setSessions(loadSessions());
  }

  if (screen === 'loading') {
    const prewarmCoach = prewarmCoachId ? getCoach(prewarmCoachId) : coach;
    return (
      <LoadingScreen progress={loadingProgress} step={loadingStep}>
        <CoachCard
          coach={prewarmCoach}
          status="Preparing portrait..."
          onReady={() => {
            avatarReadyResolverRef.current?.();
            avatarReadyResolverRef.current = null;
          }}
        />
      </LoadingScreen>
    );
  }
  if (screen === 'game') {
    return (
      <ChessGame
        coachId={coachId}
        difficultyId={difficultyId}
        onBackToMenu={() => {
          refreshSessions();
          setScreen('menu');
        }}
        onSessionsChanged={refreshSessions}
      />
    );
  }
  if (screen === 'puzzles') {
    return <PuzzleScreen coachId={coachId} difficultyId={difficultyId} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'games') {
    return (
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
  }
  if (screen === 'creator') return <CustomCoachCreator onBack={() => setScreen('menu')} />;

  return (
    <MenuScreen
      coachId={coachId}
      difficultyId={difficultyId}
      savedGameCount={sessions.length}
      onCoachChange={setCoachId}
      onDifficultyChange={setDifficultyId}
      onQuickPlay={() => void startQuickPlay()}
      onPuzzles={() => setScreen('puzzles')}
      onGames={() => {
        refreshSessions();
        setScreen('games');
      }}
      onCreator={() => setScreen('creator')}
    />
  );
}

function ChessGame({
  coachId,
  difficultyId,
  onBackToMenu,
  onSessionsChanged,
}: {
  coachId: CoachId;
  difficultyId: DifficultyId;
  onBackToMenu: () => void;
  onSessionsChanged: () => void;
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
  const moveListRef = useRef<HTMLOListElement | null>(null);

  const legalMoves = useMemo(() => {
    if (!selected) return [];
    return legalTargets(game.fen(), selected);
  }, [game, selected]);

  const lastMove = history[history.length - 1];
  const status = thinking ? `${coach.name} is calculating...` : getStatus(game, coach.name);

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

  useEffect(() => {
    if (!history.length || !game.isGameOver() || analysisStartedRef.current) return;
    analysisStartedRef.current = true;
    setAnalysisPending(true);
    void analyzeGame(history, game.fen(), async (fen) => {
      const best = await stockfishEngine.bestMove(fen, 380, Math.max(14, difficulty.stockfishSkill));
      return best?.san ?? null;
    }).then((summary) => {
      setAnalysis(summary);
      setAnalysisPending(false);
    });
  }, [difficulty.stockfishSkill, game, history]);

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
      result: resultLabel(currentGame, coach.name),
      finalFen: currentGame.fen(),
      hintsUsed: hintCount,
      moves,
      analysis: currentAnalysis ?? undefined,
    });
  }

  function resetGame() {
    sessionIdRef.current = createSessionId();
    analysisStartedRef.current = false;
    setGame(new Chess());
    setSelected(null);
    setHistory([]);
    setThinking(false);
    setCoachLine('');
    setHintText('');
    setHintLevel(0);
    setHintsUsed(0);
    setAnalysis(null);
    setAnalysisPending(false);
  }

  function makePlayerMove(from: Square, to: Square) {
    const next = new Chess(game.fen());
    const fenBefore = next.fen();
    const move = next.move({ from, to, promotion: 'q' });
    if (!move) return false;
    const record = toRecord(move, 'You', fenBefore, next.fen());

    setGame(next);
    setHistory((moves) => [...moves, record]);
    setSelected(null);
    setHintText('');
    setHintLevel(0);

    if (!next.isGameOver()) {
      setThinking(true);
      void makeCoachMove(next.fen(), move);
    }
    return true;
  }

  async function makeCoachMove(fen: string, playerMove?: Move) {
    const next = new Chess(fen);
    const planned = await stockfishEngine.bestMove(next.fen(), difficulty.moveTimeMs, difficulty.stockfishSkill);
    const dynamicInfo = buildDynamicCoachInfo(next, planned, playerMove, coach, difficulty);
    const prompt = planned
      ? [
        buildCoachInstruction(coach, difficulty, 'move'),
        'Explain the current position like a real chess class, not a random reaction.',
        'Use the private legal reply only as hidden context for my next move; do not say it unless it is truly instructional.',
        `Private legal reply: ${planned.san} from ${planned.from} to ${planned.to}.`,
        'Do not invent another move. Do not say raw SAN, file-rank square names, or notation aloud unless a text-only answer requires it.',
      ].join(' ')
      : `${buildCoachInstruction(coach, difficulty, 'move')} Give a useful chess-class explanation of the current position.`;

    const spoken = await chessConvai.speakCoachMessage(coach, prompt, dynamicInfo);
    if (spoken) setCoachLine(spoken);

    if (planned) {
      const fenBefore = next.fen();
      const applied = next.move(planned);
      if (applied) {
        setGame(next);
        setHistory((moves) => [...moves, toRecord(applied, coach.name, fenBefore, next.fen())]);
      }
    }
    setThinking(false);
  }

  function handleSquareClick(square: Square) {
    chessConvai.unlockAudio();
    if (thinking || game.isGameOver() || game.turn() !== 'w') return;
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
    const nextLevel = Math.min(3, hintLevel + 1);
    setHintLevel(nextLevel);
    setHintsUsed((count) => count + 1);
    const best = await stockfishEngine.bestMove(game.fen(), 520, Math.max(10, difficulty.stockfishSkill));
    const localHint = buildHintText(nextLevel, best, coach.name);
    setHintText(localHint);
    const dynamicInfo = buildDynamicCoachInfo(game, best, lastMove ? moveRecordToMoveLike(lastMove) : null, coach, difficulty);
    const prompt = [
      buildCoachInstruction(coach, difficulty, 'hint'),
      `You asked me for hint level ${nextLevel} of 3.`,
      nextLevel < 3 ? 'Do not reveal the exact move.' : `You may reveal this move naturally: ${best?.san ?? 'the best move'}.`,
      localHint,
      'Use 1-2 useful teaching sentences and avoid raw square notation aloud.',
    ].join(' ');
    const spoken = await chessConvai.speakCoachMessage(coach, prompt, dynamicInfo);
    if (spoken) setCoachLine(spoken);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    const spoken = await chessConvai.sendUserChat(
      coach,
      difficulty,
      text,
      buildDynamicCoachInfo(game, null, lastMove ? moveRecordToMoveLike(lastMove) : null, coach, difficulty),
    );
    if (spoken) setCoachLine(spoken);
  }

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={onBackToMenu}>Menu</button>
        <h1>Classic Chess</h1>
        <div className="topbar-actions">
          <span>{difficulty.label}</span>
          <button onClick={() => setChatOpen((open) => !open)}>Chat</button>
        </div>
      </header>

      <div className="app-shell">
        <CoachCard coach={coach} status={status} lastLine={coachLine || hintText} />

        <section className="game-stage" aria-label="Chess board">
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
            <button className="primary-action" onClick={() => void askHint()} disabled={game.turn() !== 'w' || thinking || game.isGameOver()}>
              Ask Hint {hintLevel ? `(${hintLevel}/3)` : ''}
            </button>
            <button className="ghost-action" onClick={resetGame}>New game</button>
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

          {(analysisPending || analysis) && (
            <AnalysisPanel analysis={analysis} pending={analysisPending} />
          )}
        </aside>
      </div>

      {chatOpen && (
        <section className="chat-drawer" aria-label={`Chat with ${coach.name}`}>
          <div className="chat-drawer-header">
            <strong>Ask {coach.name}</strong>
            <button onClick={() => setChatOpen(false)}>Minimize</button>
          </div>
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendChat();
              }
            }}
            placeholder="Ask about the current position..."
          />
          <button className="primary-action" onClick={() => void sendChat()}>Send</button>
        </section>
      )}
    </main>
  );
}

function ChessBoard({
  game,
  selected,
  legalMoves,
  lastMove,
  onSquareClick,
}: {
  game: Chess;
  selected?: Square | null;
  legalMoves?: Square[];
  lastMove?: Pick<MoveSnapshot, 'from' | 'to'> | null;
  onSquareClick?: (square: Square) => void;
}) {
  return (
    <div className="board-wrap">
      <div className="rank-labels">
        {[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => <span key={rank}>{rank}</span>)}
      </div>
      <div className="chess-board">
        {Array.from({ length: 8 }).map((_, rankIndex) =>
          Array.from({ length: 8 }).map((__, fileIndex) => {
            const square = squareAt(fileIndex, rankIndex);
            const piece = game.get(square);
            const isLight = (rankIndex + fileIndex) % 2 === 0;
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
        {FILES.map((file) => <span key={file}>{file}</span>)}
      </div>
    </div>
  );
}

function PuzzleScreen({ coachId, difficultyId, onBack }: { coachId: CoachId; difficultyId: DifficultyId; onBack: () => void }) {
  const coach = getCoach(coachId);
  const filtered = PUZZLES.filter((puzzle) => puzzle.difficultyId === difficultyId);
  const puzzles = filtered.length >= 3 ? filtered : PUZZLES;
  const [index, setIndex] = useState(0);
  const puzzle = puzzles[index % puzzles.length];
  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [selected, setSelected] = useState<Square | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [coachReady, setCoachReady] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(10);
  const [loadingStep, setLoadingStep] = useState(`Loading ${coach.name}...`);
  const avatarReadyRef = useRef<boolean>(false);

  // Connect Convai coach on mount
  useEffect(() => {
    debugLog('PuzzleScreen', `Mounting — connecting coach ${coach.name} (${coach.id})`);
    chessConvai.unlockAudio();
    void chessConvai.connectCoach(coach).then(() => {
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
  }, [coach]);

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
  }, [puzzle]);

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
          debugLog('PuzzleScreen', `Correct move — asking coach to explain. bonus=${bonus}`);
          const prompt = `The student just played the correct move ${move.san} in the puzzle "${puzzle.title}" (theme: ${puzzle.theme}). ${puzzle.explanation} Give a short congratulatory teaching line.`;
          void chessConvai.speakCoachMessage(coach, prompt, `Puzzle theme: ${puzzle.theme}. Side to move: ${puzzle.sideToMove}.`);
        } else {
          setStreak(0);
          debugLog('PuzzleScreen', `Incorrect move ${move.san} — correct was ${puzzle.solution[0]}`);
          const prompt = `The student played ${move.san} but the correct move was ${puzzle.solution[0]} in the puzzle "${puzzle.title}" (theme: ${puzzle.theme}). ${puzzle.explanation} Give a brief corrective teaching line.`;
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
      `The student asked for hint level ${next} of 3 in puzzle "${puzzle.title}" (theme: ${puzzle.theme}).`,
      next < 3 ? 'Do not reveal the exact move.' : `You may reveal the move: ${puzzle.solution[0]}.`,
      hintText,
      'Give 1-2 teaching sentences. Do not read raw square notation aloud.',
    ].join(' ');
    void chessConvai.speakCoachMessage(coach, prompt, `Puzzle theme: ${puzzle.theme}. Side to move: ${puzzle.sideToMove}.`);
  }

  function nextPuzzle() {
    debugLog('PuzzleScreen', `Advancing to puzzle index ${index + 1}`);
    setIndex((v) => v + 1);
  }

  if (!ready) {
    return (
      <LoadingScreen progress={loadingProgress} step={loadingStep}>
        <CoachCard
          coach={coach}
          status="Loading..."
          onReady={handleAvatarReady}
        />
      </LoadingScreen>
    );
  }

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={onBack}>Menu</button>
        <h1>Puzzles with AI</h1>
        <div className="topbar-actions">
          <span>{score} pts</span>
          <span>{streak} streak</span>
        </div>
      </header>
      <div className="training-layout">
        <div className="puzzle-left-col">
          <CoachCard coach={coach} status={`${puzzle.theme} · ${puzzle.title}`} lastLine={feedback || undefined} />
          <div className="puzzle-actions">
            <button className="primary-action" onClick={() => void askPuzzleHint()} disabled={hintsUsed >= 3}>
              Hint {hintsUsed > 0 ? `(${hintsUsed}/3)` : ''}
            </button>
            <button className="ghost-action" onClick={nextPuzzle}>Next puzzle</button>
          </div>
        </div>
        <section className="game-stage puzzle-board-stage">
          <ChessBoard game={game} selected={selected} legalMoves={legalMoves} onSquareClick={(sq) => void handlePuzzleSquare(sq)} />
        </section>
      </div>
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
        <button onClick={onBack}>Menu</button>
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
          <button title="Start" aria-label="Start" onClick={() => setPly(0)}><ChevronsLeft size={18} /></button>
          <button title="Previous" aria-label="Previous" onClick={() => setPly((value) => Math.max(0, value - 1))}><ChevronLeft size={18} /></button>
          <span>{ply}/{session.moves.length}</span>
          <button title="Next" aria-label="Next" onClick={() => setPly((value) => Math.min(session.moves.length, value + 1))}><ChevronRight size={18} /></button>
          <button title="End" aria-label="End" onClick={() => setPly(session.moves.length)}><ChevronsRight size={18} /></button>
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

function CustomCoachCreator({ onBack }: { onBack: () => void }) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [name, setName] = useState('My Chess Coach');
  const [backstory, setBackstory] = useState('A patient chess coach who adapts to my level, explains ideas clearly, and gives progressive hints before revealing answers.');
  const [voice, setVoice] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [temperature, setTemperature] = useState(0.45);
  const [status, setStatus] = useState('');
  const [createdId, setCreatedId] = useState('');

  async function loadOptions() {
    setStatus('Loading Convai voices and languages...');
    try {
      const [voiceOptions, languageOptions] = await Promise.all([fetchVoices(), fetchLanguages()]);
      setVoices(voiceOptions);
      setLanguages(languageOptions);
      setVoice(voiceOptions[0]?.value ?? '');
      setLanguage(languageOptions[0]?.code ?? 'en-US');
      setStatus('Options loaded.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load Convai options.');
    }
  }

  async function createCoach() {
    if (!voice) {
      setStatus('Choose a voice first.');
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
      });
      setCreatedId(result.charID);
      setStatus('Coach created and updated. Copy the character ID into the coach config when ready.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to create coach.');
    }
  }

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={onBack}>Menu</button>
        <h1>Custom Coach</h1>
        <div className="topbar-actions"><span>Local API demo</span></div>
      </header>
      <section className="creator-layout">
        <div className="panel-card creator-form">
          <p className="eyebrow">Convai Core API</p>
          <h2>Create your coach</h2>
          {!hasConvaiApiKey() && <p className="warning-text">Missing VITE_CONVAI_API_KEY. Add it locally before creating a coach.</p>}
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Backstory<textarea value={backstory} onChange={(event) => setBackstory(event.target.value)} /></label>
          <div className="form-row">
            <label>Voice<select value={voice} onChange={(event) => setVoice(event.target.value)}>
              <option value="">Load voices first</option>
              {voices.map((option) => <option key={option.value} value={option.value}>{option.name} ({option.gender})</option>)}
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
            <button className="ghost-action" onClick={() => void loadOptions()}>Load voices/languages</button>
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
  if (level === 1) return `${coachName}: Start with forcing moves and notice which of your pieces can become active.`;
  if (level === 2) return `${coachName}: The idea involves your ${pieceName(best.piece).toLowerCase()} creating immediate pressure.`;
  return `${coachName}: Try ${best.san}. It is the engine's clearest continuation here.`;
}

function getStatus(game: Chess, coachName: string) {
  if (game.isCheckmate()) return game.turn() === 'w' ? `Checkmate. ${coachName} wins.` : 'Checkmate. You win.';
  if (game.isStalemate()) return 'Stalemate. No legal move is available.';
  if (game.isDraw()) return 'Drawn position.';
  if (game.isCheck()) return 'Check. The king needs attention.';
  return game.turn() === 'w' ? 'White to move. Choose a piece.' : `${coachName} is considering a reply.`;
}

function resultLabel(game: Chess, coachName: string) {
  if (!game.isGameOver()) return 'In progress';
  if (game.isCheckmate()) return game.turn() === 'w' ? `${coachName} won by checkmate` : 'You won by checkmate';
  if (game.isStalemate()) return 'Draw by stalemate';
  return 'Draw';
}

function normalizeSan(san: string) {
  return san.replace(/[+#?!]/g, '');
}

export default App;
