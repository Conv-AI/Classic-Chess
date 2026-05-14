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

export type CoachSpeechDecision = {
  shouldSpeak: boolean;
  reason: string;
  facts: string[];
  phase: 'opening' | 'middlegame' | 'endgame';
};

type MoveHistoryEntry = { san: string; from: string; to: string; piece: string; captured?: string; by: string };

type MoveContext = CoachSpeechDecision & {
  reasons: string[];
  moveNumber: number;
};

export function analyzeCoachMoveContext(
  game: Chess,
  plannedMove?: Move | null,
  lastMove?: Move | null,
  difficulty?: Pick<DifficultyConfig, 'id'>,
  moveHistory: MoveHistoryEntry[] = [],
): MoveContext {
  const difficultyId = difficulty?.id ?? 'intermediate';
  const isNewLevel = difficultyId === 'new';
  const isBeginnerLevel = difficultyId === 'beginner';
  const isIntermediateLevel = difficultyId === 'intermediate';
  const isAdvancedLevel = difficultyId === 'advanced';
  const isExpertLevel = difficultyId === 'expert';
  const moveNo = moveNumber(game);
  const phase = gamePhase(game);
  const facts: string[] = [
    `Game phase: ${phase}, move number ${moveNo}.`,
  ];
  const reasons: string[] = [];

  if (!lastMove) return makeDecision(false, 'no-last-move', facts, reasons, moveNo, phase);

  const before = gameFromFen(lastMove.before);
  const ownership = moveOwnership(lastMove.color);
  const sideToMoveOwnership = ownership.opponent;
  const capturedValue = lastMove.captured ? PIECE_VALUES[lastMove.captured] ?? 0 : 0;
  const plannedCaptureValue = plannedMove?.captured ? PIECE_VALUES[plannedMove.captured] ?? 0 : 0;
  const materialDelta = before ? materialDeltaForMove(before, game, lastMove.color) : capturedValue;
  const forcing = forcingSummary(game);
  const capturable = capturablePiecesForSideToMove(game);
  const movedPiece = game.get(lastMove.to as Square);
  const attacksMovedPiece = capturable.some((item) => item.square === lastMove.to);
  const repeatedPiece = isRepeatedPieceMove(lastMove, moveHistory);
  const pawnInfo = pawnMoveInfo(game, lastMove, moveHistory);
  const kingInfo = kingSafetyInfo(game, lastMove);

  const captureClause = lastMove.captured
    ? ` and captured ${ownership.opponentPossessive} ${pieceName(lastMove.captured)}`
    : '';
  facts.push(`Last move facts: ${ownership.moverPhrase} moved ${ownership.moverPossessive} ${pieceName(lastMove.piece)} from ${formatSquare(lastMove.from)} to ${formatSquare(lastMove.to)}${captureClause}.`);
  if (Math.abs(materialDelta) >= PIECE_VALUES.p) {
    facts.push(`Material swing from the last move for ${ownership.moverPhrase}: ${materialDelta > 0 ? '+' : ''}${materialDelta} centipawns.`);
  }
  if (lastMove.san.includes('+') || lastMove.san.includes('#')) facts.push('The last move gave check or checkmate.');
  if (lastMove.promotion) facts.push(`The last move promoted a pawn to a ${pieceName(lastMove.promotion)}.`);
  if (forcing.checks || forcing.captures || forcing.promotions) {
    facts.push(`${sideToMoveOwnership.moverPhrase} (side to move) has ${forcing.checks} checking moves, ${forcing.captures} captures, and ${forcing.promotions} promotions available.`);
  }
  if (capturable.length) {
    facts.push(`${ownership.opponentPossessive} pieces currently capturable by ${sideToMoveOwnership.moverPhrase}: ${capturable.slice(0, 4).map((item) => `${pieceName(item.piece)} on ${formatSquare(item.square)}`).join(', ')}.`);
  }
  if (movedPiece && attacksMovedPiece) {
    facts.push(`${ownership.moverPossessive} ${pieceName(movedPiece.type)} that just moved to ${formatSquare(lastMove.to)} is now capturable by ${sideToMoveOwnership.moverPhrase}.`);
  }
  if (repeatedPiece) facts.push('The same non-pawn piece appears to have moved again recently.');
  facts.push(...pawnInfo.facts, ...kingInfo.facts);

  if (game.isCheckmate()) reasons.push('checkmate');
  if (game.isDraw()) reasons.push('draw');
  if (game.isCheck()) reasons.push('king-in-check');
  if (lastMove.san.includes('+') || lastMove.san.includes('#')) reasons.push('student-check');
  if (lastMove.promotion) reasons.push('promotion');
  if (plannedMove?.promotion) reasons.push('coach-promotion-available');
  if (plannedMove?.san.includes('+') || plannedMove?.san.includes('#')) reasons.push('coach-check-available');

  if (lastMove.captured) {
    if (isNewLevel || isBeginnerLevel) reasons.push('student-capture');
    else if ((isIntermediateLevel || isAdvancedLevel) && capturedValue >= PIECE_VALUES.n) reasons.push('meaningful-capture');
    else if (isExpertLevel && capturedValue >= PIECE_VALUES.r) reasons.push('major-capture');
  }
  if (plannedMove?.captured) {
    if ((isNewLevel || isBeginnerLevel || isIntermediateLevel) && plannedCaptureValue >= PIECE_VALUES.n) reasons.push('coach-capture-available');
    else if ((isAdvancedLevel || isExpertLevel) && plannedCaptureValue >= PIECE_VALUES.r) reasons.push('major-coach-capture-available');
  }

  const highestCapturableValue = Math.max(0, ...capturable.map((item) => PIECE_VALUES[item.piece] ?? 0));
  if (highestCapturableValue >= PIECE_VALUES.q) reasons.push('queen-loose');
  else if (highestCapturableValue >= PIECE_VALUES.r && !isExpertLevel) reasons.push('rook-loose');
  else if (highestCapturableValue >= PIECE_VALUES.b && (isNewLevel || isBeginnerLevel || isIntermediateLevel)) reasons.push('minor-piece-loose');
  if (movedPiece && attacksMovedPiece && PIECE_VALUES[movedPiece.type] >= PIECE_VALUES.b) reasons.push('moved-piece-capturable');

  if (pawnInfo.kingShieldMoved) reasons.push('king-pawn-shield');
  if (pawnInfo.aggressivePush && !isExpertLevel) reasons.push('aggressive-pawn-push');
  if (pawnInfo.tooManyPawnMoves && (isNewLevel || isBeginnerLevel || isIntermediateLevel)) reasons.push('too-many-pawn-moves');
  if (pawnInfo.openedKingFile && !isExpertLevel) reasons.push('opened-king-file');
  if (kingInfo.unCastledWithCenterOpen && (isBeginnerLevel || isIntermediateLevel || isAdvancedLevel)) reasons.push('uncastled-open-center');

  if (repeatedPiece && (isNewLevel || isBeginnerLevel || isIntermediateLevel)) reasons.push('repeated-piece-move');
  if (lastMove.piece === 'q' && moveNo <= 6 && !isExpertLevel) reasons.push('early-queen-move');
  if (lastMove.piece === 'k' && (lastMove.san === 'O-O' || lastMove.san === 'O-O-O') && (isNewLevel || isBeginnerLevel)) reasons.push('castling');
  if (isNewLevel && moveNo <= 5 && (lastMove.piece === 'n' || lastMove.piece === 'b') && !lastMove.from.endsWith('1')) reasons.push('opening-development');
  if (isNewLevel && moveNo <= 5 && lastMove.piece === 'p' && CENTER_SQUARES.has(lastMove.to)) reasons.push('center-control');

  const shouldSpeak = reasons.some((reason) => reasonAllowedForDifficulty(reason, difficultyId));
  const filteredReasons = reasons.filter((reason) => reasonAllowedForDifficulty(reason, difficultyId));
  return makeDecision(shouldSpeak, filteredReasons[0] ?? 'routine', facts, filteredReasons, moveNo, phase);
}

