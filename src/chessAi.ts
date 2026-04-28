import { Chess, type Move, type Square } from 'chess.js';

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

export function buildDynamicCoachInfo(game: Chess, plannedMove?: Move | null) {
  const turn = game.turn() === 'w' ? 'White to move' : 'Black to move';
  const status = game.isCheckmate()
    ? 'checkmate'
    : game.isDraw()
      ? 'draw'
      : game.isCheck()
        ? 'check'
        : 'normal play';
  const legalMoveCount = game.moves().length;
  const moveHint = plannedMove ? `Danielle planned move: ${plannedMove.san} from ${plannedMove.from} to ${plannedMove.to}.` : '';
  return `${turn}. Position status: ${status}. Legal moves available: ${legalMoveCount}. ${moveHint}`.trim();
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
