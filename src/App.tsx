import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { buildDynamicCoachInfo, legalTargets } from './chessAi';
import { chessConvai } from './convaiManager';
import DanielleCoach from './DanielleCoach';
import LoadingScreen from './LoadingScreen';
import MenuScreen from './MenuScreen';
import { stockfishEngine } from './stockfishEngine';
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
const THINKING_WORDS = ['Scheming', 'Plotting', 'Squinting', 'Calculating', 'Mischief'];

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
  const [thinking, setThinking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const moveListRef = useRef<HTMLOListElement | null>(null);

  const legalMoves = useMemo(() => {
    if (!selected) return [];
    return legalTargets(game.fen(), selected);
  }, [game, selected]);

  const lastMove = history[history.length - 1];
  const status = getStatus(game);

  useEffect(() => {
    if (moveListRef.current) moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
  }, [history]);

  function resetGame() {
    setGame(new Chess());
    setSelected(null);
    setHistory([]);
    setThinking(false);
  }

  function makePlayerMove(from: Square, to: Square) {
    const next = new Chess(game.fen());
    const move = next.move({ from, to, promotion: 'q' });
    if (!move) return false;

    setGame(next);
    setHistory((moves) => [...moves, toRecord(move, 'You')]);
    setSelected(null);

    if (next.isGameOver()) return true;

    setThinking(true);
    void makeDanielleMove(next.fen(), move);
    return true;
  }

  async function makeDanielleMove(fen: string, playerMove?: Move) {
    const next = new Chess(fen);
    const aiStartedAt = performance.now();
    const planned = await stockfishEngine.bestMove(next.fen(), 900);
    console.info(`[Chess Timing] Stockfish move search: ${(performance.now() - aiStartedAt).toFixed(1)}ms`);
    const dynamicInfo = buildDynamicCoachInfo(next, planned, playerMove);
    const prompt = planned
      ? `Speak as Danielle, my chess coach. Give exactly one short, meaningful sentence under 18 words. React to the player's last move only if it matters, then explain the purpose of your reply. You are Danielle and this is YOUR move as black, not the player's move. My exact planned legal move is ${planned.san} from ${planned.from} to ${planned.to}, which means: ${describeMoveForSpeech(planned)}. If you lost material, admit it briefly. Say "I" or "my", not "you" or "your", when referring to your move. Do not invent another move. Do not say chess notation, square names, file-rank names, or SAN aloud. Avoid phrases like e5, f8, Bxf5, knight f3, or bishop takes f5.`
      : 'Speak as Danielle, my chess coach. Give exactly one short, meaningful sentence under 18 words about the current position.';

    const speechStartedAt = performance.now();
    const spoken = await chessConvai.speakCoachMessage(prompt, dynamicInfo);
    console.info(`[Chess Timing] Danielle speech roundtrip: ${(performance.now() - speechStartedAt).toFixed(1)}ms`);

    if (planned) {
      const applied = next.move(planned);
      setGame(next);
      setHistory((moves) => [...moves, toRecord(applied, 'Danielle')]);
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
      if (piece?.color === 'w') {
        setSelected(square);
        return;
      }
    }
    if (piece?.color === 'w') setSelected(square);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    await chessConvai.sendUserChat(text, buildDynamicCoachInfo(game, null, lastMove ? moveRecordToMoveLike(lastMove) : null));
  }

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={onBackToMenu}>Menu</button>
        <h1>Classic Chess</h1>
        <div className="topbar-actions">
          <span>{history.length ? `Move ${Math.ceil(history.length / 2)}` : 'Opening'}</span>
          <button onClick={() => setChatOpen((open) => !open)}>Chat</button>
        </div>
      </header>

      <div className="app-shell">
        <DanielleCoach status={thinking ? `${thinkingWord(history.length)}...` : status} />

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

      {chatOpen && (
        <section className="chat-drawer" aria-label="Chat with Danielle">
          <div className="chat-drawer-header">
            <strong>Ask Danielle</strong>
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

function thinkingWord(seed: number) {
  return THINKING_WORDS[seed % THINKING_WORDS.length];
}

function toRecord(move: Move, by: MoveRecord['by']): MoveRecord {
  return { san: move.san, from: move.from, to: move.to, piece: move.piece, captured: move.captured, color: move.color, by };
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

function describeMoveForSpeech(move: Move) {
  const piece = pieceName(move.piece).toLowerCase();
  if (move.flags.includes('k') || move.flags.includes('q')) return 'Danielle is castling to improve her king safety';
  if (move.captured) return `Danielle's ${piece} captures one of the player's ${pieceName(move.captured).toLowerCase()}s`;
  if (move.promotion) return `Danielle's pawn promotes to a ${pieceName(move.promotion).toLowerCase()}`;
  if (move.piece === 'p') return 'Danielle is moving one of her pawns to influence the center and gain space';
  return `Danielle is improving her ${piece} and making it more active`;
}

function getStatus(game: Chess) {
  if (game.isCheckmate()) return game.turn() === 'w' ? 'Checkmate. Danielle wins.' : 'Checkmate. You win.';
  if (game.isStalemate()) return 'Stalemate. No legal move is available.';
  if (game.isDraw()) return 'Drawn position.';
  if (game.isCheck()) return 'Check. The king needs attention.';
  return game.turn() === 'w' ? 'White to move. Choose a piece.' : 'Danielle is considering her reply.';
}

export default App;
