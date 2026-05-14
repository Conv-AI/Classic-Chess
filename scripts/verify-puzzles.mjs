/**
 * Puzzle verification helper.
 *
 * Usage:
 *   node scripts/verify-puzzles.mjs
 *
 * For each entry in `puzzles` below it prints:
 *   PASS  — the candidate SAN is in chess.js legal moves
 *   FAIL  — the candidate SAN is NOT legal; prints the actual legal list
 *   ERROR — the FEN is invalid
 *
 * It also prints the full legal-moves list so you can pick the exact SAN
 * (check/mate suffixes, disambiguation, promotion notation, etc.)
 */

import { Chess } from 'chess.js';

const puzzles = [
  // ── Puzzle 1 ──────────────────────────────────────────────────────────────
  {
    id: 'beg-pawn-fork',
    fen: '4k3/8/2n1n3/8/3P4/8/8/4K3 w - - 0 1',
    candidate: 'd5',
  },
  // ── Puzzle 2 ──────────────────────────────────────────────────────────────
  // King moved from e1 → g1 so the e-file is no longer putting White in check
  {
    id: 'beg-knight-fork-2',
    fen: '4r1k1/8/8/3N4/8/8/8/6K1 w - - 0 1',
    candidate: 'Nf6+',
  },
  // ── Puzzle 3 ──────────────────────────────────────────────────────────────
  {
    id: 'beg-rook-skewer',
    fen: '8/8/8/2k4r/8/8/8/R3K3 w - - 0 1',
    candidate: 'Ra5+',
  },
  // ── Puzzle 4 ──────────────────────────────────────────────────────────────
  {
    id: 'beg-backrank-2',
    fen: '6k1/5p1p/7K/8/8/8/8/1R6 w - - 0 1',
    candidate: 'Rb8#',
  },
  // ── Puzzle 5 ──────────────────────────────────────────────────────────────
  {
    id: 'beg-pin-rook',
    fen: '4k3/8/8/4n3/8/2B5/8/4R1K1 w - - 0 1',
    candidate: 'Bxe5',
  },
  // ── Puzzle 6 ──────────────────────────────────────────────────────────────
  {
    id: 'beg-queen-fork-2',
    fen: '1r5k/7b/8/8/8/8/8/4K2Q w - - 0 1',
    candidate: 'Qb7',
  },
  // ── Puzzle 7 ──────────────────────────────────────────────────────────────
  {
    id: 'beg-disc-check',
    fen: 'k1r5/N7/8/8/8/8/8/R3K3 w - - 0 1',
    candidate: 'Nxc8+',
  },
  // ── Puzzle 8 ──────────────────────────────────────────────────────────────
  {
    id: 'beg-queen-mate-2',
    fen: '8/8/8/k7/2K5/8/1Q6/8 w - - 0 1',
    candidate: 'Qb5#',
  },
  // ── Puzzle 9 ──────────────────────────────────────────────────────────────
  // Classic K+R corner mate: Ra8# with Kg6 covering g7/h7 escape squares
  {
    id: 'beg-rook-mate-2',
    fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
    candidate: 'Ra8#',
  },
  // ── Puzzle 10 ─────────────────────────────────────────────────────────────
  {
    id: 'beg-remove-defender',
    fen: '4k3/5r2/8/8/2b5/3P4/8/5RK1 w - - 0 1',
    candidate: 'dxc4',
  },
  // ── Expert bonus (to hit ≥5 threshold) ──────────────────────────────────
  {
    id: 'exp-underpromote-knight',
    fen: '8/2P1k3/3q4/8/8/8/8/4K3 w - - 0 1',
    candidate: 'c8=N+',
  },

  // ════════════════════════════════════════════════════════════════════════
  // INTERMEDIATE BATCH CANDIDATES
  // ════════════════════════════════════════════════════════════════════════

  // int-1: rook pins queen to king; bishop captures
  {
    id: 'int-pin-queen',
    fen: '3k4/8/8/3q4/8/8/6B1/3R2K1 w - - 0 1',
    candidate: 'Bxd5',
  },
  // int-2: zwischenzug — bishop check before expected rook exchange
  {
    id: 'int-zwischenzug',
    fen: '4r1k1/6pp/8/3B4/8/8/6PP/4R1K1 w - - 0 1',
    candidate: 'Bf7+',
  },
  // int-3: queen skewer along rank — check king, win rook behind
  {
    id: 'int-queen-skewer',
    fen: '8/8/8/2k4r/8/8/8/Q3K3 w - - 0 1',
    candidate: 'Qa5+',
  },
  // int-4: bishop sacrifice forks king + rook via two diagonals
  {
    id: 'int-bxc6',
    fen: 'r3k3/2r5/2p5/8/8/8/8/4K2B w - - 0 1',
    candidate: 'Bxc6+',
  },
  // int-5: rook to 7th rank with check
  {
    id: 'int-rook-7th',
    fen: '3k4/ppp5/8/8/8/8/PPP5/3R2K1 w - - 0 1',
    candidate: 'Rd7+',
  },
  // int-6: queen forks king and rook along rank
  {
    id: 'int-queen-rank-fork',
    fen: '8/8/8/1r4k1/8/8/8/4QK2 w - - 0 1',
    candidate: 'Qe5+',
  },
  // int-7: double check — knight captures rook AND reveals bishop check
  {
    id: 'int-double-check',
    fen: '8/6k1/4r3/8/3N4/8/8/B6K w - - 0 1',
    candidate: 'Nxe6+',
  },
  // int-8: knight forks king + queen
  {
    id: 'int-knight-fork-queen',
    fen: '3k4/8/8/2q5/3N4/8/8/4K3 w - - 0 1',
    candidate: 'Ne6+',
  },
  // int-9: bishop pins knight on diagonal; rook captures it
  {
    id: 'int-pin-diagonal',
    fen: '6k1/8/4n3/8/2B5/8/8/4R1K1 w - - 0 1',
    candidate: 'Rxe6',
  },
  // int-10: discovered double-threat — bishop moves off d-file revealing rook attack
  {
    id: 'int-disc-attack',
    fen: '3r2k1/5ppp/8/3B4/8/8/5PPP/3R2K1 w - - 0 1',
    candidate: 'Be6',
  },

  // ════════════════════════════════════════════════════════════════════════
  // ADVANCED BATCH CANDIDATES
  // ════════════════════════════════════════════════════════════════════════

  { id: 'adv-smothered-mate',         fen: '6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1',           candidate: 'Nf7#'  },
  { id: 'adv-queen-skewer-rank',      fen: '6kr/8/8/8/8/8/8/Q5K1 w - - 0 1',             candidate: 'Qa8+'  },
  { id: 'adv-pawn-race',              fen: '8/Pk6/8/8/8/8/4p1K1/8 w - - 0 1',            candidate: 'a8=Q+' },
  { id: 'adv-pin-knight-pawn',        fen: '8/8/5k2/4n3/3P4/8/8/4R1K1 w - - 0 1',        candidate: 'Rxe5'  },
  { id: 'adv-knight-royal-fork',      fen: '8/3q4/8/8/4N3/3k4/8/6K1 w - - 0 1',          candidate: 'Nc5+'  },
  { id: 'adv-rook-pin-queen-bishop',  fen: '6k1/8/4q3/8/2B5/8/8/4R1K1 w - - 0 1',        candidate: 'Rxe6'  },
  { id: 'adv-mate-rook-king',         fen: '7k/5K1p/8/8/8/8/8/R7 w - - 0 1',             candidate: 'Ra8#'  },
  { id: 'adv-disc-check-pawn',        fen: '7q/6k1/8/8/3P4/8/8/B5K1 w - - 0 1',          candidate: 'd5+'   },
  { id: 'adv-mate-queen-corner',      fen: 'r6k/6pp/8/3Q4/8/8/5PPP/3B2K1 w - - 0 1',     candidate: 'Qxa8#' },
  { id: 'adv-pinned-rook-mate',       fen: '4k3/4r3/6N1/8/8/8/8/4Q1K1 w - - 0 1',        candidate: 'Qxe7#' },

  // ════════════════════════════════════════════════════════════════════════
  // EXPERT BATCH CANDIDATES
  // ════════════════════════════════════════════════════════════════════════

  { id: 'exp-double-check',           fen: 'r3k3/8/4N3/8/8/8/8/4R2K w - - 0 1',          candidate: 'Nc7+'   },
  { id: 'exp-knight-rook-mate',       fen: '7k/6R1/5N2/8/8/8/8/6K1 w - - 0 1',           candidate: 'Rh7#'   },
  { id: 'exp-stack-attack',           fen: '4r1k1/4qppp/8/8/8/4R3/4Q3/6K1 w - - 0 1',    candidate: 'Rxe7'   },
  { id: 'exp-pin-pawn-mate',          fen: 'r3k3/4ppp1/6N1/8/8/8/4Q3/4K3 w - - 0 1',     candidate: 'Qxe7#'  },
  { id: 'exp-queen-takes-rook',       fen: 'r5k1/8/8/8/8/8/8/Q5K1 w - - 0 1',            candidate: 'Qxa8+'  },
  { id: 'exp-mate-N-blocks',          fen: '6k1/6pp/8/6N1/8/8/8/3R2K1 w - - 0 1',        candidate: 'Rd8#'   },
  { id: 'exp-rook-mate-opposition',   fen: '1k6/8/1K6/8/8/8/8/3R4 w - - 0 1',            candidate: 'Rd8#'   },
  { id: 'exp-knight-fork-K-R',        fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',           candidate: 'Nc7+'   },
  { id: 'exp-active-king',            fen: '8/8/5k2/8/2K5/8/8/3R4 w - - 0 1',            candidate: 'Kd5'    },
  { id: 'exp-skewer-h-file',          fen: '7r/7k/8/8/8/8/6K1/Q7 w - - 0 1',             candidate: 'Qh1+'   },
];

let passCount = 0;
let failCount = 0;

for (const { id, fen, candidate } of puzzles) {
  try {
    const g = new Chess(fen);
    const legal = g.moves();
    const sideLabel = g.turn() === 'w' ? 'White' : 'Black';

    if (legal.includes(candidate)) {
      console.log(`✅ PASS  [${id}]  ${sideLabel} plays ${candidate}`);
      passCount++;
    } else {
      console.log(`❌ FAIL  [${id}]  "${candidate}" not in legal moves`);
      console.log(`   Side to move : ${sideLabel}`);
      console.log(`   Legal moves  : ${legal.join('  ')}`);
      failCount++;
    }
  } catch (err) {
    console.log(`💥 ERROR [${id}]  ${err.message}`);
    failCount++;
  }
}

console.log(`\n${passCount} passed, ${failCount} failed`);
