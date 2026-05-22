import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES, puzzleScore } from './puzzles';

describe('puzzle bank', () => {
  it('has legal first moves for every solution', () => {
    for (const puzzle of PUZZLES) {
      const game = new Chess(puzzle.fen);
      const legalSans = game.moves();
      expect(legalSans, `puzzle ${puzzle.id} solution must be legal`).toContain(puzzle.solution[0]);
    }
  });

  it('side-to-move in FEN matches puzzle.sideToMove', () => {
    for (const puzzle of PUZZLES) {
      const game = new Chess(puzzle.fen);
      expect(game.turn(), `puzzle ${puzzle.id} side-to-move mismatch`).toBe(puzzle.sideToMove);
    }
  });

  it('has three hints, a position summary, and a non-empty explanation per puzzle', () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.hints.length, `puzzle ${puzzle.id} hint count`).toBe(3);
      for (const hint of puzzle.hints) {
        expect(hint.trim().length, `puzzle ${puzzle.id} hint must be non-empty`).toBeGreaterThan(0);
      }
      expect(
        puzzle.positionSummary.trim().length,
        `puzzle ${puzzle.id} positionSummary must be non-empty`,
      ).toBeGreaterThan(40);
      expect(puzzle.explanation.trim().length, `puzzle ${puzzle.id} explanation must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('has exactly five puzzles per difficulty', () => {
    const difficulties = ['new', 'beginner', 'intermediate', 'advanced', 'expert'] as const;
    for (const difficulty of difficulties) {
      const count = PUZZLES.filter((puzzle) => puzzle.difficultyId === difficulty).length;
      expect(count, `${difficulty} should have 5 puzzles`).toBe(5);
    }
    expect(PUZZLES.length).toBe(25);
  });

  it('has unique puzzle ids', () => {
    const ids = PUZZLES.map((puzzle) => puzzle.id);
    const unique = new Set(ids);
    expect(unique.size, 'duplicate puzzle ids detected').toBe(ids.length);
  });

  it('scores solved puzzles by hint count', () => {
    expect(puzzleScore(0, true)).toBe(100);
    expect(puzzleScore(1, true)).toBe(60);
    expect(puzzleScore(2, true)).toBe(30);
    expect(puzzleScore(3, true)).toBe(10);
    expect(puzzleScore(0, false)).toBe(0);
  });
});
