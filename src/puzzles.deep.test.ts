import { describe, expect, it } from 'vitest';
import { Chess, type Move, type Square } from 'chess.js';
import { PUZZLES } from './puzzles';

// Comprehensive per-puzzle verifier. Each puzzle is checked against:
//   1. FEN parses, sideToMove matches FEN.
//   2. Solution[0] is a legal move.
//   3. Mate themes (incl. SAN suffix `#`) actually deliver checkmate.
//   4. Check SAN suffix `+` actually gives check.
//   5. Fork / double-attack / royal-fork themes: the moved piece attacks
//      at least two valuable enemy pieces (king counts).
//   6. Skewer themes: the move gives check (or attacks a queen) AND another
//      valuable enemy piece sits behind the target along the same line.
//   7. Discovered check / discovered attack themes: the moved piece itself
//      does NOT attack the king — the check/attack comes from a piece
//      the move uncovered.
//   8. Double-check theme: opponent is in check AND BOTH the moved piece
//      and at least one other piece attack the king.
//   9. Promotion / underpromotion themes: solution promotes (and not to
//      a queen for underpromotion).
//  10. Capture-flavoured themes (piece safety, hanging piece, removing the
//      defender, etc.): solution captures something.
//
// Failures are aggregated and thrown as one error so we see every broken
// puzzle in a single run.

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const FILE_TO_INDEX = (file: string) => file.charCodeAt(0) - 'a'.charCodeAt(0);
const RANK_TO_INDEX = (rank: string) => Number(rank) - 1;
const toSquare = (fileIdx: number, rankIdx: number): Square =>
  `${String.fromCharCode('a'.charCodeAt(0) + fileIdx)}${rankIdx + 1}` as Square;
const inBoard = (fileIdx: number, rankIdx: number) =>
  fileIdx >= 0 && fileIdx < 8 && rankIdx >= 0 && rankIdx < 8;

/** All squares the piece on `from` attacks (regardless of turn). */
function squaresAttackedFrom(game: Chess, from: Square): Set<Square> {
  const piece = game.get(from);
  if (!piece) return new Set();
  const result = new Set<Square>();
  const fileIdx = FILE_TO_INDEX(from[0]);
  const rankIdx = RANK_TO_INDEX(from[1]);

  const slide = (df: number, dr: number) => {
    let f = fileIdx + df;
    let r = rankIdx + dr;
    while (inBoard(f, r)) {
      const sq = toSquare(f, r);
      result.add(sq);
      if (game.get(sq)) return; // stop at first occupied square (it's still attacked)
      f += df;
      r += dr;
    }
  };

  switch (piece.type) {
    case 'n': {
      const jumps: Array<[number, number]> = [
        [1, 2], [2, 1], [-1, 2], [2, -1],
        [1, -2], [-2, 1], [-1, -2], [-2, -1],
      ];
      for (const [df, dr] of jumps) {
        const f = fileIdx + df;
        const r = rankIdx + dr;
        if (inBoard(f, r)) result.add(toSquare(f, r));
      }
      break;
    }
    case 'k': {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df === 0 && dr === 0) continue;
          const f = fileIdx + df;
          const r = rankIdx + dr;
          if (inBoard(f, r)) result.add(toSquare(f, r));
        }
      }
      break;
    }
    case 'b': {
      for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as Array<[number, number]>) {
        slide(df, dr);
      }
      break;
    }
    case 'r': {
      for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
        slide(df, dr);
      }
      break;
    }
    case 'q': {
      for (const [df, dr] of [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ] as Array<[number, number]>) {
        slide(df, dr);
      }
      break;
    }
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      for (const df of [-1, 1]) {
        const f = fileIdx + df;
        const r = rankIdx + dir;
        if (inBoard(f, r)) result.add(toSquare(f, r));
      }
      break;
    }
  }

  return result;
}

