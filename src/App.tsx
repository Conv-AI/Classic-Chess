import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { buildDynamicCoachInfo, chooseDanielleMove, coachLineForPosition, legalTargets } from './chessAi';
import { chessConvai } from './convaiManager';
import DanielleCoach from './DanielleCoach';
import LoadingScreen from './LoadingScreen';
import MenuScreen from './MenuScreen';
import type { CoachMessage, MoveRecord } from './types';

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

function squareAt(fileIndex: number, rankIndex: number): Square {
  return `${FILES[fileIndex]}${8 - rankIndex}` as Square;
}

function App() {
  const [screen, setScreen] = useState<'menu' | 'loading' | 'game'>('menu');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('Setting up the board...');

  useEffect(() => {
    return chessConvai.onStatus((status) => {
      if (status.botReady) {
        setLoadingProgress(100);
        setLoadingStep('Danielle is ready.');
      } else if (status.connected) {
        setLoadingProgress(78);
        setLoadingStep('Waiting for Danielle to finish warming up...');
      } else if (status.connecting) {
        setLoadingProgress(45);
        setLoadingStep('Connecting Danielle to Convai...');
      }
    });
  }, []);

  async function startLesson() {
    chessConvai.unlockAudio();
    setScreen('loading');
    setLoadingProgress(18);
    setLoadingStep('Loading Danielle and the chess room...');
    await chessConvai.connect();
    setLoadingProgress(100);
    setLoadingStep('Danielle is ready.');
    window.setTimeout(() => setScreen('game'), 450);
  }

  if (screen === 'menu') return <MenuScreen onPlay={() => void startLesson()} />;
  if (screen === 'loading') return <LoadingScreen progress={loadingProgress} step={loadingStep} />;
  return <ChessGame onBackToMenu={() => setScreen('menu')} />;
}

function ChessGame({ onBackToMenu }: { onBackToMenu: () => void }) {
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    {
      speaker: 'Danielle',
      text: 'I will play black and coach as we go. Control the center, develop quickly, and do not move the same piece twice without a reason.',
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const coachLogRef = useRef<HTMLDivElement | null>(null);
  const moveListRef = useRef<HTMLOListElement | null>(null);

  const legalMoves = useMemo(() => {
    if (!selected) return [];
    return legalTargets(game.fen(), selected);
  }, [game, selected]);

  const lastMove = history[history.length - 1];
  const status = getStatus(game);

  useEffect(() => {
    return chessConvai.onResponse((response) => {
      setCoachMessages((messages) => [
        ...messages.slice(-5),
        { speaker: 'Danielle', text: response.text },
      ]);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void chessConvai.speakCoachMessage(
        'Speak as Danielle, my chess coach. Greet me briefly and invite me to play the first move. One sentence only.',
        buildDynamicCoachInfo(game),
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (coachLogRef.current) coachLogRef.current.scrollTop = coachLogRef.current.scrollHeight;
  }, [coachMessages]);

  useEffect(() => {
    if (moveListRef.current) moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
  }, [history]);

  function addCoach(text: string) {
    setCoachMessages((messages) => [...messages.slice(-5), { speaker: 'Danielle', text }]);
  }

  function resetGame() {
    setGame(new Chess());
    setSelected(null);
    setHistory([]);
    setThinking(false);
    setCoachMessages([
      {
        speaker: 'Danielle',
        text: 'Fresh board. I am black again. Build a center, castle early, and I will tell you what I am trying to prove.',
      },
    ]);
  }

  function makePlayerMove(from: Square, to: Square) {
    const next = new Chess(game.fen());
    const move = next.move({ from, to, promotion: 'q' });
    if (!move) return false;

    setGame(next);
    setHistory((moves) => [...moves, toRecord(move, 'You')]);
    setSelected(null);

    if (next.isGameOver()) {
      addCoach(coachLineForPosition(next));
      return true;
    }

    setThinking(true);
    window.setTimeout(() => void makeDanielleMove(next.fen()), 500);
    return true;
  }

  async function makeDanielleMove(fen: string) {
    const next = new Chess(fen);
    const planned = chooseDanielleMove(next.fen(), 2);
    const dynamicInfo = buildDynamicCoachInfo(next, planned);
    const prompt = planned
      ? `Speak as Danielle, my chess coach. Briefly explain your planned move ${planned.san}. Do not choose a different move. Keep it to one friendly coaching sentence.`
      : 'Speak as Danielle, my chess coach. Briefly comment on the current chess position.';

    const spoken = await chessConvai.speakCoachMessage(prompt, dynamicInfo);

    if (planned) {
      const applied = next.move(planned);
      setGame(next);
      setHistory((moves) => [...moves, toRecord(applied, 'Danielle')]);
      if (!spoken.trim()) addCoach(coachLineForPosition(next, applied));
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
      if (makePlayerMove(selected, square)) return;
    }
    if (piece?.color === 'w') setSelected(square);
  }

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={onBackToMenu}>Menu</button>
        <h1>Classic Chess</h1>
        <span>{history.length ? `Move ${Math.ceil(history.length / 2)}` : 'Opening'}</span>
      </header>

      <div className="app-shell">
        <DanielleCoach status={thinking ? 'Thinking through candidate moves...' : status} />

        <section className="game-stage" aria-label="Chess board">
          <div className="board-wrap">
            <div className="rank-labels">
              {[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => (
                <span key={rank}>{rank}</span>
              ))}
            </div>
            <div className="chess-board">
              {Array.from({ length: 8 }).map((_, rankIndex) =>
                Array.from({ length: 8 }).map((__, fileIndex) => {
                  const square = squareAt(fileIndex, rankIndex);
                  const piece = game.get(square);
                  const isLight = (rankIndex + fileIndex) % 2 === 0;
                  const isSelected = selected === square;
                  const isTarget = legalMoves.includes(square);
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
                      onClick={() => handleSquareClick(square)}
                      aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
                    >
                      {piece && <span className={`piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}>{PIECES[`${piece.color}${piece.type}`]}</span>}
                    </button>
                  );
                }),
              )}
            </div>
            <div className="file-labels">
              {FILES.map((file) => (
                <span key={file}>{file}</span>
              ))}
            </div>
          </div>
        </section>

        <aside className="side-panel">
          <div className="panel-card turn-card">
            <p className="eyebrow">Game State</p>
            <h2>{game.turn() === 'w' ? 'Your move' : 'Danielle to move'}</h2>
            <p>{status}</p>
            <button className="primary-action" onClick={resetGame}>New game</button>
          </div>

          <div className="panel-card coach-card-panel">
            <p className="eyebrow">Coach Notes</p>
            <div className="coach-log invisible-scroll" ref={coachLogRef}>
              {coachMessages.map((message, index) => (
                <p key={`${message.speaker}-${index}`}>
                  <strong>{message.speaker}:</strong> {message.text}
                </p>
              ))}
            </div>
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
    </main>
  );
}

function toRecord(move: Move, by: MoveRecord['by']): MoveRecord {
  return { san: move.san, from: move.from, to: move.to, piece: move.piece, by };
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

function getStatus(game: Chess) {
  if (game.isCheckmate()) return game.turn() === 'w' ? 'Checkmate. Danielle wins.' : 'Checkmate. You win.';
  if (game.isStalemate()) return 'Stalemate. No legal move is available.';
  if (game.isDraw()) return 'Drawn position.';
  if (game.isCheck()) return 'Check. The king needs attention.';
  return game.turn() === 'w' ? 'White to move. Choose a piece.' : 'Danielle is considering her reply.';
}

export default App;
