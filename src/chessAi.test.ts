import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildCoachInstruction, buildDynamicCoachInfo } from './chessAi';
import { getCoach, getDifficulty } from './coachConfig';

describe('coach prompting helpers', () => {
  it('includes difficulty curriculum and first-person rules in dynamic info', () => {
    const game = new Chess();
    const coach = getCoach('leila');
    const difficulty = getDifficulty('intermediate');
    const info = buildDynamicCoachInfo(game, null, null, coach, difficulty);

    expect(info).toContain('Student level: Intermediate');
    expect(info).toContain(difficulty.curriculum);
    expect(info).toContain('speak in first person');
    expect(info).toContain('Do not say "the player", "they", or "the coach"');
  });

  it('builds class-style move instructions for the selected level', () => {
    const instruction = buildCoachInstruction(getCoach('sofia'), getDifficulty('advanced'), 'move');

    expect(instruction).toContain('I am Sofia');
    expect(instruction).toContain('Current student level: Advanced');
    expect(instruction).toContain('Reference at least one concrete chess concept');
    expect(instruction).toContain('I must not say "the player"');
  });
});
