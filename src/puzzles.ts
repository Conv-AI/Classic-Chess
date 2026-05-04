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
  {
    id: 'back-rank-mate-1',
    title: 'Back Rank Finish',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'new',
    theme: 'Checkmate pattern',
    solution: ['Re8#'],
    hints: [
      'Look at the black king and its escape squares.',
      'A rook check on the back rank can trap the king.',
      'Play Re8. The pawns block every escape square.',
    ],
    explanation: 'The rook reaches the back rank. Black has no legal escape because its own pawns seal the king in.',
  },
  {
    id: 'loose-queen-pin',
    title: 'Take the Queen',
    fen: '4k3/8/8/8/8/8/4q3/4K2R w K - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Piece safety',
    solution: ['Kxe2'],
    hints: [
      'Your king is in check, so solve that first.',
      'The checking piece is not protected.',
      'Play Kxe2. The safest answer is also a free queen.',
    ],
    explanation: 'When a checking piece is loose, capturing it can be the cleanest defense and the best material gain.',
  },
  {
    id: 'fork-basics',
    title: 'Knight Fork',
    fen: '4k3/8/3q4/5N2/8/8/8/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'beginner',
    theme: 'Fork',
    solution: ['Nxd6+'],
    hints: [
      'Knights are strongest when they win material with tempo.',
      'Find a capture that also gives check.',
      'Play Nxd6+. The queen falls and the king must respond.',
    ],
    explanation: 'The knight captures the queen and gives check at the same time. That forcing tempo wins decisive material.',
  },
  {
    id: 'endgame-opposition',
    title: 'Take the Opposition',
    fen: '8/8/8/8/4k3/8/8/4K3 w - - 0 1',
    sideToMove: 'w',
    difficultyId: 'intermediate',
    theme: 'King opposition',
    solution: ['Ke2'],
    hints: [
      'In king endings, one square can change everything.',
      'Move your king directly in front of the opponent with one square between.',
      'Play Ke2 to take the opposition.',
    ],
    explanation: 'Ke2 keeps the kings opposed and forces Black to yield ground. That is the core technique of many king endings.',
  },
  {
    id: 'defensive-resource',
    title: 'Find the Save',
    fen: '6k1/5ppp/8/8/8/5Q2/7P/6Kq b - - 0 1',
    sideToMove: 'b',
    difficultyId: 'advanced',
    theme: 'Defense',
    solution: ['Qxf3'],
    hints: [
      'You are under pressure, so search for active defense.',
      'Capturing the attacker often lowers danger immediately.',
      "Play Qxf3, removing White's queen before it becomes a problem.",
    ],
    explanation: "Black removes White's active queen. Strong defense often starts by eliminating the opponent's most dangerous piece.",
  },
];

export function puzzleScore(hintsUsed: number, completed: boolean): number {
  if (!completed) return 0;
  if (hintsUsed <= 0) return 100;
  if (hintsUsed === 1) return 60;
  if (hintsUsed === 2) return 30;
  return 10;
}