export function shouldCoachSpeakForMove(
  game: Chess,
  plannedMove?: Move | null,
  lastMove?: Move | null,
  difficulty?: Pick<DifficultyConfig, 'id'>,
  moveHistory: MoveHistoryEntry[] = [],
): CoachSpeechDecision {
  return analyzeCoachMoveContext(game, plannedMove, lastMove, difficulty, moveHistory);
}

function makeDecision(
  shouldSpeak: boolean,
  reason: string,
  facts: string[],
  reasons: string[],
  moveNo: number,
  phase: MoveContext['phase'],
): MoveContext {
  return { shouldSpeak, reason, facts: unique(facts), reasons: unique(reasons), moveNumber: moveNo, phase };
}

function reasonAllowedForDifficulty(reason: string, difficultyId: string): boolean {
  const common = new Set([
    'checkmate',
    'draw',
    'king-in-check',
    'student-check',
    'promotion',
    'coach-promotion-available',
    'coach-check-available',
    'queen-loose',
  ]);
  if (common.has(reason)) return true;
  if (difficultyId === 'new') return true;
  if (difficultyId === 'beginner') {
    return !['major-capture', 'major-coach-capture-available'].includes(reason);
  }
  if (difficultyId === 'intermediate') {
    return [
      'meaningful-capture',
      'coach-capture-available',
      'rook-loose',
      'minor-piece-loose',
      'moved-piece-capturable',
      'king-pawn-shield',
      'aggressive-pawn-push',
      'too-many-pawn-moves',
      'opened-king-file',
      'uncastled-open-center',
      'repeated-piece-move',
      'early-queen-move',
    ].includes(reason);
  }
  if (difficultyId === 'advanced') {
    return [
      'meaningful-capture',
      'major-capture',
      'major-coach-capture-available',
      'rook-loose',
      'moved-piece-capturable',
      'king-pawn-shield',
      'aggressive-pawn-push',
      'opened-king-file',
      'uncastled-open-center',
      'early-queen-move',
    ].includes(reason);
  }
  return [
    'major-capture',
    'major-coach-capture-available',
    'rook-loose',
    'moved-piece-capturable',
    'king-pawn-shield',
  ].includes(reason);
}

