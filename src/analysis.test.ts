import { describe, expect, it } from 'vitest';
import { analyzeGame, identifyOpening, type EvalProvider } from './analysis';
import type { MoveSnapshot } from './storage';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('analysis helpers', () => {
  it('identifies common openings from SAN prefixes', () => {
    expect(identifyOpening(['e4', 'c5', 'Nf3'])).toBe('Sicilian Defense');
    expect(identifyOpening(['d4', 'd5', 'c4'])).toBe("Queen's Gambit");
  });

  it('falls back for unknown openings', () => {
    expect(identifyOpening(['h4', 'a5'])).toBe('Unclassified opening');
  });
});

// Build a white move snapshot whose positions are tagged so a stub eval provider
// can look them up. `cpBefore`/`cpAfter` are white-relative centipawns, and
// `best` marks whether the player matched the engine's top move.
function whiteMove(
  index: number,
  san: string,
  cpBefore: number,
  cpAfter: number,
  best: boolean,
): { snapshot: MoveSnapshot; cpBefore: number; cpAfter: number; bestSan: string } {
  const fenBefore = `before-${index}`;
  const fenAfter = `after-${index}`;
  return {
    snapshot: {
      san,
      from: 'a1',
      to: 'a2',
      piece: 'p',
      color: 'w',
      by: 'You',
      fenBefore,
      fenAfter,
    },
    cpBefore,
    cpAfter,
    bestSan: best ? san : 'Zz9', // a SAN the player could never have played
  };
}

function providerFor(entries: ReturnType<typeof whiteMove>[]): EvalProvider {
  const byFen = new Map<string, { bestSan: string | null; whiteCp: number }>();
  for (const entry of entries) {
    byFen.set(entry.snapshot.fenBefore, { bestSan: entry.bestSan, whiteCp: entry.cpBefore });
    byFen.set(entry.snapshot.fenAfter, { bestSan: null, whiteCp: entry.cpAfter });
  }
  return async (fen: string) => byFen.get(fen) ?? null;
}

describe('analyzeGame accuracy model', () => {
  it('scores a clean game near the top of the range', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => whiteMove(i, 'e4', 30, 30, true));
    const moves = entries.map((e) => e.snapshot);
    const summary = await analyzeGame(moves, START_FEN, providerFor(entries));

    expect(summary.whiteAccuracy).toBeGreaterThanOrEqual(95);
    expect(summary.blunders).toBe(0);
    expect(summary.mistakes).toBe(0);
    expect(summary.inaccuracies).toBe(0);
  });

  it('does not reward a game full of blunders with a high score', async () => {
    // 4 good moves, 3 mistakes (~18% win drop), 3 blunders (~42% win drop).
    const entries = [
      whiteMove(0, 'e4', 30, 30, true),
      whiteMove(1, 'Nf3', 30, 30, true),
      whiteMove(2, 'Bc4', 30, 30, true),
      whiteMove(3, 'd3', 30, 30, true),
      whiteMove(4, 'h3', 100, -100, false),
      whiteMove(5, 'a3', 100, -100, false),
      whiteMove(6, 'g4', 100, -100, false),
      whiteMove(7, 'Qh5', 200, -300, false),
      whiteMove(8, 'Bxf7', 200, -300, false),
      whiteMove(9, 'Ng5', 200, -300, false),
    ];
    const moves = entries.map((e) => e.snapshot);
    const summary = await analyzeGame(moves, START_FEN, providerFor(entries));

    expect(summary.blunders).toBe(3);
    expect(summary.mistakes).toBe(3);
    expect(summary.whiteAccuracy).toBeLessThan(70);
  });
});