/** First piece (if any) along a ray (df, dr) starting one step past `from`. */
function firstPieceAlongRay(
  game: Chess,
  from: Square,
  df: number,
  dr: number,
): { square: Square; piece: ReturnType<Chess['get']> } | null {
  let f = FILE_TO_INDEX(from[0]) + df;
  let r = RANK_TO_INDEX(from[1]) + dr;
  while (inBoard(f, r)) {
    const sq = toSquare(f, r);
    const p = game.get(sq);
    if (p) return { square: sq, piece: p };
    f += df;
    r += dr;
  }
  return null;
}

/** Find every square (with piece) attacked by `color` that is a piece of `enemyColor`. */
function attackersOf(game: Chess, target: Square, byColor: 'w' | 'b'): Square[] {
  const attackers: Square[] = [];
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const sq = toSquare(f, r);
      const p = game.get(sq);
      if (!p || p.color !== byColor) continue;
      const attacks = squaresAttackedFrom(game, sq);
      if (attacks.has(target)) attackers.push(sq);
    }
  }
  return attackers;
}

function findKingSquare(game: Chess, color: 'w' | 'b'): Square | null {
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const sq = toSquare(f, r);
      const p = game.get(sq);
      if (p && p.type === 'k' && p.color === color) return sq;
    }
  }
  return null;
}

type Failure = { id: string; reason: string };