function gameFromFen(fen?: string): Chess | null {
  if (!fen) return null;
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function materialDeltaForMove(before: Chess, after: Chess, moverColor: 'w' | 'b') {
  const deltaForWhite = materialScore(after) - materialScore(before);
  return moverColor === 'w' ? deltaForWhite : -deltaForWhite;
}

function forcingSummary(game: Chess) {
  const legal = game.moves({ verbose: true });
  return {
    checks: legal.filter((move) => move.san.includes('+') || move.san.includes('#')).length,
    captures: legal.filter((move) => move.captured).length,
    promotions: legal.filter((move) => move.promotion).length,
  };
}

function capturablePiecesForSideToMove(game: Chess) {
  return game.moves({ verbose: true })
    .filter((move) => move.captured)
    .map((move) => ({ square: move.to, piece: move.captured as string, by: move.san }))
    .sort((a, b) => (PIECE_VALUES[b.piece] ?? 0) - (PIECE_VALUES[a.piece] ?? 0));
}

function isRepeatedPieceMove(lastMove: Move, moveHistory: MoveHistoryEntry[]) {
  if (lastMove.piece === 'p' || lastMove.piece === 'k') return false;
  const previous = moveHistory.slice(0, -1).reverse().find((move) => move.by === 'You' && move.piece === lastMove.piece);
  return Boolean(previous && previous.to === lastMove.from);
}

function pawnMoveInfo(game: Chess, lastMove: Move, moveHistory: MoveHistoryEntry[]) {
  const facts: string[] = [];
  if (lastMove.piece !== 'p') {
    return { facts, aggressivePush: false, tooManyPawnMoves: false, kingShieldMoved: false, openedKingFile: false };
  }

  const fromFile = lastMove.from[0];
  const toRank = Number(lastMove.to[1]);
  const fromRank = Number(lastMove.from[1]);
  const whiteMove = lastMove.color === 'w';
  const advancement = whiteMove ? toRank - fromRank : fromRank - toRank;
  const kingShieldMoved = isKingShieldPawnStart(lastMove.from);
  const openedKingFile = kingShieldMoved && !fileHasPawn(game, fromFile, lastMove.color);
  const pawnMovesBySide = moveHistory.filter((move) => move.by === 'You' && move.piece === 'p').length;
  const tooManyPawnMoves = moveNumber(game) <= 10 && pawnMovesBySide >= 5;
  const flankPawn = ['a', 'b', 'f', 'g', 'h'].includes(fromFile);
  const nonCapture = !lastMove.captured;
  const deepFlankPush = nonCapture && flankPawn && (whiteMove ? toRank >= 5 : toRank <= 4);
  const earlyFlankLunge = nonCapture && flankPawn && advancement >= 2 && moveNumber(game) <= 10;
  const aggressivePush = deepFlankPush || earlyFlankLunge;

  if (aggressivePush) facts.push(`The last move advanced a flank pawn aggressively to ${formatSquare(lastMove.to)}.`);
  if (kingShieldMoved) facts.push(`A pawn from the king-side shield moved from ${formatSquare(lastMove.from)}.`);
  if (openedKingFile) facts.push(`The ${fromFile.toUpperCase()} file no longer has that side's original pawn shield.`);
  if (advancement >= 2) facts.push(`The pawn advanced ${advancement} ranks in one move.`);
  if (tooManyPawnMoves) facts.push(`Student has made ${pawnMovesBySide} pawn moves by move ${moveNumber(game)}.`);

  return { facts, aggressivePush, tooManyPawnMoves, kingShieldMoved, openedKingFile };
}

function kingSafetyInfo(game: Chess, lastMove: Move) {
  const facts: string[] = [];
  const color = lastMove.color;
  const rights = game.fen().split(' ')[2] ?? '-';
  const white = color === 'w';
  const stillCanCastle = white ? /K|Q/.test(rights) : /k|q/.test(rights);
  const centerOpen = !fileHasPawn(game, 'd', 'w') || !fileHasPawn(game, 'e', 'w') || !fileHasPawn(game, 'd', 'b') || !fileHasPawn(game, 'e', 'b');
  const unCastledWithCenterOpen = stillCanCastle && centerOpen && moveNumber(game) >= 5;
  if (unCastledWithCenterOpen) facts.push(`${white ? 'White' : 'Black'} king is still uncastled while central files or pawns have opened.`);
  return { facts, unCastledWithCenterOpen };
}

function isKingShieldPawnStart(square: string) {
  return ['f2', 'g2', 'h2', 'f7', 'g7', 'h7'].includes(square);
}

function fileHasPawn(game: Chess, file: string, color: 'w' | 'b') {
  for (let rank = 1; rank <= 8; rank++) {
    const piece = game.get(`${file}${rank}` as Square);
    if (piece?.type === 'p' && piece.color === color) return true;
  }
  return false;
}

function gamePhase(game: Chess): MoveContext['phase'] {
  const no = moveNumber(game);
  const nonKingMaterial = totalNonKingMaterial(game);
  const pieces = game.board().flat().filter(Boolean).length;
  if (pieces <= 12 || nonKingMaterial <= 2600) return 'endgame';
  if (no <= 10) return 'opening';
  return 'middlegame';
}

function totalNonKingMaterial(game: Chess) {
  return game.board().flat().reduce((sum, piece) => {
    if (!piece || piece.type === 'k') return sum;
    return sum + (PIECE_VALUES[piece.type] ?? 0);
  }, 0);
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

export function buildDynamicCoachInfo(
  game: Chess,
  plannedMove?: Move | null,
  lastMove?: Move | null,
  coach?: Pick<CoachConfig, 'name' | 'title' | 'chessFocus' | 'voiceStyle'> | string,
  difficulty?: Pick<DifficultyConfig, 'id' | 'label' | 'elo' | 'stockfishSkill' | 'curriculum' | 'explanationDepth'>,
  moveHistory: Array<{ san: string; from: string; to: string; piece: string; captured?: string; by: string }> = [],
) {
  const coachName = typeof coach === 'string' ? coach : coach?.name ?? 'Coach';
  const coachInfo = typeof coach === 'object'
    ? `Coach identity: I am ${coach.name}, ${coach.title}. My chess specialty: ${coach.chessFocus}. My voice: ${coach.voiceStyle}.`
    : `Coach identity: I am ${coachName}.`;
  const levelInfo = difficulty
    ? `Student level: ${difficulty.label}, approximate rating ${difficulty.elo}, Stockfish skill ${difficulty.stockfishSkill}. Teaching curriculum for this level: ${difficulty.curriculum}. Explanation depth: ${difficulty.explanationDepth}.`
    : '';
  // The student always plays White; I (the coach) always play Black.
  const roleContext = 'Role context: In this game I (the coach) play Black, and the student plays White. The facts below use "I/my" for my pieces (Black) and "the student/the student\'s" for the student\'s pieces (White). When a fact says "the student captured my queen with their bishop", that means the STUDENT now has a winning capture and I (the coach) lost the queen — I must never invert this and claim I gave up a piece for theirs.';
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
  const fenInfo = `Current board FEN: ${game.fen()}. Use this only to understand the board; do not say "FEN" aloud.`;
  const recentHistory = moveHistory.length
    ? `Recent move history, oldest to newest: ${moveHistory.slice(-10).map(formatHistoryMove).join('; ')}.`
    : 'Recent move history: none.';
  const lastMoveInfo = lastMove ? describeLastMove(lastMove) : 'No move has been played yet.';
  const moveHint = plannedMove
    ? `My planned next move as Black coach: ${pieceName(plannedMove.piece)} from ${formatSquare(plannedMove.from)} to ${formatSquare(plannedMove.to)}${plannedMove.captured ? `, capturing the student's ${pieceName(plannedMove.captured)}` : ''}${plannedMove.san.includes('+') ? ', giving check' : ''}${plannedMove.san.includes('#') ? ', giving checkmate' : ''}.`
    : '';
  const tacticalInfo = tacticalSummary(game, lastMove);
  const context = analyzeCoachMoveContext(game, plannedMove, lastMove, difficulty, moveHistory);
  const positionFacts = context.facts.length
    ? `Position facts: ${context.facts.join(' ')}`
    : '';
  return [
    coachInfo,
    roleContext,
    levelInfo,
    turn,
    `Position status: ${status}.`,
    fenInfo,
    recentHistory,
    `Legal moves available: ${legalMoveCount}.`,
    material,
    tacticalInfo,
    lastMoveInfo,
    moveHint,
    positionFacts,
    'Speech rule: speak in first person as the coach and address the student as "you". If the position is routine or there is no useful chess lesson, stay silent. Do not blandly describe what the student just moved. If I have a check, winning capture, or decisive tactic available (as shown in my planned move), I may reference that I see a strong response using "I can" language — but do not announce the exact move. Speak only for a real teaching moment: a blunder, tactic, missed threat, principle, weak square, pawn structure, development, king safety, or endgame idea. Never write raw chess notation - capitalize file letters and separate letter from digit: "the A file", "E 4", "knight to F 3", "bishop takes E 5". TTS needs the capital letter so it reads it as the letter name, not the article.',
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
    'TTS speech rule: my response will be read aloud by a text-to-speech engine so I must write speech, not notation. Never write raw SAN or square names. For files always capitalize the letter so TTS reads it as the letter name: "the A file", "the E file". For squares capitalize the letter and separate with a space: "E 4", "D 5". For piece moves spell the piece out and use the same format: "knight to F 3", "pawn to E 4", "bishop takes E 5", "rook to A 8". Captures use "takes": "bishop takes E 5". Checks are "giving check". Never write "e4", "Nf3", "Bxe5", "a-file", or any run-together notation.',
  ];

  if (mode === 'move') {
    base.push(
      'Give a real coaching explanation only when there is something useful to teach; otherwise stay silent.',
      'Reference at least one concrete chess concept when useful, such as development, king safety, a pin, a fork, a loose piece, an open file, pawn structure, candidate moves, prophylaxis, or conversion.',
      'Keep it natural for voice: usually 1-2 sentences, up to 34 words if the position needs teaching.',
      'Do not blandly narrate what the student just moved.',
      'If my planned next move (shown in the dynamic info) is a check, winning capture, or decisive tactic that directly results from the student\'s last move, I can reference that I now have a strong response — using "I can now" or "this gives me" language — without stating the exact move or square. This teaches cause and effect.',
      'Never attribute my own tactical opportunity (a check or capture I can make) to the student. The "my planned next move" in the dynamic info is MY move, not the student\'s.',
    );
  }

  if (mode === 'hint') {
    base.push(
      coach.hintStyle,
      'Give a structured class-style hint. Connect it to a study topic or thinking routine.',
      'Do not reveal the exact move before hint level 3.',
      'Hints must use natural language only - no raw notation. For squares, capitalize the file letter and separate from the digit: "E 4", "D 5". For pieces: "knight to F 3", "bishop takes E 5". Never write "Nf3", "Bxe5", "e4", or any run-together notation.',
    );
  }

  if (mode === 'chat') {
    base.push(
      'Answer like a chess teacher in office hours: concrete, level-appropriate, and tied to the current position.',
      'Keep the answer to 2-3 sentences maximum. Do not produce essay-length explanations.',
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
  const ownership = moveOwnership(move.color);
  const piece = pieceName(move.piece);
  const capture = move.captured
    ? `, capturing ${ownership.opponentPossessive} ${pieceName(move.captured)}`
    : '';
  const check = move.san.includes('+') ? ' - this gave check' : '';
  const mate = move.san.includes('#') ? ' - this was checkmate' : '';
  return `Last move facts for board context only: ${ownership.moverPhrase} just moved ${ownership.moverPossessive} ${piece} from ${formatSquare(move.from)} to ${formatSquare(move.to)}${capture}${check}${mate}.`;
}

function formatHistoryMove(move: { san: string; from: string; to: string; piece: string; captured?: string; by: string }) {
  const isCoachMove = move.by !== 'You';
  // The student plays White, the coach plays Black, so we can attribute ownership from `by`.
  const moverPhrase = isCoachMove ? 'I (the coach)' : 'the student';
  const moverPossessive = isCoachMove ? 'my' : "the student's";
  const opponentPossessive = isCoachMove ? "the student's" : 'my';
  const capture = move.captured
    ? `, capturing ${opponentPossessive} ${pieceName(move.captured)}`
    : '';
  return `${moverPhrase}: ${moverPossessive} ${pieceName(move.piece)} ${formatSquare(move.from)}-${formatSquare(move.to)}${capture} (${move.san})`;
}

type MoveOwnership = {
  moverPhrase: string;
  moverPossessive: string;
  opponentPossessive: string;
  opponent: { moverPhrase: string; moverPossessive: string; opponentPossessive: string };
};

// The student always plays White and the coach always plays Black, so the
// color of the moving piece uniquely identifies the owner. Phrasing the facts
// from the coach's first-person POV ("I" / "the student") eliminates the
// recurring LLM mis-attribution where the coach claims the student's
// capturing piece was her own.
function moveOwnership(color: 'w' | 'b'): MoveOwnership {
  const coachIsMover = color === 'b';
  const studentSide = {
    moverPhrase: 'the student (playing White)',
    moverPossessive: "the student's",
    opponentPossessive: 'my',
  } as const;
  const coachSide = {
    moverPhrase: 'I (the coach playing Black)',
    moverPossessive: 'my',
    opponentPossessive: "the student's",
  } as const;
  if (coachIsMover) {
    return { ...coachSide, opponent: studentSide };
  }
  return { ...studentSide, opponent: coachSide };
}

function tacticalSummary(game: Chess, lastMove?: Move | null) {
  const legal = game.moves({ verbose: true });
  const checks = legal.filter((move) => move.san.includes('+') || move.san.includes('#')).length;
  const captures = legal.filter((move) => move.captured).length;
  const promotions = legal.filter((move) => move.promotion).length;
  const movedPiece = lastMove ? pieceName(lastMove.piece) : '';
  const centerMove = lastMove && (CENTER_SQUARES.has(lastMove.to) || NEAR_CENTER_SQUARES.has(lastMove.to))
    ? `Last move touched a central or near-central square with a ${movedPiece}.`
    : '';
  return [
    `Forcing move scan for side to move: ${checks} checks, ${captures} captures, ${promotions} promotions.`,
    centerMove,
  ].filter(Boolean).join(' ');
}

function moveNumber(game: Chess) {
  return Number(game.fen().split(' ')[5] ?? '1');
}

function formatSquare(square: string) {
  return `${square[0].toUpperCase()} ${square[1]}`;
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
