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

export type BestMoveProvider = (fen: string) => Promise<string | null>;

export async function analyzeGame(
  moves: MoveSnapshot[],
  finalFen: string,
  bestMoveProvider: BestMoveProvider,
): Promise<AnalysisSummary> {
  const opening = identifyOpening(moves.map((move) => move.san));
  const userMoves = moves.filter((move) => move.color === 'w');
  const sample = userMoves.slice(0, 18);
  let matches = 0;
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;
  const keyMoments: KeyMoment[] = [];

  for (const move of sample) {
    const best = await bestMoveProvider(move.fenBefore);
    if (!best) continue;
    if (normalizeSan(best) === normalizeSan(move.san)) {
      matches++;
      continue;
    }

    const label = classifyMove(move, best);
    if (label === 'Blunder') blunders++;
    else if (label === 'Mistake') mistakes++;
    else inaccuracies++;

    if (keyMoments.length < 5) {
      keyMoments.push({
        moveNumber: Math.ceil((moves.indexOf(move) + 1) / 2),
        label,
        description: describeMoment(move, best, label),
        bestMove: best,
      });
    }
  }

  const reviewed = Math.max(1, sample.length);
  const whiteAccuracy = clampAccuracy(Math.round(100 - ((inaccuracies * 8 + mistakes * 16 + blunders * 28) / reviewed)));
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

function classifyMove(move: MoveSnapshot, best: string): 'Inaccuracy' | 'Mistake' | 'Blunder' {
  if (move.captured && !best.includes('x')) return 'Mistake';
  if (/^[KQRBN]?x/.test(best) && !move.san.includes('x')) return 'Mistake';
  if (best.includes('#')) return 'Blunder';
  if (best.includes('+') && !move.san.includes('+')) return 'Mistake';
  return 'Inaccuracy';
}

function describeMoment(move: MoveSnapshot, best: string, label: string): string {
  if (label === 'Blunder') return `${move.san} missed a forcing continuation. Stockfish preferred ${best}.`;
  if (label === 'Mistake') return `${move.san} gave up a clearer chance. A stronger candidate was ${best}.`;
  return `${move.san} was playable, but ${best} kept more pressure.`;
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
  return Math.max(35, Math.min(99, value));
}
