import { Chess } from 'chess.js';
import type { MoveSnapshot, AnalysisSummary, KeyMoment } from './storage';

const OPENINGS: Array<{ prefix: string[]; name: string }> = [
  { prefix: ['e4', 'c5'], name: 'Sicilian Defense' },
  { prefix: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Ruy Lopez' },
  { prefix: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Italian Game' },
  { prefix: ['d4', 'Nf6', 'c4', 'g6'], name: "King's Indian Defense" },
  { prefix: ['d4', 'd5', 'c4'], name: "Queen's Gambit" },
  { prefix: ['e4', 'e6'], name: 'French Defense' },
  { prefix: ['e4', 'c6'], name: 'Caro-Kann Defense' },
];

export type PositionEval = {
  // The engine's preferred move in SAN, used to spot when the player matched it.
  bestSan: string | null;
  // White-relative centipawn evaluation (positive favors White).
  whiteCp: number;
};

export type EvalProvider = (fen: string) => Promise<PositionEval | null>;

type MoveLabel = 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export async function analyzeGame(
  moves: MoveSnapshot[],
  finalFen: string,
  evalProvider: EvalProvider,
): Promise<AnalysisSummary> {
  const opening = identifyOpening(moves.map((move) => move.san));
  const userMoves = moves.filter((move) => move.color === 'w');
  const sample = userMoves.slice(0, 20);
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;
  const accuracies: number[] = [];
  const keyMoments: KeyMoment[] = [];

  for (const move of sample) {
    const before = await evalProvider(move.fenBefore);
    if (!before) continue;

    const playedBest = before.bestSan ? normalizeSan(before.bestSan) === normalizeSan(move.san) : false;
    // If the player chose the engine's move, the position holds its value. Otherwise
    // evaluate the position the player actually reached to measure what they gave up.
    let whiteCpAfter = before.whiteCp;
    if (!playedBest) {
      const after = await evalProvider(move.fenAfter);
      if (after) whiteCpAfter = after.whiteCp;
    }

    // Accuracy is driven by how far the move dropped White's winning chances.
    const winBefore = winPercent(before.whiteCp);
    const winAfter = winPercent(whiteCpAfter);
    const winDrop = Math.max(0, winBefore - winAfter);
    accuracies.push(moveAccuracy(winDrop));

    const label = playedBest ? 'Good' : classifyByWinDrop(winDrop);
    if (label === 'Blunder') blunders++;
    else if (label === 'Mistake') mistakes++;
    else if (label === 'Inaccuracy') inaccuracies++;

    if (label !== 'Good' && keyMoments.length < 5) {
      keyMoments.push({
        moveNumber: Math.ceil((moves.indexOf(move) + 1) / 2),
        label,
        description: describeMoment(move, before.bestSan, label),
        bestMove: before.bestSan ?? undefined,
      });
    }
  }

  const whiteAccuracy = accuracies.length
    ? clampAccuracy(Math.round(overallAccuracy(accuracies)))
    : 75;
  const blackAccuracy = estimateBlackAccuracy(moves, finalFen);

  return {
    opening,
    whiteAccuracy,
    blackAccuracy,
    inaccuracies,
    mistakes,
    blunders,
    keyMoments: keyMoments.length ? keyMoments : fallbackMoments(moves),
    tips: buildTips({ inaccuracies, mistakes, blunders }, moves),
  };
}

// Convert a white-relative centipawn score to White's expected win percentage
// (0-100). This is the logistic model used by Lichess/chess.com accuracy.
function winPercent(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

// Per-move accuracy (0-100) as a function of the win-percentage lost by the move.
function moveAccuracy(winDrop: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * winDrop) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

// Blend the arithmetic mean with the harmonic mean so that a few bad moves pull
// the overall score down meaningfully instead of being averaged away.
function overallAccuracy(accs: number[]): number {
  const mean = accs.reduce((sum, a) => sum + a, 0) / accs.length;
  const harmonic = accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(1, a), 0);
  return (mean + harmonic) / 2;
}

function classifyByWinDrop(winDrop: number): MoveLabel {
  if (winDrop >= 30) return 'Blunder';
  if (winDrop >= 15) return 'Mistake';
  if (winDrop >= 8) return 'Inaccuracy';
  return 'Good';
}

export function identifyOpening(sans: string[]): string {
  for (const opening of OPENINGS) {
    if (opening.prefix.every((san, index) => normalizeSan(sans[index] ?? '') === normalizeSan(san))) {
      return opening.name;
    }
  }
  return 'Unclassified opening';
}

function normalizeSan(san: string): string {
  return san.replace(/[+#?!]/g, '');
}

function describeMoment(move: MoveSnapshot, best: string | null, label: string): string {
  const betterClause = best ? ` Stockfish preferred ${best}.` : '';
  const candidateClause = best ? ` A stronger candidate was ${best}.` : '';
  const pressureClause = best ? ` ${best} kept more pressure.` : '';
  if (label === 'Blunder') return `${move.san} dropped a large chunk of your advantage.${betterClause}`;
  if (label === 'Mistake') return `${move.san} gave up a clearer chance.${candidateClause}`;
  return `${move.san} was playable, but${pressureClause || ' there was more to be had.'}`;
}

function fallbackMoments(moves: MoveSnapshot[]): KeyMoment[] {
  return moves.slice(Math.max(0, moves.length - 3)).map((move, index) => ({
    moveNumber: Math.ceil((moves.length - 2 + index) / 2),
    label: 'Review',
    description: `${move.by} played ${move.san}. Replay this moment and check piece safety before moving on.`,
  }));
}

function buildTips(
  counts: { inaccuracies: number; mistakes: number; blunders: number },
  moves: MoveSnapshot[],
): string[] {
  const tips: string[] = [];
  const capturesMissed = counts.mistakes + counts.blunders;
  if (capturesMissed > 0) tips.push('Before each move, scan for checks, captures, and direct threats.');
  if (moves.some((move) => move.piece === 'q' && moves.indexOf(move) < 10)) {
    tips.push('Delay early queen adventures unless they win something concrete.');
  }
  if (moves.filter((move) => move.color === 'w' && move.piece === 'p').length > 6) {
    tips.push('After opening the center, develop pieces before making extra pawn moves.');
  }
  if (tips.length < 2) tips.push('Keep asking what your least active piece should do next.');
  if (tips.length < 3) tips.push('Use the hint button when the position has checks or loose pieces.');
  return tips.slice(0, 3);
}

function estimateBlackAccuracy(moves: MoveSnapshot[], finalFen: string): number {
  const game = new Chess(finalFen);
  if (game.isCheckmate() && game.turn() === 'w') return 88;
  const blackCaptures = moves.filter((move) => move.color === 'b' && move.captured).length;
  return clampAccuracy(76 + Math.min(14, blackCaptures * 3));
}

function clampAccuracy(value: number): number {
  return Math.max(15, Math.min(99, value));
}
