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

export const PUZZLES: Puzzle[] = [
  // ── New (5) — full-looking positions, one clear idea each ───────────────
  {
    id: 'new-hanging-center-pawn',
    title: 'Punish the Loose Center Pawn',
    positionSummary:
      'A normal Italian-style opening: both sides have castling rights, developed minors, and central pawns. Black to move. White just played bishop to c4 and knight to f3; the e4 pawn looks protected by the bishop but the knight on c6 can snap it off because nothing else truly guards e4.',
    fen: 'r1b1kb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1',
    sideToMove: 'b',
    difficultyId: 'new',
    theme: 'Piece safety',
    solution: ['Nxe4'],
    hints: [
      'Scan every enemy pawn and piece before you develop further — is anything actually defended?',
      'The e4 pawn is only “covered” by the bishop on c4. Count again: can anything recapture on e4 immediately?',
      'Take on e4 with the knight. You win a central pawn and open lines toward the white king.',
    ],
    explanation:
      'Nxe4 wins material because e4 is a false target: after …Nxe4 the bishop on c4 cannot recapture without losing the exchange or tempo. Training your eye to count defenders, not just “pieces pointing at” a square, is the whole lesson.',
  },
  {
    id: 'new-pin-the-knight',
    title: 'Pin the Kingside Defender',
    positionSummary:
      'Classical open game after 1.e4 e5: both kings still in the centre, full pawn chains, bishops and knights developed. White to move. Black’s knight on f6 defends the e5 pawn and guards g4/h5 squares; a bishop hop to g5 pins that knight to the queen on d8 and cramps Black instantly.',
    fen: 'r1bqk2r/ppp2ppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w kq - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Pin',
    solution: ['Bg5'],
    hints: [
      'Development is good; development that creates a threat is better. Which enemy piece is doing multiple jobs?',
      'The knight on f6 shields the e5 pawn and the king. Can a bishop attack that knight along a line toward the queen?',
      'Play Bg5. The knight is pinned to the queen and Black must untangle before castling comfortably.',
    ],
    explanation:
      'Bg5 is a classical pin: the f6-knight cannot move without exposing the queen on d8. Even without winning material immediately, the pin slows Black’s development and keeps pressure on e5.',
  },
  {
    id: 'new-shatter-kingside',
    title: 'Trade Into a Weak King',
    positionSummary:
      'French/Scotch-flavoured middlegame: rooks connected, both sides castled kingside, pawn skeleton intact. White to move. Black’s dark-squared bishop and knight guard the king; exchanging on f6 tears open the g-file and leaves doubled, brittle f-pawns in front of the black king.',
    fen: 'r1bq1rk1/pp3ppp/2nbpn2/3p2B1/3P4/2N1PN2/PP3PPP/R2QK2R w KQ - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Structural weakening',
    solution: ['Bxf6'],
    hints: [
      'Sometimes the best capture is not about winning a piece today but damaging the pawn cover forever.',
      'If you trade bishop for knight on f6, what pawn must recapture, and how does the kingside shape change?',
      'Play Bxf6. After …gxf6 the king’s shelter is cracked and the g-file may open later.',
    ],
    explanation:
      'Bxf6 is a positional trade: …gxf6 leaves doubled, weakened f-pawns and a more exposed king. White keeps the bishop pair on an open board and can aim rooks or the queen at g7/h7 later.',
  },
  {
    id: 'new-discovered-raid',
    title: 'Unmask the Queen, Raid the Rook',
    positionSummary:
      'Sharp tactical skirmish: black queen on a8, white rook on f6, black knight on d5 blocking the long diagonal, white king on h1. Black to move. Moving the knight off the a8–h1 diagonal uncovers a queen check while the same knight captures the white rook on f6 — two threats at once.',
    fen: 'q3k3/8/5R2/3n4/8/8/8/7K b - - 0 1',
    sideToMove: 'b',
    difficultyId: 'new',
    theme: 'Discovered check',
    solution: ['Nxf6+'],
    hints: [
      'Your queen is masked by your own knight. What square can the knight jump to that also grabs material?',
      'A discovered check forces the opponent to deal with the king first. Can your knight move deliver check and capture?',
      'Play …Nxf6+. The queen checks on the diagonal and you win the rook because the king must respond.',
    ],
    explanation:
      '…Nxf6+ is a discovered check: the knight leaves the diagonal, the queen checks the white king, and the rook on f6 falls. The check is the forcing part; the capture is the profit.',
  },
  {
    id: 'new-promotion-with-capture',
    title: 'Capture on the Way Up',
    positionSummary:
      'Endgame race on the edge: white king on e1, advanced e-pawn on e7, black rook on d8 cutting off the king, black king far on a1. White to move. Pushing the pawn captures the rook on d8 and promotes — the black king is too far away to stop both ideas.',
    fen: '3r4/4P3/8/8/8/8/8/k3K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Promotion',
    solution: ['exd8=Q'],
    hints: [
      'The pawn is one step from promotion. Does it have to promote quietly, or can it take something on the way?',
      'The rook on d8 is in the pawn’s path. What happens if the pawn captures while promoting?',
      'Play exd8=Q. You remove the defender and get a queen in one move.',
    ],
    explanation:
      'exd8=Q combines promotion with capture. The black king on a1 cannot reach the action in time, so White ends up with a queen versus a lone king.',
  },

  // ── Beginner (5) — forcing tactics on busy boards ───────────────────────
  {
    id: 'beg-unmask-the-rook',
    title: 'Knight Clears the File',
    positionSummary:
      'Black king stuck on a8 behind its own rook on c8; white knight on a7, white rook on a1 aimed up the open a-file. White to move. Capturing on c8 removes the blocker and the rook on a1 gives a discovered check — Black loses the exchange and faces a king hunt.',
    fen: 'k1r5/N7/8/8/8/8/8/R3K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Discovered check',
    solution: ['Nxc8+'],
    hints: [
      'Trace the a-file: your rook wants to attack the king, but your knight is in the way.',
      'Can the knight capture something valuable while stepping off the line?',
      'Take on c8 with the knight. The rook checks the king on a8 and you keep the piece.',
    ],
    explanation:
      'Nxc8+ wins the rook and uncovers Ra8#-level pressure: the knight captures with check, and the rook’s line to the king opens. Discovered checks are among the most forcing tactics in chess.',
  },
  {
    id: 'beg-remove-the-guard',
    title: 'Delete the Bishop, Win the Rook',
    positionSummary:
      'White rook on f1, white pawn on d3, black bishop on c4 defending the black rook on f7, kings on g1 and e8. White to move. The f7-rook is only protected by the bishop; eliminating the bishop first leaves the rook homeless next turn.',
    fen: '4k3/5r2/8/8/2b5/3P4/8/5RK1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Removing the defender',
    solution: ['dxc4'],
    hints: [
      'You are staring at a rook on f7. What piece is actually guarding it?',
      'Removing the defender is a two-step idea: first capture the guard, then take the target.',
      'Play dxc4. Next move you can win the rook on f7 because the bishop is gone.',
    ],
    explanation:
      'dxc4 removes the bishop that defends f7. After the recapture, Rxf7 wins a whole rook. Always identify the defender before lunging at the target.',
  },
  {
    id: 'beg-central-knight-fork',
    title: 'Knight Hub on d5',
    positionSummary:
      'Open Sicilian-type position: both sides castled, queens on d1 and b6, knights on f3/f6, bishops on c4 and c7, full pawn centre. White to move. A knight jump to d5 attacks the queen on b6 and the bishop on c7 at once; no pawn can evict the knight immediately.',
    fen: 'r3kb1r/ppbp1ppp/1qn5/4p3/4P3/2NP1N2/PPP2PPP/R1BQKB1R w KQkq - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Fork',
    solution: ['Nd5'],
    hints: [
      'Look for a central square where a knight hits two pieces and cannot be kicked by a pawn.',
      'The queen on b6 and bishop on c7 are a knight-hop apart from d5.',
      'Play Nd5. Black must lose time moving the queen; you can follow with Nxc7+.',
    ],
    explanation:
      'Nd5 is a central fork from an outpost: the queen must flee, then Nxc7+ picks off the bishop with check. Knights on d5/e5/f5 are classic hubs in open positions.',
  },
  {
    id: 'beg-f7-sacrifice',
    title: 'Knight Tears Open f7',
    positionSummary:
      'Kingside castled middlegame: white queen on e2, white knight on e5, black queen on e7, rooks on a8 and f8, pawns on d5/e6. White to move. A knight sacrifice on f7 drags the black rook into a pin and lets the queen harvest material on e6 afterward.',
    fen: 'r4rk1/pp2qppp/2n1p3/3pN3/3P4/2P5/PP2QPPP/R4RK1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Sacrifice',
    solution: ['Nxf7'],
    hints: [
      'The f7 square is only protected by the rook. What happens if you hop in with the knight?',
      'Calculate one ply deeper: after …Rxf7, where can your queen land with tempo?',
      'Play Nxf7. After …Rxf7, Qxe6 wins back the piece with interest.',
    ],
    explanation:
      'Nxf7 is a classic Greek-gift pattern lite: …Rxf7 Qxe6 regains the knight while keeping kingside pressure. Sacrifices work when you have a concrete follow-up, not just “it looks scary.”',
  },
  {
    id: 'beg-double-threat-on-d-file',
    title: 'Bishop Check, Rook Ambush',
    positionSummary:
      'Black king on g8, black queen on d8, white bishop on d5, white rook on d1, white pawns on f2/g2/h2. White to move. Be6+ forces the king to move while the rook suddenly attacks the queen along the d-file — Black cannot solve both threats.',
    fen: '3q2k1/6pp/8/3B4/8/8/5PPP/3R2K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Discovered attack',
    solution: ['Be6+'],
    hints: [
      'Your bishop and rook share the d-file but the bishop blocks the rook. Can the bishop step aside with check?',
      'A discovered attack with check means the king must move before the queen can be saved.',
      'Play Be6+. After the king moves, Rxd8 wins the queen.',
    ],
    explanation:
      'Be6+ is a discovered attack: the bishop checks, and when the king moves, Rxd8 wins the queen. The check buys time — without it, Black could save the queen.',
  },

  // ── Intermediate (5) — rich middlegames, no empty-board tricks ──────────
  {
    id: 'int-greek-gift',
    title: 'Bishop Storms h7',
    positionSummary:
      'Main-line-looking position: both sides developed, white bishops on c1/d3, knights on c3/f3, queen on d1, black king castled, black bishop on e6, pawns on d5/e6/f7/g7/h7. White to move. Bxh7+ is the Greek gift: a forcing check that wins the h7 pawn and blows open the black king’s shelter.',
    fen: 'r1bq1rk1/pp3ppp/2nbpn2/3p4/3P4/2NBPN2/PP3PPP/R2QK2R w KQ - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Zwischenzug',
    solution: ['Bxh7+'],
    hints: [
      'Before recapturing mechanically, ask: is there a forcing move that changes the position’s structure?',
      'The bishop can take on h7 with check. Where must the king go, and what lines open?',
      'Play Bxh7+. After …Kxh7 you have shattered the kingside pawn cover.',
    ],
    explanation:
      'Bxh7+ is a zwischenzug / Greek gift: the check forces …Kxh7, leaving Black’s king exposed on the h-file. The point is not the pawn — it is the permanent king weakness.',
  },
  {
    id: 'int-backrank-invasion',
    title: 'Queen Invades the Eighth',
    positionSummary:
      'Black king trapped on h8 behind pawns on g7/h7, black rook on a8, white queen on d5, white bishop on d1, white pawns on f2/g2/h2. White to move. Qxa8# is immediate: the queen captures the rook with check and every escape square is covered by pawns or the queen.',
    fen: 'r6k/6pp/8/3Q4/8/8/5PPP/3B2K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Back-rank mate',
    solution: ['Qxa8#'],
    hints: [
      'List every square the king on h8 can move to. Are they all controlled or blocked?',
      'A queen can invade the back rank with capture and check in one move.',
      'Play Qxa8#. The king has no legal escape — mate on the spot.',
    ],
    explanation:
      'Qxa8# is a back-rank mate: the queen takes the rook with check, g8/h8 are controlled, and g7/h7 are blocked by Black’s own pawns. Always scan the back rank when the enemy king is boxed in.',
  },
  {
    id: 'int-deflect-the-rook',
    title: 'Trade Off the Defender',
    positionSummary:
      'Black king on g8, rooks on c8 and a8, white knight on b6, white rook on c1, white pawn on a3, kingside pawn chains intact. White to move. Nxc8 forces the black rook on a8 to recapture, after which White’s rook penetrates with decisive effect.',
    fen: '2r3k1/1p3ppp/pN6/3p4/8/P7/1PP2PPP/2R3K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Deflection',
    solution: ['Nxc8'],
    hints: [
      'Which black piece is holding the c-file together? Can you tempt it away?',
      'Deflection removes a defender by forcing it to capture, then another piece exploits the hole.',
      'Play Nxc8. After …Rxc8, your rook owns the open file.',
    ],
    explanation:
      'Nxc8 deflects the defender: …Rxc8 allows Rxc8 with a dominating rook. The tactic is about removing the piece that kept White out of the seventh rank.',
  },
  {
    id: 'int-stop-ng4',
    title: 'Head Off …Ng4',
    positionSummary:
      'Full Sicilian-style battle: white queen on d1, bishops on c1/e3, knights on c3/f3, black queen on d8, bishops on e7/g7, knights on c6/f6, everyone castled kingside. White to move. A quiet h3 stops the typical …Ng4 jump that would harass the white queen and bishop on e3.',
    fen: 'r2q1rk1/pp2ppbp/2np1np1/3p4/3P4/2NBPN2/PP3PPP/R1BQR1K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Prophylaxis',
    solution: ['h3'],
    hints: [
      'Before attacking, ask what your opponent wants to do next. Which knight jump would annoy you most?',
      'A small pawn move can deny a square without weakening your structure.',
      'Play h3. …Ng4 is prevented and you keep the initiative.',
    ],
    explanation:
      'h3 is prophylaxis: it stops …Ng4, which would fork ideas against the queen on d1 and bishop on e3. Strong players prevent the opponent’s plan before executing their own.',
  },
  {
    id: 'int-seventh-rank-invasion',
    title: 'Rook Dives Behind the Pawns',
    positionSummary:
      'Rook ending with both kings active: black king on g8, black rooks on c8, pawns on a7/b7/d5/f7/g7/h7, white rook on c3, white pawn on d4, white king on g1. White to move. Rc7 lifts the rook to the seventh rank, cutting off the king and attacking multiple pawns at once.',
    fen: '2r3k1/p4ppp/1p6/3p4/3P4/2R5/P4PPP/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Rook endgame',
    solution: ['Rc7'],
    hints: [
      'In rook endings, activity beats material. Where is the most annoying square for your rook?',
      'The seventh rank (for White, the 7th) sits behind enemy pawns and near the king.',
      'Play Rc7. Pawns on a7 and f7 are attacked and the black king is cut off.',
    ],
    explanation:
      'Rc7 is a seventh-rank invasion: the rook attacks a7/f7 and restricts the black king. In rook endings, one active rook often dominates two passive ones.',
  },

  // ── Advanced (5) — calculation and compound themes ──────────────────────
  {
    id: 'adv-smothered-mate',
    title: 'Knight Mate in the Corner',
    positionSummary:
      'Black king on h8, black rook on g8, pawns on g7/h7, white knight on h6, white king on g1. White to move. Nf7# is the smothered mate pattern: the knight checks and every escape square is occupied by Black’s own pieces.',
    fen: '6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Smothered mate',
    solution: ['Nf7#'],
    hints: [
      'The king looks safe in the corner — but count how many of its own pieces block escape squares.',
      'A knight check cannot be blocked. Can it land on f7 with mate?',
      'Play Nf7#. The king is smothered by its own pawns and rook.',
    ],
    explanation:
      'Nf7# is the classic smothered mate: the knight checks on f7 and the king cannot move because g7, h7, and g8 are blocked by friendly pieces. Knights are uniquely dangerous in cramped corners.',
  },
  {
    id: 'adv-heavy-piece-duel',
    title: 'Win the Exchange on e7',
    positionSummary:
      'Open e-file: black king on g8, black queen on e7, black rook on e8, white queen on e2, white rook on e3, kingside pawns still on f7/g7/h7. White to move. Rxe7 starts a sequence where White’s queen recaptures and emerges with queen versus rook — a winning material advantage.',
    fen: '4r1k1/4qppp/8/8/8/4R3/4Q3/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Battery overload',
    solution: ['Rxe7'],
    hints: [
      'Count attackers and defenders on e7. Who has more firepower aimed at that square?',
      'When you capture on e7, how does Black recapture, and what does your queen do next?',
      'Play Rxe7. After …Rxe7, Qxe7 wins the queen for a rook.',
    ],
    explanation:
      'Rxe7 overloads the defender: …Rxe7 Qxe7 leaves White with queen versus rook. The tactic works because two white pieces attack e7 while only the black queen defends.',
  },
  {
    id: 'adv-discovered-diagonal',
    title: 'Pawn Clears the Long Diagonal',
    positionSummary:
      'Black king on g7, black queen on h8, white bishop on a1, white pawn on d4, white king on g1. White to move. d5+ uncovers the bishop’s diagonal to the king; after the king moves, Bxh8 wins the queen.',
    fen: '7q/6k1/8/8/3P4/8/8/B5K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Discovered check',
    solution: ['d5+'],
    hints: [
      'Your bishop wants to see the king on g7, but your pawn blocks the diagonal.',
      'Advancing the pawn can give check and open the line to the queen on h8.',
      'Play d5+. When the king moves, take the queen on h8 with the bishop.',
    ],
    explanation:
      'd5+ is a discovered check: the pawn moves, the bishop checks the king, and the queen on h8 is x-rayed. After the king sidesteps, Bxh8 wins the queen.',
  },
  {
    id: 'adv-promotion-race',
    title: 'Queen With a Tempo',
    positionSummary:
      'Pawn ending race: white pawn on a7, black king on b7, black pawn on e2, white king on g2. White to move. Promoting to a queen with check wins the race because Black must lose a move answering the check instead of pushing …e1.',
    fen: '8/Pk6/8/8/8/8/4p1K1/8 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Pawn race',
    solution: ['a8=Q+'],
    hints: [
      'Both sides are one push from a new queen. Who gets there first with an extra threat attached?',
      'Promotion with check steals a tempo — the opponent must move the king instead of promoting.',
      'Play a8=Q+. The check buys time to stop the black e-pawn afterward.',
    ],
    explanation:
      'a8=Q+ promotes with check, forcing the king to move. White then stops the e-pawn before it queens. In pawn races, promotion with check is often the tiebreaker.',
  },
  {
    id: 'adv-pawn-breakthrough',
    title: 'Break the Pawn Wall',
    positionSummary:
      'Symmetric pawn tension on the queenside: white pawns on a5/b5/c5, black pawns on a7/b7/c7, kings on e1 and e7. White to move. b6 cracks the structure — whichever way Black captures, White gets a passed pawn that promotes first.',
    fen: '8/p3kppp/8/PPP5/8/8/8/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Pawn breakthrough',
    solution: ['b6'],
    hints: [
      'Three versus three pawns — who promotes first if you sacrifice one pawn to open a lane?',
      'Pushing b6 forces Black to capture; work through each recapture and see which pawn runs.',
      'Play b6. In every line White’s a- or c-pawn queens ahead of Black.',
    ],
    explanation:
      'b6 is a pawn breakthrough: after …axb6 cxb6 or …cxb6 axb6, White’s remaining pawn sprints while Black’s pawns are tied down. Calculation, not strength, decides the race.',
  },

  // ── Expert (5) — deepest ideas, still with real material on the board ───
  {
    id: 'exp-underpromotion-fork',
    title: 'Knight Promotion Wins the Queen',
    positionSummary:
      'White pawn on c7 about to promote, black king on e7, black queen on d6, white king on e1. White to move. Promoting to a knight on c8 gives check and forks king and queen — a queen promotion would not attack both at once.',
    fen: '8/2P1k3/3q4/8/8/8/8/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Underpromotion',
    solution: ['c8=N+'],
    hints: [
      'You are about to promote — but which piece reaches d6 and e7 in a single move?',
      'A queen on c8 does not fork king and queen. What minor piece does?',
      'Promote to a knight on c8 with check. After the king moves, take the queen on d6.',
    ],
    explanation:
      'c8=N+ underpromotes to a knight because only a knight checks the king and attacks the queen simultaneously. Expert players compare all four promotion choices, not just the queen.',
  },
  {
    id: 'exp-bishop-seals-mate',
    title: 'Back Rank With a Hidden Bishop',
    positionSummary:
      'Black king on g8 behind pawns on f7/g7/h7, black rook on e8, white rook on e1, white bishop on d5, white pawns on g2/h2. White to move. Rxe8# looks like a simple capture, but the real point is that the bishop on d5 covers f7 — the king’s only flight — so the back-rank capture is mate, not just a trade.',
    fen: '4r1k1/6pp/8/3B4/8/8/6PP/4R1K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Back-rank mate',
    solution: ['Rxe8#'],
    hints: [
      'Before capturing on e8, list every square the black king could run to after …Rxe8.',
      'The bishop on d5 looks quiet. Does it control f7 along the diagonal?',
      'Play Rxe8#. The rook checks along the eighth rank and f7 is covered by the bishop.',
    ],
    explanation:
      'Rxe8# is a back-rank mate with a quiet bishop controlling f7. The king cannot escape to f8, h8, g7, or h7. Expert players scan for long-range pieces that seal the last flight square.',
  },
  {
    id: 'exp-double-check',
    title: 'Two Checks, One Leap',
    positionSummary:
      'Black king on e8, black rook on a8, white knight on e6, white rook on e1 on the same file. White to move. Nc7+ is a double check: the knight checks and unmasks the rook on e1 — the king must move and the rook on a8 falls next.',
    fen: 'r3k3/8/4N3/8/8/8/8/4R2K w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Double check',
    solution: ['Nc7+'],
    hints: [
      'The knight on e6 blocks your rook from the enemy king. Where can the knight jump with check?',
      'A double check means two pieces check at once — only a king move is legal.',
      'Play Nc7+. After the king moves, Nxa8 wins the rook.',
    ],
    explanation:
      'Nc7+ is a double check: the knight and rook both attack the king. The king must move, then Nxa8 wins the rook. Double checks are the most forcing checks in chess.',
  },
  {
    id: 'exp-pin-and-mate',
    title: 'Pinned Pawn, Supported Queen',
    positionSummary:
      'Black king on e8, black pawn on e7 pinned to the king, black rook on a8, white queen on e2, white knight on g6, white king on e1. White to move. Qxe7# captures the pinned pawn — the king cannot recapture because the knight defends the queen with check.',
    fen: 'r3k3/4ppp1/6N1/8/8/8/4Q3/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Pin & mate',
    solution: ['Qxe7#'],
    hints: [
      'The e7 pawn cannot move because it would expose the king. Who guards the e7 square after Qxe7?',
      'If the king captures the queen, is it legal — or is it still in check from the knight?',
      'Play Qxe7#. The pawn is pinned and the king has no escape.',
    ],
    explanation:
      'Qxe7# combines pin and mate: the e7-pawn is pinned, and Kxe7 is illegal because the knight on g6 still checks. The queen also covers every king flight square.',
  },
  {
    id: 'exp-coordinated-mate',
    title: 'Knight and Rook Cage the King',
    positionSummary:
      'Black king on h8, black pawns on g7/h7, white rook on g7, white knight on f6, white king on g1. White to move. Rh7# mates: the rook checks, the knight covers g8 and defends the rook, and the king cannot capture or flee.',
    fen: '7k/6R1/5N2/8/8/8/8/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Coordinated mate',
    solution: ['Rh7#'],
    hints: [
      'The knight on f6 already covers g8. How can the rook deliver check while staying safe?',
      'If the rook checks on h7, can the king capture it or slip away?',
      'Play Rh7#. The knight defends the rook and covers g8 — mate.',
    ],
    explanation:
      'Rh7# is a coordinated mate: the rook checks, the knight defends the rook and covers g8, and Kxh7 is impossible because of the knight. Piece teamwork creates mating nets single pieces cannot.',
  },
];

export function puzzleScore(hintsUsed: number, completed: boolean): number {
  if (!completed) return 0;
  if (hintsUsed <= 0) return 100;
  if (hintsUsed === 1) return 60;
  if (hintsUsed === 2) return 30;
  return 10;
}