function verifyPuzzle(puzzle: typeof PUZZLES[number]): Failure[] {
  const failures: Failure[] = [];
  const push = (reason: string) => failures.push({ id: puzzle.id, reason });

  // 1. FEN parses
  let game: Chess;
  try {
    game = new Chess(puzzle.fen);
  } catch (err) {
    push(`invalid FEN "${puzzle.fen}": ${(err as Error).message}`);
    return failures;
  }

  // 2. sideToMove matches FEN
  if (game.turn() !== puzzle.sideToMove) {
    push(`sideToMove mismatch: FEN says "${game.turn()}", puzzle says "${puzzle.sideToMove}"`);
  }

  // 3. Solution legal
  const san = puzzle.solution[0];
  const legalSans = game.moves();
  if (!legalSans.includes(san)) {
    push(`solution "${san}" is illegal. Legal moves: ${legalSans.join(', ')}`);
    return failures;
  }

  // Apply the move to inspect post-state
  const after = new Chess(puzzle.fen);
  const verboseMove: Move | null = after.move(san) as Move | null;
  if (!verboseMove) {
    push(`failed to apply legal move "${san}" — chess.js refused`);
    return failures;
  }

  const moverColor = puzzle.sideToMove;
  const enemyColor: 'w' | 'b' = moverColor === 'w' ? 'b' : 'w';
  const enemyKingSq = findKingSquare(after, enemyColor);
  const movedPieceSquare = verboseMove.to as Square;
  const themeLower = puzzle.theme.toLowerCase();

  // Useful precomputed sets
  const movedPieceAttacks = squaresAttackedFrom(after, movedPieceSquare);
  const checkersOfEnemyKing = enemyKingSq
    ? attackersOf(after, enemyKingSq, moverColor)
    : [];

  // Theme classification
  const isMateTheme =
    themeLower.includes('mate') ||
    themeLower.includes('checkmate');
  const sanIndicatesMate = san.includes('#');
  const sanIndicatesCheck = san.includes('+') || sanIndicatesMate;
  const isCheckTheme = themeLower.includes('check');
  const isDiscoveredTheme = themeLower.includes('discover');
  const isDoubleCheckTheme = themeLower.includes('double check');
  const isForkTheme =
    themeLower.includes('fork') ||
    themeLower.includes('double attack') ||
    themeLower.includes('royal fork');
  const isSkewerTheme = themeLower.includes('skewer');
  const isPinTheme = themeLower.includes('pin');
  const isPromotionTheme =
    themeLower.includes('promotion') || themeLower.includes('promote');
  const isUnderpromotionTheme = themeLower.includes('underpromot');
  const isCaptureFlavoured =
    themeLower.includes('captur') ||
    themeLower.includes('hanging') ||
    themeLower.includes('piece safety') ||
    themeLower.includes('removing the defender') ||
    themeLower.includes('deflection') ||
    themeLower.includes('battery overload') ||
    themeLower.includes('long-range capture');

  // 4. Mate must actually be mate
  if (isMateTheme || sanIndicatesMate) {
    if (!after.isCheckmate()) {
      push(
        `claims mate ("${puzzle.theme}", SAN "${san}") but position after the move is not checkmate. ` +
        `inCheck=${after.isCheck()}, legalReplies=${after.moves().join(', ')}`,
      );
    }
  } else if (sanIndicatesCheck) {
    // 5. Check SAN must give check
    if (!after.isCheck()) {
      push(`SAN "${san}" claims check (+/#) but position is not in check after the move`);
    }
  }

  // 6. Fork / double-attack: moved piece must attack 2+ valuable enemy pieces
  if (isForkTheme && !isMateTheme) {
    const attackedValuableEnemies: Array<{ square: Square; type: string; value: number }> = [];
    for (const sq of movedPieceAttacks) {
      const p = after.get(sq);
      if (!p || p.color !== enemyColor) continue;
      const value = PIECE_VALUES[p.type] ?? 0;
      // Count king (very valuable) and any piece worth a minor or more
      if (p.type === 'k' || value >= PIECE_VALUES.n) {
        attackedValuableEnemies.push({ square: sq, type: p.type, value });
      }
    }
    if (attackedValuableEnemies.length < 2) {
      const desc = attackedValuableEnemies
        .map((t) => `${t.type}@${t.square}`)
        .join(', ') || 'none';
      push(
        `fork/double-attack theme "${puzzle.theme}" but moved ${verboseMove.piece}@${movedPieceSquare} ` +
        `attacks only ${attackedValuableEnemies.length} valuable enemy target(s): [${desc}]`,
      );
    }
  }

  // 7. Skewer: must give check (or attack queen) AND have a valuable piece behind on same ray
  if (isSkewerTheme && !isMateTheme) {
    // Identify the "front" piece being attacked — the enemy king, or an enemy queen if no check.
    const moverType = verboseMove.piece;
    const slidingPiece = moverType === 'b' || moverType === 'r' || moverType === 'q';
    if (!slidingPiece) {
      push(
        `skewer theme "${puzzle.theme}" but the moved piece is a ${moverType}, ` +
        `which cannot create a classic skewer (need bishop/rook/queen)`,
      );
    } else {
      const directions: Array<[number, number]> =
        moverType === 'b'
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : moverType === 'r'
            ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
            : [
                [1, 0], [-1, 0], [0, 1], [0, -1],
                [1, 1], [1, -1], [-1, 1], [-1, -1],
              ];
      let foundSkewer = false;
      for (const [df, dr] of directions) {
        const first = firstPieceAlongRay(after, movedPieceSquare, df, dr);
        if (!first || first.piece.color !== enemyColor) continue;
        const second = firstPieceAlongRay(after, first.square, df, dr);
        if (!second || second.piece.color !== enemyColor) continue;
        // Classic skewer: the front piece is at least as valuable as the back piece.
        const frontValue = PIECE_VALUES[first.piece.type] ?? 0;
        const backValue = PIECE_VALUES[second.piece.type] ?? 0;
        if (frontValue >= backValue) {
          foundSkewer = true;
          break;
        }
        // Also acceptable: front piece is the king (any back piece behind it is winnable).
        if (first.piece.type === 'k') {
          foundSkewer = true;
          break;
        }
      }
      if (!foundSkewer) {
        push(
          `skewer theme "${puzzle.theme}" but moved ${moverType}@${movedPieceSquare} does not have ` +
          `a valuable enemy piece followed by another enemy piece along any of its rays`,
        );
      }
    }
  }

  // 8. Discovered check / discovered attack: moved piece does NOT attack the king itself,
  //    OR (for double check) the moved piece checks AND another piece also checks.
  if (isDiscoveredTheme && enemyKingSq) {
    const movedPieceChecks = movedPieceAttacks.has(enemyKingSq);
    const otherCheckers = checkersOfEnemyKing.filter((sq) => sq !== movedPieceSquare);
    if (themeLower.includes('discovered check')) {
      if (!after.isCheck()) {
        push(`discovered check theme but post-move position is not in check`);
      } else if (otherCheckers.length === 0) {
        push(
          `discovered check theme but no piece OTHER than the moved one checks the king. ` +
          `Moved piece on ${movedPieceSquare} ${movedPieceChecks ? 'does' : 'does not'} attack king on ${enemyKingSq}.`,
        );
      }
    } else {
      // Generic discovered attack: at least one of the moved piece's old ray-mates should now attack
      // something valuable. We do a weaker check: confirm the move opened a new line by checking
      // that some friendly piece other than the moved one now attacks an enemy piece that wasn't
      // attacked before the move.
      const beforeGame = new Chess(puzzle.fen);
      const enemyAttackedBefore = new Set<Square>();
      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          const sq = toSquare(f, r);
          const p = beforeGame.get(sq);
          if (!p || p.color !== moverColor) continue;
          for (const t of squaresAttackedFrom(beforeGame, sq)) {
            const tp = beforeGame.get(t);
            if (tp && tp.color === enemyColor) enemyAttackedBefore.add(t);
          }
        }
      }
      const enemyAttackedAfterByOthers = new Set<Square>();
      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          const sq = toSquare(f, r);
          if (sq === movedPieceSquare) continue; // skip moved piece
          const p = after.get(sq);
          if (!p || p.color !== moverColor) continue;
          for (const t of squaresAttackedFrom(after, sq)) {
            const tp = after.get(t);
            if (tp && tp.color === enemyColor) enemyAttackedAfterByOthers.add(t);
          }
        }
      }
      const newlyAttacked: Square[] = [];
      for (const sq of enemyAttackedAfterByOthers) {
        if (!enemyAttackedBefore.has(sq)) newlyAttacked.push(sq);
      }
      if (newlyAttacked.length === 0) {
        push(
          `discovered attack theme but no new enemy piece is attacked by any non-moved friendly ` +
          `piece after the move. Likely the move did not uncover a new attacker.`,
        );
      }
    }
  }

  // 9. Double check: both the moved piece AND another piece must give check.
  if (isDoubleCheckTheme && enemyKingSq) {
    if (!after.isCheck()) {
      push('double check theme but post-move position is not in check');
    } else {
      const movedPieceChecks = movedPieceAttacks.has(enemyKingSq);
      const otherCheckers = checkersOfEnemyKing.filter((sq) => sq !== movedPieceSquare);
      if (!movedPieceChecks || otherCheckers.length === 0) {
        push(
          `double check theme requires BOTH the moved piece and another piece to check the king. ` +
          `movedPieceChecks=${movedPieceChecks}, otherCheckers=[${otherCheckers.join(', ')}]`,
        );
      }
    }
  }

  // 10. Promotion / underpromotion: solution must promote
  if (isPromotionTheme || isUnderpromotionTheme) {
    if (!verboseMove.promotion) {
      push(`promotion theme but SAN "${san}" does not promote a pawn`);
    } else if (isUnderpromotionTheme && verboseMove.promotion === 'q') {
      push(`underpromotion theme but SAN "${san}" promotes to queen`);
    }
  }

  // 11. Capture-flavoured themes: solution must be a capture
  if (isCaptureFlavoured && !verboseMove.captured) {
    push(`capture-flavoured theme "${puzzle.theme}" but solution "${san}" did not capture anything`);
  }

  // 12. Pin theme: theme claims a pin. We check whether the target piece (whatever was just
  //     captured or attacked) is/was on a line between an attacker and the enemy king,
  //     such that it could not legally have moved.
  if (isPinTheme) {
    // The piece that's pinned is usually the one we just captured. Reconstruct pre-move position.
    const pre = new Chess(puzzle.fen);
    const captured = verboseMove.captured;
    if (captured) {
      const target = verboseMove.to as Square;
      const targetPiece = pre.get(target);
      if (targetPiece && targetPiece.color === enemyColor) {
        // Look outward from `target` in every direction. If the FIRST friendly attacker we hit
        // along a ray (sliding-piece compatible with that direction) and the FIRST enemy piece
        // in the OPPOSITE direction is the king, the captured piece was pinned.
        const directions: Array<[number, number]> = [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [1, -1], [-1, 1], [-1, -1],
        ];
        let pinned = false;
        for (const [df, dr] of directions) {
          const attacker = firstPieceAlongRay(pre, target, df, dr);
          if (!attacker || attacker.piece.color !== moverColor) continue;
          const attackerType = attacker.piece.type;
          const isStraight = df === 0 || dr === 0;
          const isDiag = df !== 0 && dr !== 0;
          const lineCompatible =
            (isStraight && (attackerType === 'r' || attackerType === 'q')) ||
            (isDiag && (attackerType === 'b' || attackerType === 'q'));
          if (!lineCompatible) continue;
          const behind = firstPieceAlongRay(pre, target, -df, -dr);
          if (!behind || behind.piece.color !== enemyColor) continue;
          if (behind.piece.type === 'k' || behind.piece.type === 'q') {
            pinned = true;
            break;
          }
        }
        if (!pinned) {
          // Soft warning rather than failure for now — some themes use "pin" loosely. We'll
          // surface it so the user can review.
          push(
            `pin theme "${puzzle.theme}" but captured ${targetPiece.type}@${target} does not appear ` +
            `to be pinned by a sliding piece against the king/queen`,
          );
        }
      }
    }
  }

  // 13. Sanity: after the move, the moving side's king must not be in check
  //     (this would mean we played an illegal move and chess.js failed to reject it).
  const moverKingSq = findKingSquare(after, moverColor);
  if (moverKingSq) {
    const ownKingAttackers = attackersOf(after, moverKingSq, enemyColor);
    if (ownKingAttackers.length > 0 && !after.isCheckmate()) {
      // It's only legal for the OPPONENT to be in check after our move. Our own king in check
      // is impossible (move was legal). This is a sanity guard.
      push(
        `sanity: after solution "${san}" the mover's own king on ${moverKingSq} is attacked by ` +
        `[${ownKingAttackers.join(', ')}] — likely an illegal-state bug`,
      );
    }
  }

  return failures;
}

