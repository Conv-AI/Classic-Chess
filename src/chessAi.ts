import { Chess, type Move, type Square } from 'chess.js';
import type { CoachConfig, DifficultyConfig } from './coachConfig';

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const CENTER_SQUARES = new Set(['d4', 'e4', 'd5', 'e5']);
const NEAR_CENTER_SQUARES = new Set(['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6']);

function materialScore(game: Chess) {
  let score = 0;
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const direction = piece.color === 'w' ? 1 : -1;
      score += direction * PIECE_VALUES[piece.type];
    }
  }
  return score;
}

function positionalScore(game: Chess) {
  let score = 0;
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const direction = piece.color === 'w' ? 1 : -1;
      const square = piece.square;
      if (CENTER_SQUARES.has(square)) score += direction * 28;
      if (NEAR_CENTER_SQUARES.has(square)) score += direction * 12;
      if (piece.type === 'n' || piece.type === 'b') {
        const homeRank = piece.color === 'w' ? '1' : '8';
        if (!square.endsWith(homeRank)) score += direction * 16;
      }
    }
  }
  return score;
}

function evaluate(game: Chess) {
  if (game.isCheckmate()) return game.turn() === 'w' ? -100000 : 100000;
  if (game.isDraw()) return 0;
  const mobility = game.moves().length * (game.turn() === 'w' ? 2 : -2);
  return materialScore(game) + positionalScore(game) + mobility;
}

function orderMoves(moves: Move[]) {
  return [...moves].sort((a, b) => movePriority(b) - movePriority(a));
}

function movePriority(move: Move) {
  let score = 0;
  if (move.captured) score += PIECE_VALUES[move.captured] + 40;
  if (move.promotion) score += PIECE_VALUES[move.promotion];
  if (CENTER_SQUARES.has(move.to)) score += 18;
  if (move.san.includes('+')) score += 25;
  if (move.san.includes('#')) score += 10000;
  return score;
}

