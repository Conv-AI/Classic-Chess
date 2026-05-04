import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES, puzzleScore } from './puzzles';

describe('puzzle bank', () => {
  it('has legal first moves for every solution', () => {
    for (const puzzle of PUZZLES) {
      const game = new Chess(puzzle.fen);
      const legalSans = game.moves();
      expect(legalSans).toContain(puzzle.solution[0]);
    }
  });

  it('scores solved puzzles by hint count', () => {
    expect(puzzleScore(0, true)).toBe(100);
    expect(puzzleScore(1, true)).toBe(60);
    expect(puzzleScore(2, true)).toBe(30);
    expect(puzzleScore(3, true)).toBe(10);
    expect(puzzleScore(0, false)).toBe(0);
  });
});
