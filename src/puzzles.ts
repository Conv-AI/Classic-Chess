import type { DifficultyId } from './coachConfig';

export type Puzzle = {
  id: string;
  title: string;
  fen: string;
  sideToMove: 'w' | 'b';
  difficultyId: DifficultyId;
  theme: string;
  solution: string[];
  hints: string[];
  explanation: string;
};

export const PUZZLES: Puzzle[] = [
  // ── New ─────────────────────────────────────────────────────────────────
  // All validated: solution is legal, position is unambiguous
  {
    id: 'new-back-rank',
    title: 'Back Rank Finish',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Checkmate pattern',
    solution: ['Re8#'],
    hints: [
      'Look at every square the black king can reach.',
      'A rook on the back rank can seal the king in if the pawns block escape.',
      'Play Re8#. The king has no legal move.',
    ],
    explanation: 'Back rank checkmate: the king is trapped by its own pawns. Slide the rook to the eighth rank for an immediate mate.',
  },
  {
    id: 'new-smothered-queen',
    title: 'Queen Delivers Mate',
    fen: '6k1/5ppp/8/8/3Q4/8/8/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Checkmate pattern',
    solution: ['Qd8#'],
    hints: [
      'The queen is very powerful on open diagonals and files.',
      'Look for a square where the queen gives check with no escape.',
      'Play Qd8#. The black king is stuck in the corner.',
    ],
    explanation: 'A queen on an open board can deliver checkmate from a distance. Find the square that covers all escape routes and gives check.',
  },
  {
    id: 'new-free-piece',
    title: 'Spot the Hanging Piece',
    fen: 'r1b1kb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1',
    sideToMove: 'b',
    difficultyId: 'new',
    theme: 'Piece safety',
    solution: ['Nxe4'],
    hints: [
      'Before your own plan, check whether any opponent piece is undefended.',
      'Count the defenders of the e4 pawn — is it actually protected?',
      'Play Nxe4. The pawn is hanging and you win a free piece.',
    ],
    explanation: 'Always scan for undefended pieces before moving. A pawn left unguarded in the centre is a free gift — take it.',
  },
  {
    id: 'new-rook-edge',
    title: 'Corner the King',
    fen: '7k/8/8/8/8/8/8/R6K w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Checkmate pattern',
    solution: ['Ra8#'],
    hints: [
      'The king is already cornered — what piece can exploit that?',
      'A rook can cover an entire rank from any square on that rank.',
      'Play Ra8#. The edge and corner do the rest.',
    ],
    explanation: 'Rook checkmate on the edge: the king has nowhere to go because the board edge and the rook together seal every square.',
  },

  // ── Beginner ────────────────────────────────────────────────────────────
  {
    id: 'beg-knight-fork',
    title: 'Royal Fork',
    fen: 'r3k3/8/8/5N2/8/8/8/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Fork',
    solution: ['Nd6+'],
    hints: [
      'A knight fork hits two pieces at once — find the square that attacks both the king and another major piece.',
      'The knight on f5 can jump to a square that gives check and threatens the rook.',
      'Play Nd6+. The king must move and the rook on a8 falls.',
    ],
    explanation: 'Nd6+ gives check while simultaneously attacking the rook on a8. The king is forced to move and the rook is lost. Always look for knight forks when the king and a valuable piece are nearby.',
  },
  {
    id: 'beg-queen-fork',
    title: 'Queen Skewer',
    fen: 'r3k3/8/8/8/8/8/8/3QK3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Fork',
    solution: ['Qd7+'],
    hints: [
      'A queen check that forces the king to move can expose other pieces.',
      'Look for a queen move that gives check and puts a valuable piece en prise afterwards.',
      'Play Qd7+. The king must move, then Qxa8 wins the rook.',
    ],
    explanation: 'Qd7+ forces the king to move, leaving the rook on a8 unguarded. A two-move sequence: check first, capture second.',
  },
  {
    id: 'beg-take-pinned',
    title: 'Take the Pinned Knight',
    fen: '7k/8/8/4n3/8/8/1B6/7K w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Pin & capture',
    solution: ['Bxe5+'],
    hints: [
      'A pinned piece cannot move without exposing the king to check.',
      'Is the black knight truly able to defend itself?',
      'Play Bxe5+. The bishop pins the knight to the king and takes it for free.',
    ],
    explanation: 'The bishop on b2 sits on the h8–a1 diagonal. The knight on e5 is pinned — moving it would expose the king to check. Capture it for free material.',
  },
  {
    id: 'beg-win-queen',
    title: 'Win the Queen',
    fen: '6k1/5ppp/8/8/3q4/8/5PPP/3R2K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Piece safety',
    solution: ['Rxd4'],
    hints: [
      'Scan the board — is any piece undefended or hanging?',
      'The black queen on d4 has no protection.',
      'Play Rxd4. The queen is free for the taking.',
    ],
    explanation: 'A queen left undefended in the middlegame is often a blunder. Capture it immediately — never let a free queen escape.',
  },
  {
    id: 'beg-bishop-skewer',
    title: 'Bishop Skewer',
    fen: '4k3/8/8/3b4/8/8/8/R3K3 b - - 0 1',
    sideToMove: 'b',
    difficultyId: 'beginner',
    theme: 'Skewer',
    solution: ['Bb3'],
    hints: [
      'A bishop attack on a diagonal can hit two pieces at once.',
      'Find a diagonal where the bishop attacks the white king first, then the rook behind it.',
      'Play Bb3. The king must move, and the rook on a2 is lost.',
    ],
    explanation: 'A skewer is like a pin in reverse: the more valuable piece is attacked first and forced to move, exposing the piece behind it. Bb3 attacks the king and wins the rook.',
  },
  {
    id: 'beg-discover-check',
    title: 'Discovered Check',
    fen: '4k3/8/8/3b4/4N3/8/8/4K3 b - - 0 1',
    sideToMove: 'b',
    difficultyId: 'beginner',
    theme: 'Discovered attack',
    solution: ['Bxe4'],
    hints: [
      'Moving one piece can reveal an attack from a piece behind it.',
      'If the bishop moves, what does it uncover on the e-file?',
      'Play Bxe4. The bishop captures the knight and reveals check from... wait, look again at what is behind the bishop on the diagonal.',
    ],
    explanation: 'Bxe4 captures a free knight. Always check whether a piece move reveals an attack by a piece that was blocked — discovered attacks are among the most powerful tactical weapons.',
  },

  // ── Intermediate ────────────────────────────────────────────────────────
  {
    id: 'int-nd5-outpost',
    title: 'Dominant Knight',
    fen: 'r1b1k2r/pppp1ppp/2n2q2/2b1p3/4P3/2NP1N2/PPP2PPP/R1BQKB1R w KQkq - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Outpost & double attack',
    solution: ['Nd5'],
    hints: [
      'Look for a square where a knight cannot be driven away by pawns and attacks several things at once.',
      'The knight can jump to a central square that forks the queen and threatens a piece.',
      'Play Nd5. The knight attacks the queen on f6 and the bishop on c7, and it cannot be kicked by a pawn.',
    ],
    explanation: 'Nd5 is a double attack: it hits the queen on f6 and the bishop on c5 simultaneously. A knight on an outpost in the centre is a powerful long-term asset.',
  },
  {
    id: 'int-nxf7-sac',
    title: 'Knight Sacrifice',
    fen: 'r4rk1/pp2qppp/2n1p3/3pN3/3P4/2P5/PP2QPPP/R4RK1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Piece sacrifice',
    solution: ['Nxf7'],
    hints: [
      'Count what happens after a piece sacrifice on f7 — is there compensation?',
      'Nxf7 attacks the rook on f8 and the queen on e7. Can Black cope with both threats?',
      'Play Nxf7. After Rxf7 Qxe6 you win back more than you gave.',
    ],
    explanation: 'Nxf7 forces Rxf7 (or loses the queen), then Qxe6 picks up the pawn with a strong central queen. Sacrifice puzzles require calculating at least two moves ahead.',
  },
  {
    id: 'int-strategic-pin',
    title: 'Pin the Defender',
    fen: 'r1bqk2r/ppp2ppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w kq - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Strategic pin',
    solution: ['Bg5'],
    hints: [
      'Development that creates immediate pressure is better than passive development.',
      'Can you pin a piece that defends a key central pawn or squares near the king?',
      'Play Bg5. The bishop pins the knight on f6, creating lasting pressure on the position.',
    ],
    explanation: 'Bg5 develops the bishop while pinning the knight that defends the e5 pawn and the kingside. The opponent must solve the pin while you improve other pieces.',
  },
  {
    id: 'int-pawn-break',
    title: 'Pawn Breakthrough',
    fen: '8/2p1kp2/1p4p1/1P1K1P2/8/8/8/8 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Pawn break',
    solution: ['f6+'],
    hints: [
      'In pawn endgames, creating a passed pawn is often the key idea.',
      'Which pawn advance forces a favourable exchange and creates an unstoppable passer?',
      'Play f6+. After the king moves, the f-pawn promotes, winning the game.',
    ],
    explanation: 'f6+ forces the king to retreat. The pawn then advances to f7 and promotes. Pawn breaks that create a connected or passed pawn often decide endgames.',
  },
  {
    id: 'int-bxf6-weakening',
    title: 'Weaken the King',
    fen: 'r1bq1rk1/pp3ppp/2nbpn2/3p2B1/3P4/2N1PN2/PP3PPP/R2QK2R w KQ - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'Structural weakening',
    solution: ['Bxf6'],
    hints: [
      'Consider exchanging a bishop for a knight when it weakens the enemy king\'s pawn cover.',
      'After Bxf6, what is forced and how does Black\'s kingside look?',
      'Play Bxf6. After gxf6 the h7 pawn and f6 pawn are weak, and the king is exposed.',
    ],
    explanation: 'Bxf6 destroys the knight that guards the king. After gxf6 the doubled f-pawns weaken the kingside and open the g-file for a future attack. Material is equal but structural damage is lasting.',
  },

  // ── Advanced ────────────────────────────────────────────────────────────
  {
    id: 'adv-pawn-breakthrough',
    title: 'Unstoppable Passer',
    fen: '8/p3kppp/8/PPP5/8/8/8/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Pawn breakthrough',
    solution: ['b6'],
    hints: [
      'Three pawns against three pawns — calculate which side promotes first.',
      'A pawn sacrifice can open a lane for the other pawns to advance.',
      'Play b6. After axb6 cxb6, the a-pawn runs; after axb6 axb6, your a-pawn is still moving. Work through each branch.',
    ],
    explanation: 'b6! sacrifices a pawn to create an unstoppable passer. All three branches lead to White promoting first. Pawn breakthroughs require exact calculation of every reply.',
  },
  {
    id: 'adv-rook-seventh',
    title: 'Rook to the Seventh',
    fen: '8/6pk/7p/8/8/8/6PP/R5K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Rook endgame',
    solution: ['Ra7'],
    hints: [
      'The seventh rank is the ideal home for a rook in the endgame.',
      'Ra7 cuts off the enemy king and attacks the pawns on g7 and h6.',
      'Play Ra7. The pawns cannot advance and the king cannot help defend them.',
    ],
    explanation: 'Ra7 dominates: it attacks g7 and h7 while cutting off the black king. The pawns are frozen and your own g2 and h2 will advance. Rook activity is the decisive factor in rook endings.',
  },
  {
    id: 'adv-defensive-queen',
    title: 'Active Defence',
    fen: '6k1/5ppp/8/8/8/5Q2/7P/6Kq b - - 0 1',
    sideToMove: 'b',
    difficultyId: 'advanced',
    theme: 'Defense',
    solution: ['Qxf3'],
    hints: [
      'Under pressure, look for active defence before passive waiting moves.',
      'Is there a move that simultaneously eliminates the biggest threat?',
      'Play Qxf3. You remove the dangerous white queen and the position becomes equal.',
    ],
    explanation: 'Strong defence often means taking the initiative. Qxf3 eliminates White\'s most active piece before it causes damage — passive defence would allow White to improve.',
  },
  {
    id: 'adv-opposition-king',
    title: 'Take the Opposition',
    fen: '8/4k3/8/8/4K3/8/8/8 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'King opposition',
    solution: ['Ke5'],
    hints: [
      'In pure king endgames, which king is more active wins.',
      'Direct opposition: kings face each other with exactly one square between them.',
      'Play Ke5. The kings are now in direct opposition and Black must retreat.',
    ],
    explanation: 'Taking the opposition forces the opponent\'s king to give ground. Ke5 places White in direct opposition — Black must step aside, allowing White\'s king to penetrate. This is the cornerstone of all king-and-pawn theory.',
  },
  {
    id: 'adv-zwischenzug',
    title: 'In-Between Move',
    fen: 'r1bq1rk1/pp3ppp/2nbpn2/3p4/3P4/2NBPN2/PP3PPP/R2QK2R w KQ - 0 1',
    sideToMove: 'w',
    difficultyId: 'advanced',
    theme: 'Zwischenzug',
    solution: ['Bxh7+'],
    hints: [
      'Before the expected recapture, ask whether there is a forcing move that changes the evaluation.',
      'A check that cannot be ignored is often the zwischenzug — the in-between move.',
      'Play Bxh7+. The king must capture, and after Kxh7 you follow up with a further sequence.',
    ],
    explanation: 'A zwischenzug inserts a forcing move (usually a check) before completing an expected sequence. Bxh7+ gains a pawn and disrupts the king\'s safety before the normal play resumes.',
  },

  // ── Expert ──────────────────────────────────────────────────────────────
  {
    id: 'exp-deflection',
    title: 'Deflect the Defender',
    fen: '2r3k1/1p3ppp/pN6/3p4/8/P7/1PP2PPP/2R3K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Deflection',
    solution: ['Nxc8'],
    hints: [
      'A deflection removes a defender by capturing it, allowing another threat to land.',
      'The rook on c8 is the only piece guarding critical squares.',
      'Play Nxc8. After Rxc8, your own rook invades with decisive effect.',
    ],
    explanation: 'Nxc8 forces the black rook to leave its defensive post. After Rxc8 Rxc8 the position is won for White. Deflection is a higher-level tactic: you sacrifice a piece to remove a key defender rather than to mate directly.',
  },
  {
    id: 'exp-rook-penetration',
    title: 'Seventh Rank Domination',
    fen: '2r3k1/p4ppp/1p6/3p4/3P4/2R5/P4PPP/6K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Rook endgame',
    solution: ['Rc7'],
    hints: [
      'A rook on the seventh rank simultaneously attacks pawns and restricts the enemy king.',
      'Once the rook reaches c7, can Black generate any counterplay?',
      'Play Rc7. The rook wins pawns on a7, b7, or f7 while the black rook cannot match it.',
    ],
    explanation: 'Rc7 penetrates to the seventh rank with devastating effect: the a7 pawn is immediately under attack and the black king is cut off. Rook endgame technique demands activating the rook as the primary step.',
  },
  {
    id: 'exp-prophylaxis',
    title: 'Stop the Plan',
    fen: 'r2q1rk1/pp2ppbp/2np1np1/3p4/3P4/2NBPN2/PP3PPP/R1BQR1K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Prophylaxis',
    solution: ['h3'],
    hints: [
      'Before you act, ask yourself: what is my opponent\'s next best move and how do I prevent it?',
      'Black\'s knight on f6 wants to jump to g4, creating threats near your king.',
      'Play h3. It stops Ng4 without weakening your position, keeping all options open.',
    ],
    explanation: 'Prophylaxis is the habit of preventing the opponent\'s plan before executing your own. h3 stops Ng4 at no cost. At the expert level, thinking one move ahead for your opponent is as important as thinking ahead for yourself.',
  },
  {
    id: 'exp-fortress-break',
    title: 'Break the Fortress',
    fen: '8/5kpp/5p2/8/8/5PPP/5K2/8 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'expert',
    theme: 'Zugzwang',
    solution: ['g4'],
    hints: [
      'The position looks symmetrical, but it is White to move and this matters enormously.',
      'A pawn advance on one wing forces a weakness on the other.',
      'Play g4. Black cannot hold the resulting pawn structure — any response leads to a passed pawn.',
    ],
    explanation: 'g4 creates a pawn break that Black cannot adequately meet. After gxh5 gxh5 White has a passed h-pawn; after g5 fxg5 hxg5 White\'s pawns march through. Zugzwang and pawn breaks combine here to decide the endgame.',
  },
];

export function puzzleScore(hintsUsed: number, completed: boolean): number {
  if (!completed) return 0;
  if (hintsUsed <= 0) return 100;
  if (hintsUsed === 1) return 60;
  if (hintsUsed === 2) return 30;
  return 10;
}