function minimax(game: Chess, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || game.isGameOver()) return evaluate(game);

  const maximizing = game.turn() === 'w';
  const moves = orderMoves(game.moves({ verbose: true }));

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      game.move(move);
      best = Math.max(best, minimax(game, depth - 1, alpha, beta));
      game.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    game.move(move);
    best = Math.min(best, minimax(game, depth - 1, alpha, beta));
    game.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseDanielleMove(fen: string, depth = 2) {
  const game = new Chess(fen);
  const moves = orderMoves(game.moves({ verbose: true }));
  let bestMove = moves[0];
  let bestScore = game.turn() === 'w' ? -Infinity : Infinity;

  for (const move of moves) {
    game.move(move);
    const score = minimax(game, depth - 1, -Infinity, Infinity);
    game.undo();
    if (game.turn() === 'w' ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

export function legalTargets(fen: string, square: Square) {
  const game = new Chess(fen);
  return game.moves({ square, verbose: true }).map((move) => move.to);
}

export function buildDynamicCoachInfo(
  game: Chess,
  plannedMove?: Move | null,
  lastMove?: Move | null,
  coach?: Pick<CoachConfig, 'name' | 'title' | 'chessFocus' | 'voiceStyle'> | string,
  difficulty?: Pick<DifficultyConfig, 'label' | 'elo' | 'stockfishSkill' | 'curriculum' | 'explanationDepth'>,
) {
  const coachName = typeof coach === 'string' ? coach : coach?.name ?? 'Coach';
  const coachInfo = typeof coach === 'object'
    ? `Coach identity: I am ${coach.name}, ${coach.title}. My chess specialty: ${coach.chessFocus}. My voice: ${coach.voiceStyle}.`
    : `Coach identity: I am ${coachName}.`;
  const levelInfo = difficulty
    ? `Student level: ${difficulty.label}, approximate rating ${difficulty.elo}, Stockfish skill ${difficulty.stockfishSkill}. Teaching curriculum for this level: ${difficulty.curriculum}. Explanation depth: ${difficulty.explanationDepth}.`
    : '';
  const turn = game.turn() === 'w' ? 'White to move' : 'Black to move';
  const status = game.isCheckmate()
    ? 'checkmate'
    : game.isDraw()
      ? 'draw'
      : game.isCheck()
        ? 'check'
        : 'normal play';
  const legalMoveCount = game.moves().length;
  const material = materialSummary(game);
  const lastMoveInfo = lastMove ? describeLastMove(lastMove) : 'No move has been played yet.';
  const moveHint = plannedMove
    ? `My private legal reply as ${coachName}: I will move my ${pieceName(plannedMove.piece)} from ${plannedMove.from} to ${plannedMove.to} (SAN: ${plannedMove.san}).`
    : '';
  const tacticalInfo = tacticalSummary(game, lastMove);
  return [
    coachInfo,
    levelInfo,
    turn,
    `Position status: ${status}.`,
    `Legal moves available: ${legalMoveCount}.`,
    material,
    tacticalInfo,
    lastMoveInfo,
    moveHint,
    'Speech rule: speak in first person as the coach. Address the user as "you". Do not say "the player", "they", or "the coach". Never write raw chess notation (SAN, square names, file names) — spell everything out as natural speech for TTS: "knight to f 3" not "Nf3", "pawn to e 4" not "e4", "the a file" not "a-file".',
  ].filter(Boolean).join(' ').trim();
}

export function buildCoachInstruction(coach: CoachConfig, difficulty: DifficultyConfig, mode: 'move' | 'hint' | 'chat') {
  const base = [
    `I am ${coach.name}, ${coach.title}, speaking directly to my chess student.`,
    `I must speak in first person as myself: use "I" for my own coaching view and "you" for the student.`,
    'I must not say "the player", "they", "them", or "the coach" in the spoken answer.',
    `Current student level: ${difficulty.label} (${difficulty.elo}), Stockfish skill ${difficulty.stockfishSkill}.`,
    `Teach at this level using this curriculum: ${difficulty.curriculum}.`,
    `Depth rule: ${difficulty.explanationDepth}`,
    `My specialty: ${coach.chessFocus}.`,
    coach.promptStyle,
    'TTS speech rule: my response will be read aloud by a text-to-speech engine. Never write raw chess notation like "Nf3", "e4", "Bxe5", or "a-file" — the TTS cannot pronounce these correctly. Instead always spell them out naturally: say "knight to f 3", "pawn to e 4", "bishop takes e 5", "the a file". Separate every letter and number with a space or a word. Write speech, not notation.',
  ];

  if (mode === 'move') {
    base.push(
      'Give a real coaching explanation, not a generic reaction.',
      'Reference at least one concrete chess concept when useful, such as development, king safety, a pin, a fork, a loose piece, an open file, pawn structure, candidate moves, prophylaxis, or conversion.',
      'Keep it natural for voice: usually 1-2 sentences, up to 34 words if the position needs teaching.',
      'Coach what you just saw on the board. Do not narrate routine engine moves.',
    );
  }

  if (mode === 'hint') {
    base.push(
      coach.hintStyle,
      'Give a structured class-style hint. Connect it to a study topic or thinking routine.',
      'Do not reveal the exact move before hint level 3.',
    );
  }

  if (mode === 'chat') {
    base.push(
      'Answer like a chess teacher in office hours: concrete, level-appropriate, and tied to the current position.',
    );
  }

  return base.join(' ');
}

function materialSummary(game: Chess) {
  const score = materialScore(game);
  if (Math.abs(score) < 100) return 'Material is roughly equal.';
  const leader = score > 0 ? 'White/player' : 'Black/coach';
  return `${leader} is ahead by about ${Math.abs(score)} centipawns of material.`;
}

function describeLastMove(move: Move) {
  const mover = move.color === 'w' ? 'You' : 'I';
  const piece = pieceName(move.piece);
  const capture = move.captured
    ? move.color === 'w'
      ? ` You captured my ${pieceName(move.captured)}; I should acknowledge losing material if it matters.`
      : ` I captured your ${pieceName(move.captured)}.`
    : '';
  const check = move.san.includes('+') ? ' The move gave check.' : '';
  const mate = move.san.includes('#') ? ' The move gave checkmate.' : '';
  return `Last move: ${mover} moved a ${piece} from ${move.from} to ${move.to}.${capture}${check}${mate}`;
}

function tacticalSummary(game: Chess, lastMove?: Move | null) {
  const legal = game.moves({ verbose: true });
  const checks = legal.filter((move) => move.san.includes('+') || move.san.includes('#')).length;
  const captures = legal.filter((move) => move.captured).length;
  const promotions = legal.filter((move) => move.promotion).length;
  const movedPiece = lastMove ? pieceName(lastMove.piece) : '';
  const centerMove = lastMove && (CENTER_SQUARES.has(lastMove.to) || NEAR_CENTER_SQUARES.has(lastMove.to))
    ? `Your last move affected the center with a ${movedPiece}.`
    : '';
  return [
    `Forcing move scan for side to move: ${checks} checks, ${captures} captures, ${promotions} promotions.`,
    centerMove,
  ].filter(Boolean).join(' ');
}

function pieceName(piece: string) {
  const names: Record<string, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  return names[piece] ?? 'piece';
}

export function coachLineForPosition(game: Chess, plannedMove?: Move | null) {
  if (game.isCheckmate()) {
    return game.turn() === 'w'
      ? 'That is checkmate. Black converted the attack cleanly.'
      : 'Checkmate. White found the finishing pattern.';
  }
  if (game.isDraw()) return 'That position is drawn. Nice, calm defense.';
  if (game.isCheck()) return 'You are in check, so first we solve the king safety problem.';
  if (plannedMove) return `I am choosing ${plannedMove.san}. Watch how it improves activity instead of just chasing material.`;
  return 'Look for forcing moves first: checks, captures, threats, then improve your worst piece.';
}