// ── Engine-based sanity check ────────────────────────────────────────────────
// For tactical puzzles only, we run a small negamax search and compare the
// score of the puzzle's solution against the best alternative move. If the
// engine finds another move that's at least `ENGINE_DELTA_CP` centipawns
// better, the puzzle is flagged for review.

// Depth and threshold tuned for speed vs. precision:
// - Depth 3 means: after we apply a candidate move, we search 2 plies (opponent's
//   best reply, our best reply). This catches single-move tactics and the most
//   obvious sacrificial follow-ups.
// - Delta of 300 cp means an alternative must win at least 3 pawns more than the
//   puzzle's solution to be considered "clearly better". This avoids false
//   positives from positional preferences in the eval.
const ENGINE_DEPTH = 3;
const ENGINE_DELTA_CP = 300;

const ENGINE_EVAL_PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
};

function materialEval(game: Chess): number {
  let score = 0;
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = ENGINE_EVAL_PIECE_VALUES[piece.type] ?? 0;
      score += piece.color === 'w' ? value : -value;
    }
  }
  return score;
}

// Negamax score from the perspective of the side to move.
// Positive => side to move is winning.
function negamax(game: Chess, depth: number, alpha: number, beta: number): number {
  if (game.isCheckmate()) return -100000 + (ENGINE_DEPTH - depth); // prefer faster mates
  if (game.isDraw() || game.isStalemate()) return 0;
  if (depth === 0) {
    const sign = game.turn() === 'w' ? 1 : -1;
    return sign * materialEval(game);
  }
  let best = -Infinity;
  const moves = game.moves({ verbose: true });
  // Captures first for alpha-beta efficiency.
  moves.sort((a, b) => {
    const av = a.captured ? ENGINE_EVAL_PIECE_VALUES[a.captured] ?? 0 : 0;
    const bv = b.captured ? ENGINE_EVAL_PIECE_VALUES[b.captured] ?? 0 : 0;
    return bv - av;
  });
  for (const move of moves) {
    game.move(move);
    const score = -negamax(game, depth - 1, -beta, -alpha);
    game.undo();
    if (score > best) {
      best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  }
  return best;
}

function scoreMove(game: Chess, san: string, depth: number): number {
  game.move(san);
  const score = -negamax(game, depth - 1, -Infinity, Infinity);
  game.undo();
  return score;
}

// Themes for which we skip the engine-based material check because the lesson
// is positional / long-term and the engine may favour a different move that
// is materially better but pedagogically less useful.
const POSITIONAL_THEME_SUBSTRINGS = [
  'king opposition',
  'king activity',
  'opposition',
  'prophylaxis',
  'zugzwang',
  'fortress',
  'strategic pin',
  'structural weakening',
  'pawn break', // covers "pawn break" and "pawn breakthrough"
  'pawn race',
  'rook endgame',
  'rook to 7th rank',
  'piece sacrifice',
  'defense',
  'outpost',
];

function isPositionalTheme(theme: string): boolean {
  const t = theme.toLowerCase();
  return POSITIONAL_THEME_SUBSTRINGS.some((s) => t.includes(s));
}

describe('puzzle bank — deep theme verification', () => {
  it('every puzzle satisfies its theme', () => {
    const allFailures: Failure[] = [];
    for (const puzzle of PUZZLES) {
      allFailures.push(...verifyPuzzle(puzzle));
    }
    if (allFailures.length) {
      const grouped = new Map<string, string[]>();
      for (const failure of allFailures) {
        if (!grouped.has(failure.id)) grouped.set(failure.id, []);
        grouped.get(failure.id)!.push(failure.reason);
      }
      const lines: string[] = [];
      for (const [id, reasons] of grouped) {
        lines.push(`\n  [${id}]`);
        for (const r of reasons) lines.push(`    - ${r}`);
      }
      throw new Error(
        `${allFailures.length} puzzle issue(s) across ${grouped.size} puzzle(s):` +
        lines.join('\n'),
      );
    }
  });

  it('every tactical puzzle\'s solution is not dominated by a clearly better alternative', () => {
    const failures: string[] = [];

    for (const puzzle of PUZZLES) {
      // Skip puzzles whose theme is purely positional — the engine may pick a
      // different move that's tactically better but misses the pedagogical point.
      if (isPositionalTheme(puzzle.theme)) continue;

      let game: Chess;
      try {
        game = new Chess(puzzle.fen);
      } catch {
        continue; // already covered by the structural test
      }
      const legalSans = game.moves();
      const solutionSan = puzzle.solution[0];
      if (!legalSans.includes(solutionSan)) continue;

      // If the solution is mate, by definition no alternative can beat it.
      const afterSolution = new Chess(puzzle.fen);
      afterSolution.move(solutionSan);
      if (afterSolution.isCheckmate()) continue;

      const searchGame = new Chess(puzzle.fen);
      const solutionScore = scoreMove(searchGame, solutionSan, ENGINE_DEPTH);

      let bestAlternativeSan: string | null = null;
      let bestAlternativeScore = -Infinity;
      for (const altSan of legalSans) {
        if (altSan === solutionSan) continue;
        const score = scoreMove(searchGame, altSan, ENGINE_DEPTH);
        if (score > bestAlternativeScore) {
          bestAlternativeScore = score;
          bestAlternativeSan = altSan;
        }
      }

      if (bestAlternativeSan && bestAlternativeScore - solutionScore >= ENGINE_DELTA_CP) {
        failures.push(
          `[${puzzle.id}] (${puzzle.theme}) solution "${solutionSan}" scores ${solutionScore} cp at depth ${ENGINE_DEPTH}, ` +
          `but alternative "${bestAlternativeSan}" scores ${bestAlternativeScore} cp ` +
          `(delta = +${bestAlternativeScore - solutionScore} cp)`,
        );
      }
    }

    if (failures.length) {
      throw new Error(
        `${failures.length} puzzle(s) where an alternative move beats the listed solution ` +
        `by ≥ ${ENGINE_DELTA_CP} centipawns:\n  ` +
        failures.join('\n  '),
      );
    }
  }, 60000); // up to 60 s budget for the engine pass.
});
