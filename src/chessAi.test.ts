import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { analyzeCoachMoveContext, buildCoachInstruction, buildDynamicCoachInfo, shouldCoachSpeakForMove } from './chessAi';
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
    expect(info).toContain('Current board FEN');
    expect(info).toContain('Recent move history');
    expect(info).toContain('Position facts');
  });

  it('builds class-style move instructions for the selected level', () => {
    const instruction = buildCoachInstruction(getCoach('sofia'), getDifficulty('advanced'), 'move');

    expect(instruction).toContain('I am Sofia');
    expect(instruction).toContain('Current student level: Advanced');
    expect(instruction).toContain('Reference at least one concrete chess concept');
    expect(instruction).toContain('I must not say "the player"');
  });

  it('uses difficulty when deciding whether a normal opening move deserves speech', () => {
    const game = new Chess();
    const move = game.move('e4');

    expect(shouldCoachSpeakForMove(game, null, move, getDifficulty('new'))).toMatchObject({
      shouldSpeak: true,
      reason: 'center-control',
    });
    expect(shouldCoachSpeakForMove(game, null, move, getDifficulty('beginner'))).toMatchObject({
      shouldSpeak: false,
      reason: 'routine',
    });
    expect(shouldCoachSpeakForMove(game, null, move, getDifficulty('advanced'))).toMatchObject({
      shouldSpeak: false,
      reason: 'routine',
    });
  });

  it('does not over-coach ordinary pawn captures at higher levels', () => {
    const game = new Chess();
    game.move('e4');
    game.move('d5');
    const capture = game.move('exd5');

    expect(shouldCoachSpeakForMove(game, null, capture, getDifficulty('beginner'))).toMatchObject({
      shouldSpeak: true,
      reason: 'student-capture',
    });
    expect(shouldCoachSpeakForMove(game, null, capture, getDifficulty('intermediate'))).toMatchObject({
      shouldSpeak: false,
      reason: 'routine',
    });
    expect(shouldCoachSpeakForMove(game, null, capture, getDifficulty('expert'))).toMatchObject({
      shouldSpeak: false,
      reason: 'routine',
    });
  });

  it('flags aggressive pawn pushes on intermediate without prescribing a teaching topic', () => {
    const game = new Chess();
    game.move('e4');
    game.move('Nf6');
    const pawnPush = game.move('f4');
    const context = analyzeCoachMoveContext(game, null, pawnPush, getDifficulty('intermediate'), [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p', by: 'You' },
      { san: 'Nf6', from: 'g8', to: 'f6', piece: 'n', by: 'Leila' },
      { san: 'f4', from: 'f2', to: 'f4', piece: 'p', by: 'You' },
    ]);

    expect(context.shouldSpeak).toBe(true);
    expect(context.reasons).toContain('king-pawn-shield');
    expect(context.facts.join(' ')).toContain('king-side shield');
    expect(context.facts.join(' ')).not.toContain('teach');
  });

  it('keeps dynamic info factual and avoids narration phrasing', () => {
    const game = new Chess();
    const first = game.move('e4');
    game.move('Nf6');
    const second = game.move('f4');
    const info = buildDynamicCoachInfo(
      game,
      null,
      second,
      getCoach('leila'),
      getDifficulty('intermediate'),
      [
        { san: first.san, from: first.from, to: first.to, piece: first.piece, by: 'You' },
        { san: 'Nf6', from: 'g8', to: 'f6', piece: 'n', by: 'Leila' },
        { san: second.san, from: second.from, to: second.to, piece: second.piece, by: 'You' },
      ],
    );

    expect(info).toContain('Position facts');
    expect(info).toContain('F 2');
    expect(info).toContain('F 4');
    expect(info).not.toContain('you just moved');
    expect(info).not.toContain('I will move');
    expect(info).not.toContain('Your last move');
  });

  it('attributes a student capture to the student and the lost piece to the coach', () => {
    // Position where White can play Bxd5, capturing Black's d5 pawn.
    const game = new Chess();
    game.move('e4');
    game.move('d5');
    game.move('Bc4');
    game.move('a6');
    const studentCapture = game.move('Bxd5'); // bishop takes pawn (stand-in for "bishop takes queen")
    expect(studentCapture).toBeTruthy();

    const info = buildDynamicCoachInfo(
      game,
      null,
      studentCapture,
      getCoach('leila'),
      getDifficulty('intermediate'),
    );

    // The capturing piece belongs to the student; the captured piece belongs to the coach.
    expect(info).toContain("the student's bishop");
    expect(info).toContain('capturing my pawn');
    // The inverted phrasing the LLM was hallucinating must NOT appear.
    expect(info).not.toContain('my bishop');
    expect(info).not.toContain("the student's pawn"); // because in this position only the bishop is the student's
    // The role-context guard rail must be present.
    expect(info).toContain('I must never invert this');
  });

  it('attributes a coach capture to the coach and the lost piece to the student', () => {
    // Build a position where Black plays a recapture (coach captures student's piece).
    const game = new Chess();
    game.move('e4');
    game.move('d5');
    const coachCapture = game.move('exd5'); // White move, but we use opposite-color move below
    expect(coachCapture).toBeTruthy();

    // Now Black recaptures: Black plays Qxd5 — this is the coach (Black) capturing.
    const coachRecapture = game.move('Qxd5');
    expect(coachRecapture).toBeTruthy();

    const info = buildDynamicCoachInfo(
      game,
      null,
      coachRecapture,
      getCoach('leila'),
      getDifficulty('intermediate'),
    );

    // The capturing piece belongs to the coach (me); the captured piece belongs to the student.
    expect(info).toContain('my queen');
    expect(info).toContain("capturing the student's pawn");
  });
});
