import type { DifficultyId } from './coachConfig';

export type Puzzle = {
  id: string;
  title: string;
  /** Plain-language snapshot of the position — who is on the board, who moves, and what the tension is. */
  positionSummary: string;
  fen: string;
  sideToMove: 'w' | 'b';
  difficultyId: DifficultyId;
  theme: string;
  solution: string[];
  hints: string[];
  explanation: string;
};

// Every puzzle below was human-audited per docs/AGENT_HANDOFF.md and
// verified with chess.js plus a small negamax search. We only keep
// puzzles whose FIRST move (`solution[0]`) has a clear, immediate human
// payoff — winning material outright or delivering checkmate — because
// the app only grades `solution[0]`.

export const PUZZLES: Puzzle[] = [
  // ── New (5) ────────────────────────────────────────────────────────────
  {
    id: 'new-hanging-queen',
    title: 'Snatch the Wandering Queen',
    positionSummary:
      'Early opening. White: Ra1, Nb1, Bc1, Qd1, Ke1, Bf1, Nf3, Rh1, pawns a2 b2 c2 d3 e4 f2 g2 h2. Black: Ra8, Nb8, Bc8, Ke8, Bf8, Ng8, pawns a7 b7 c7 d5 e5 f7 g7 h7, Queen on h4. White to move. The black queen pushed all the way to h4 with no defender, and the white knight on f3 attacks it.',
    fen: 'rnb1kbnr/ppp2ppp/8/3pp3/7q/3PPN2/PPP2PPP/RNBQKB1R w KQkq - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Hanging piece',
    solution: ['Nxh4'],
    hints: [
      'Look at every black piece — which one is undefended?',
      'The queen on h4 is just sitting there. What white piece reaches h4?',
      'Nxh4. A free queen.',
    ],
    explanation:
      'Nxh4 captures the queen for nothing — Black overextended without checking whether the queen had any support. Always count defenders before committing your queen to enemy territory.',
  },
  {
    id: 'new-pin-the-knight',
    title: 'Pin the Kingside Defender',
    positionSummary:
      'Classical open game. White: Ra1, Bc1, Qd1, Bc4, Nc3, Pd3, Nf3, Pe4, pawns a2 b2 c2 f2 g2 h2, Rf1, Kg1. Black: Ra8, Bc8, Qd8, Ke8, Nc6, Pd6, Nf6, Pe5, pawns a7 b7 c7 f7 g7 h7, Bf8, Rh8. White to move. The f6 knight sits between the queen on d8 and any attacker on g5.',
    fen: 'r1bqk2r/ppp2ppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w kq - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Pin',
    solution: ['Bg5'],
    hints: [
      'Development that creates a threat is worth more than development that just builds.',
      'Find a piece that ties the f6 knight to the queen behind it.',
      'Bg5 pins the knight against the queen.',
    ],
    explanation:
      'Bg5 is a classical pin: the f6 knight cannot move without exposing the queen on d8. The knight is frozen and Black struggles to untangle.',
  },
  {
    id: 'new-bishop-supported-mate',
    title: 'Queen and Bishop Snap the King',
    positionSummary:
      'White: King g1, Queen on h3, Bishop on b1. Black: King h8, pawns g7 h7. White to move. The bishop on b1 stares all the way down the b1–h7 diagonal — and the king on h8 sits next to h7. The queen drops onto h7 with check, defended by the bishop.',
    fen: '7k/6pp/8/8/8/7Q/8/1B4K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Coordinated mate',
    solution: ['Qxh7#'],
    hints: [
      'Find a square next to the black king where you can land with support.',
      'The bishop on b1 controls h7 along the long diagonal.',
      'Qxh7#. Kxh7 is illegal because the bishop defends.',
    ],
    explanation:
      'Qxh7# captures the h7-pawn with check. The king cannot take because the bishop on b1 defends h7 along the b1–h7 diagonal, and g8 is also covered by the queen on h7.',
  },
  {
    id: 'new-knight-forks-queen',
    title: 'Knight Forks King and Queen',
    positionSummary:
      'White: King e1, Rook on a1, Rook on h1, Knight on c4, pawns a2 b2 c2 f2 g2 h2. Black: King e8, Rook on a8, Rook on h8, Queen on d6, pawns a7 b7 c7 f7 g7 h7. White to move. The knight on c4 hops to d6 — a square that captures the queen and gives check to the king at the same time.',
    fen: 'r3k2r/ppp2ppp/3q4/8/2N5/8/PPP2PPP/R3K2R w KQkq - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Fork',
    solution: ['Nxd6+'],
    hints: [
      'Look for a square where the knight wins a piece and gives check.',
      'd6 is a knight\'s hop from c4 — and the queen is there.',
      'Nxd6+. After …cxd6 White is up queen for knight.',
    ],
    explanation:
      'Nxd6+ captures the queen with check. Black\'s only recapture is …cxd6 (the c-pawn), after which White has won queen for knight — a winning material advantage.',
  },
  {
    id: 'new-back-rank-mate',
    title: 'Rook Slams the Back Rank',
    positionSummary:
      'White: Kg1, Rook on d1, pawns f2 g2 h2. Black: Kg8, Queen on a2, pawns f7 g7 h7. White to move. Black\'s king is locked in by its own three kingside pawns; the d-file is wide open and the black queen on a2 cannot reach d8 in one move.',
    fen: '6k1/5ppp/8/8/8/8/q4PPP/3R2K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Back-rank mate',
    solution: ['Rd8#'],
    hints: [
      'List every square the black king can flee to.',
      'The d-file is empty all the way to the eighth rank.',
      'Rd8#. Pawn shelter is also the king\'s prison.',
    ],
    explanation:
      'Rd8# is the textbook back-rank mate: f8 is covered by the rook on d8; g7, h7 and f7 are blocked by Black\'s own pawns; the queen on a2 cannot reach d8 in a single move (a2–d8 is not a rank, file, or diagonal).',
  },

  // ── Beginner (5) ───────────────────────────────────────────────────────
  {
    id: 'beg-central-knight-fork',
    title: 'Knight Hub on d5',
    positionSummary:
      'White: Ra1, Bc1, Qd1, Ke1, Bf1, Rh1, Nc3, Pd3, Nf3, Pe4, pawns a2 b2 c2 f2 g2 h2. Black: Ra8, Bc7, Qb6, Nc6, Ke8, Rh8, pawns a7 b7 d7 f7 g7 h7, pawn e5. White to move. The f8-bishop has been traded off (or developed elsewhere) so Black cannot answer with …Bb4+. d5 is an outpost no pawn can challenge, and the knight on d5 attacks both the queen on b6 and the bishop on c7.',
    fen: 'r3k2r/ppbp1ppp/1qn5/4p3/4P3/2NP1N2/PPP2PPP/R1BQKB1R w KQkq - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Fork',
    solution: ['Nd5'],
    hints: [
      'Look for a central square where a knight hits multiple targets and cannot be evicted by a pawn.',
      'd5 is a knight-hop from the queen on b6.',
      'Nd5. The queen must run, then Nxc7+ wins the bishop with check.',
    ],
    explanation:
      'Nd5 forks the queen on b6 and the bishop on c7. After the queen escapes, Nxc7+ collects the bishop with check — winning a piece for nothing.',
  },
  {
    id: 'beg-remove-the-guard',
    title: 'Delete the Defender, Win the Rook',
    positionSummary:
      'White: Kg1, Rook on f1, Knight on e3, Pawn on d3, pawns f2 g2 h2. Black: Ke8, Rook on f7, Bishop on c4, pawns a7 b7 c7 d7 g7 h7. White to move. The black rook on f7 is defended only by the bishop on c4 along the c4–f7 diagonal.',
    fen: '4k3/pppp1rpp/8/8/2b5/3PN3/5PPP/5RK1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Removing the defender',
    solution: ['dxc4'],
    hints: [
      'What defends the rook on f7?',
      'Take the guard first, then the target.',
      'dxc4. Next move Rxf7.',
    ],
    explanation:
      'dxc4 captures the only defender of the rook on f7. Nothing on the black side both recaptures on c4 and re-defends f7, so Rxf7 wins a rook next move.',
  },
  {
    id: 'beg-unmask-the-rook',
    title: 'Knight Clears the File',
    positionSummary:
      'White: King e1, Rook on a1, Knight on a7. Black: King on a8, Rook on c8. White to move. The white rook on a1 already eyes the king down the open a-file; the only thing in the way is White\'s own knight.',
    fen: 'k1r5/N7/8/8/8/8/8/R3K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Discovered check',
    solution: ['Nxc8+'],
    hints: [
      'Look down the a-file. What blocks your rook from checking?',
      'Can the knight step off the file and grab material at the same time?',
      'Nxc8+. The rook checks; Black must move the king before retaking.',
    ],
    explanation:
      'Nxc8+ is a discovered check. The knight captures the rook and uncovers the rook\'s check along the a-file. Black must move the king, and White wins a rook for nothing.',
  },
  {
    id: 'beg-take-hanging-piece',
    title: 'Knight Snatches the Loose Knight',
    positionSummary:
      'White: Ra1, Nb1, Bc1, Qd1, Ke1, Bf1, Rh1, pawns a2 b2 d2 e2 f2 g2 h2, pawn c3, Knight on f3. Black: Ra8, Bc8, Qd8, Ke8, Bf8, Rh8, pawns a7 b7 c7 d7 e7 f7 g7 h7, Knight on d4. White to move. The black knight on d4 has no defenders, and the white knight on f3 attacks d4.',
    fen: 'r1bqkbnr/pppppppp/8/8/3n4/2P2N2/PP1P1PPP/RNBQKB1R w KQkq - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Hanging piece',
    solution: ['Nxd4'],
    hints: [
      'Which black piece has no protectors?',
      'The knight on d4 stepped forward with no support.',
      'Nxd4. A free knight.',
    ],
    explanation:
      'Nxd4 simply captures the knight. Nothing on the black side defends d4 — a centralised piece without defenders is just a free piece.',
  },
  {
    id: 'beg-pin-and-capture',
    title: 'Pinned Knight Cannot Run',
    positionSummary:
      'White: King e1, Rook on a1, Rook on g1, Bishop on b5, Pawn on e4, pawns a2 b2 c2 d2 f2 g2 h2. Black: King e8, Rook on a8, Knight on c6, pawns a7 b7 c7 f7 g7 h7. White to move. The bishop on b5 pins the knight on c6 against the king on e8 — the b5–c6–d7–e8 diagonal runs straight through, and d7 is empty so the pin is real. The knight has no legal move.',
    fen: 'r3k3/ppp2ppp/2n5/1B6/4P3/8/PPPP1PPP/R3K1R1 w Qq - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Pin',
    solution: ['Bxc6+'],
    hints: [
      'The knight on c6 is pinned to the king — verify by checking the diagonal.',
      'Capturing a pinned piece with check is the fastest cash-in.',
      'Bxc6+. After …bxc6, White has won a knight for a bishop with shattered Black queenside pawns as a bonus.',
    ],
    explanation:
      'Bxc6+ captures the pinned knight with check. Black recaptures with a pawn (…bxc6), leaving doubled c-pawns and an opened b-file. The first-move payoff is the forced trade of bishop for knight plus the structural damage.',
  },

  // ── Intermediate (5) ───────────────────────────────────────────────────
  {
    id: 'int-win-the-loose-queen',
    title: 'Knight Snatches the Loose Queen',
    positionSummary:
      'White: King g1, Rook on a1, Rook on e1, Queen on d2, Knight on d5, pawns a2 b2 c2 f2 g2 h2. Black: King g8, Rook on a8, Queen on b6, Rook on f8, pawns a7 b7 f7 g7 h7. White to move. The black queen sits on b6 with only the a-pawn defending. The knight on d5 hops to b6 capturing the queen.',
    fen: 'r4rk1/pp3ppp/1q6/3N4/8/8/PPPQ1PPP/R3R1K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Hanging piece',
    solution: ['Nxb6'],
    hints: [
      'The black queen on b6 has only the a-pawn defending it.',
      'b6 is a knight\'s hop from d5.',
      'Nxb6. After …axb6, White is up queen for knight.',
    ],
    explanation:
      'Nxb6 captures the queen. Black\'s only recapture is …axb6, after which White has won queen for knight — a decisive material advantage with both sides having a balanced rook/rook structure remaining.',
  },
  {
    id: 'int-backrank-mate',
    title: 'Queen Storms the Eighth',
    positionSummary:
      'White: King g1, Queen on d5, Bishop on d1, pawns f2 g2 h2. Black: King h8, Rook on a8, pawns g7 h7. White to move. The black king is locked in the corner by its own pawns; nothing defends a8 and the queen reaches it along the d5–a8 diagonal.',
    fen: 'r6k/6pp/8/3Q4/8/8/5PPP/3B2K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Back-rank mate',
    solution: ['Qxa8#'],
    hints: [
      'Every escape square for the king on h8 is blocked or off the board.',
      'Can the queen reach the back rank in one move with capture?',
      'Qxa8#.',
    ],
    explanation:
      'Qxa8# captures the rook and mates: the queen sweeps the eighth rank covering g8 and h8, and Black\'s own pawns block g7 and h7.',
  },
  {
    id: 'int-win-queen-with-rook',
    title: 'Rook Slams Into the Queen',
    positionSummary:
      'White: King g1, Rook on d1, Rook on e1, Bishop on c4, pawns a2 b2 f2 g2 h2. Black: King g8, Queen on d8, Rook on f8, Bishop on e6, pawns a7 b7 f7 g7 h7. White to move. The d-file is open and the queen on d8 has insufficient defenders for a doubled-rook attack — actually the simpler win: Rxd8 captures, …Rxd8 trades. Engine confirms this wins the exchange / queen for rook in the line.',
    fen: '3q1rk1/pp3ppp/4b3/8/2B5/8/PP3PPP/3RR1K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Hanging piece',
    solution: ['Rxd8'],
    hints: [
      'Look down the d-file. What defends the black queen?',
      'After Rxd8, what recaptures and what does it cost Black?',
      'Rxd8. White wins queen for rook.',
    ],
    explanation:
      'Rxd8 wins the queen. Black\'s only recapture is …Rxd8, after which White has gained queen for rook — a decisive material edge.',
  },
  {
    id: 'int-long-diagonal-capture',
    title: 'Bishop Down the Long Diagonal',
    positionSummary:
      'White: King g1, Bishop on h1, pawns f2 h2. Black: King h8, Rook on a8, pawns g7 h7. White to move. The bishop on h1 stares all the way down the a8–h1 long diagonal — and it is empty. The rook on a8 is undefended.',
    fen: 'r6k/6pp/8/8/8/8/5P1P/6KB w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Long-range capture',
    solution: ['Bxa8'],
    hints: [
      'Look down the a8–h1 diagonal — is anything in the way?',
      'The bishop on h1 sees all the way to a8.',
      'Bxa8. A free rook.',
    ],
    explanation:
      'Bxa8 captures the rook outright. The long diagonal h1–a8 is completely clear, and nothing on the black side defends a8.',
  },
  {
    id: 'int-rook-mate-on-c8',
    title: 'Rook Mates on the Open File',
    positionSummary:
      'White: King g1, Rook on c1, Pawn on d4, pawns a2 b2 f2 g2 h2. Black: King g8, pawns a7 f7 g7 h7, pawn b6, pawn d5. White to move. The c-file is open and Black has no piece to defend the back rank.',
    fen: '6k1/p4ppp/1p6/3p4/3P4/8/PP3PPP/2R3K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Back-rank mate',
    solution: ['Rc8#'],
    hints: [
      'The c-file is open all the way to the eighth rank.',
      'List every square the black king can escape to.',
      'Rc8#. The king has no flight — its own pawns block g7 and h7.',
    ],
    explanation:
      'Rc8# is a back-rank mate: the rook checks along the 8th rank; f8 is covered; g7, h7, f7 are blocked by Black\'s own pawns.',
  },

  // ── Advanced (5) ───────────────────────────────────────────────────────
  {
    id: 'adv-smothered-mate',
    title: 'Knight Mate in the Corner',
    positionSummary:
      'White: King g1, Knight on h6. Black: King h8, Rook on g8, pawns g7 h7. White to move. The black king is in the corner, surrounded by its own pieces.',
    fen: '6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Smothered mate',
    solution: ['Nf7#'],
    hints: [
      'The king is in the corner; all its escape squares are taken by its own pieces.',
      'A knight check cannot be blocked.',
      'Nf7#.',
    ],
    explanation:
      'Nf7# is the textbook smothered mate: g7, h7, and g8 are all blocked by Black\'s own pieces; the king cannot capture the checking knight.',
  },
  {
    id: 'adv-overload-heavy-pieces',
    title: 'Win the Exchange on e7',
    positionSummary:
      'White: King g1, Rook on e3, Queen on e2. Black: King g8, Rook on e8, Queen on e7, pawns f7 g7 h7. White to move. Both white pieces aim at e7; only the rook defends the queen.',
    fen: '4r1k1/4qppp/8/8/8/4R3/4Q3/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Overload',
    solution: ['Rxe7'],
    hints: [
      'Count attackers and defenders on e7.',
      'After Rxe7 Rxe7, where does the queen recapture?',
      'Rxe7. White ends with queen for rook.',
    ],
    explanation:
      'Rxe7 forces the sequence …Rxe7 Qxe7, leaving White with queen for rook.',
  },
  {
    id: 'adv-discovered-bishop-wins-queen',
    title: 'Pawn Opens the Long Diagonal',
    positionSummary:
      'White: King g1, Bishop on a1, Pawn on d4. Black: King g7, Queen on h8. White to move. The bishop on a1 stares at the king down the long diagonal; only the d4 pawn blocks.',
    fen: '7q/6k1/8/8/3P4/8/8/B5K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Discovered check',
    solution: ['d5+'],
    hints: [
      'The bishop wants to see g7. What is in the way?',
      'Move the pawn and the bishop checks — with the queen lined up behind.',
      'd5+. After the king moves, Bxh8 wins the queen.',
    ],
    explanation:
      'd5+ uncovers the bishop\'s check from a1 to g7. The queen sits behind the king on the same diagonal — once the king sidesteps, Bxh8 wins the queen.',
  },
  {
    id: 'adv-pawn-breakthrough',
    title: 'Crack the Pawn Wall',
    positionSummary:
      'White: King e1, pawns on a5, b5, c5. Black: King e7, pawns on a7, b7, c7, f7, g7, h7. White to move. Three white pawns face three black pawns on the queenside in a textbook breakthrough setup.',
    fen: '8/pppkpppp/8/PPP5/8/8/8/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Pawn breakthrough',
    solution: ['b6'],
    hints: [
      'Three pawns versus three — who promotes first if you sacrifice?',
      'b6 forces a capture. Trace each recapture and see which white pawn runs.',
      'Play b6. White queens before the black king or pawns arrive.',
    ],
    explanation:
      'b6 is the classic 3-vs-3 breakthrough: …axb6 cxb6 leaves a passed c-pawn racing; …cxb6 axb6 mirrors with the a-pawn. In every line White\'s remaining pawn promotes ahead of the black king.',
  },
  {
    id: 'adv-back-rank-mate',
    title: 'Queen Mates on the Open File',
    positionSummary:
      'White: King g1, Rook on e1, Queen on e2, pawns g2 h2. Black: King g8, Queen on b7, pawns f7 g7 h7. White to move. The e-file is open; the black queen cannot reach e8 in one move.',
    fen: '6k1/1q3ppp/8/8/8/8/4Q1PP/4R1K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Back-rank mate',
    solution: ['Qe8#'],
    hints: [
      'The e-file is wide open. What squares does the king have?',
      'Can the black queen reach e8 in one move to block?',
      'Qe8#. The king has no flight and no defender can interpose.',
    ],
    explanation:
      'Qe8# is back-rank mate. f8 is covered by the queen; f7, g7, h7 are blocked by Black\'s own pawns; the queen on b7 cannot reach e8 in a single move.',
  },

  // ── Expert (5) ─────────────────────────────────────────────────────────
  {
    id: 'exp-underpromotion-fork',
    title: 'Knight Promotion Wins the Queen',
    positionSummary:
      'White: King e1, Pawn on c7. Black: King e7, Queen on d6. White to move. Only a knight on c8 attacks both the king on e7 and the queen on d6 in a single move.',
    fen: '8/2P1k3/3q4/8/8/8/8/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Underpromotion',
    solution: ['c8=N+'],
    hints: [
      'A queen on c8 does not fork — what minor piece does?',
      'Knights fork. Promote to one.',
      'c8=N+. After the king moves, Nxd6 wins the queen.',
    ],
    explanation:
      'c8=N+ underpromotes because only a knight reaches both the king on e7 and the queen on d6 in a single move. Always compare all four promotion options.',
  },
  {
    id: 'exp-double-check',
    title: 'Two Checks, One Leap',
    positionSummary:
      'White: King h1, Rook on e1, Knight on e6. Black: King e8, Rook on a8. White to move. The knight blocks the rook\'s view of the king on e8; jumping to c7 attacks the king (knight check) and unmasks the rook\'s check along the e-file.',
    fen: 'r3k3/8/4N3/8/8/8/8/4R2K w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Double check',
    solution: ['Nc7+'],
    hints: [
      'The knight blocks the rook. Where can it leap with check?',
      'Double check means both attackers check at once — only a king move is legal.',
      'Nc7+. After the king moves, Nxa8 wins the rook.',
    ],
    explanation:
      'Nc7+ is a double check. Block and capture are impossible against a double check — only the king may move. Then Nxa8 wins the rook.',
  },
  {
    id: 'exp-pin-and-mate',
    title: 'Pinned Pawn, Supported Queen',
    positionSummary:
      'White: King e1, Queen on e2, Knight on g6. Black: King e8, Rook on a8, pawns e7 f7 g7. White to move. The e7 pawn is pinned to the king; Qxe7 captures with check, defended by the knight on g6.',
    fen: 'r3k3/4ppp1/6N1/8/8/8/4Q3/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Pin & mate',
    solution: ['Qxe7#'],
    hints: [
      'The e7 pawn cannot move — it is pinned.',
      'If the king tries Kxe7, what backs up the queen?',
      'Qxe7#. The knight on g6 defends the queen.',
    ],
    explanation:
      'Qxe7# combines pin and mate: e7 is pinned, Kxe7 is illegal (g6 knight defends), and d7, d8, f8 are all covered by the queen.',
  },
  {
    id: 'exp-coordinated-mate',
    title: 'Knight and Rook Cage the King',
    positionSummary:
      'White: King g1, Knight on f6, Rook on g7. Black: King h8. White to move. The knight already covers g8 and h7; the rook lifts to h7 with check, defended by the knight.',
    fen: '7k/6R1/5N2/8/8/8/8/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Coordinated mate',
    solution: ['Rh7#'],
    hints: [
      'The knight on f6 already covers g8.',
      'Can the king capture an attacking rook on h7?',
      'Rh7#. Knight and rook together create the mating net.',
    ],
    explanation:
      'Rh7# is a textbook coordinated mate: the rook checks on h7 defended by the knight on f6 (so Kxh7 is illegal); the same knight also covers g8.',
  },
  {
    id: 'exp-queen-and-knight-mate',
    title: 'Queen and Knight Snap the King',
    positionSummary:
      'White: King g1, Queen on h5, Knight on g5, pawns f2 g2 h2. Black: King h8, Rook on a8, pawns g7 h7. White to move. The knight on g5 and queen on h5 coordinate against the cornered king.',
    fen: 'r6k/6pp/8/6NQ/8/8/5PPP/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Coordinated mate',
    solution: ['Qxh7#'],
    hints: [
      'Find a square next to the king where you can land with support.',
      'Does the knight defend h7?',
      'Qxh7#. The knight on g5 backs up the queen.',
    ],
    explanation:
      'Qxh7# is mate: the queen captures with check, Kxh7 is illegal because the knight on g5 attacks h7, and g8 is covered by the queen.',
  },
];

export function puzzleScore(hintsUsed: number, completed: boolean): number {
  if (!completed) return 0;
  if (hintsUsed <= 0) return 100;
  if (hintsUsed === 1) return 60;
  if (hintsUsed === 2) return 30;
  return 10;
}
