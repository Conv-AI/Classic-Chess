import { Chess, type Move } from 'chess.js';
import { chooseDanielleMove, evaluateFen } from './chessAi';

// Centipawn magnitude used to represent a forced mate when folding the engine's
// "score mate N" into a single white-relative centipawn number.
const MATE_CP = 10000;

type SearchResult = {
  bestUci: string | null;
  scoreCp: number | null; // side-to-move relative
  mate: number | null; // side-to-move relative (positive = side to move mates)
};

type PendingSearch = {
  resolve: (result: SearchResult) => void;
  timeoutId: number;
  scoreCp: number | null;
  mate: number | null;
};

export type PositionEval = {
  bestMove: Move | null;
  whiteCp: number; // white-relative centipawns (positive favors White)
};

class StockfishEngine {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private pending: PendingSearch | null = null;
  private currentSkill: number | null = null;

  async bestMove(fen: string, moveTimeMs = 700, skillLevel = 12): Promise<Move | null> {
    if (typeof Worker === 'undefined') return chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null;

    try {
      const { bestUci } = await this.runSearch(fen, moveTimeMs, skillLevel);
      if (bestUci) return this.uciToMove(fen, bestUci) ?? chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null;
      return chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null;
    } catch (err) {
      console.warn('[Stockfish] Falling back to local AI:', err);
      return chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null;
    }
  }

  // Evaluate a position for post-game analysis: returns the engine's best move plus
  // a white-relative centipawn score so callers can measure how much a played move
  // changed the evaluation. Analysis should run at full strength regardless of the
  // difficulty the game was played at, so the default skill is 20.
  async analyzePosition(fen: string, moveTimeMs = 300, skillLevel = 20): Promise<PositionEval> {
    const sideToMove = fen.split(' ')[1] === 'b' ? -1 : 1;
    const localFallback = (): PositionEval => ({
      bestMove: chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null,
      whiteCp: clampCp(evaluateFen(fen)),
    });

    if (typeof Worker === 'undefined') return localFallback();

    try {
      const { bestUci, scoreCp, mate } = await this.runSearch(fen, moveTimeMs, skillLevel);
      const bestMove = bestUci
        ? this.uciToMove(fen, bestUci) ?? chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null
        : chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null;

      let whiteCp: number;
      if (mate !== null) {
        whiteCp = (mate > 0 ? MATE_CP : -MATE_CP) * sideToMove;
      } else if (scoreCp !== null) {
        whiteCp = scoreCp * sideToMove;
      } else {
        whiteCp = evaluateFen(fen);
      }
      return { bestMove, whiteCp: clampCp(whiteCp) };
    } catch (err) {
      console.warn('[Stockfish] analyzePosition fallback:', err);
      return localFallback();
    }
  }

  private async runSearch(fen: string, moveTimeMs: number, skillLevel: number): Promise<SearchResult> {
    const worker = await this.getWorker();
    await this.ensureReady(worker);
    this.setSkill(worker, skillLevel);

    return await new Promise<SearchResult>((resolve) => {
      if (this.pending) {
        window.clearTimeout(this.pending.timeoutId);
        this.pending.resolve({ bestUci: null, scoreCp: null, mate: null });
      }

      this.pending = {
        resolve,
        scoreCp: null,
        mate: null,
        timeoutId: window.setTimeout(() => {
          this.pending = null;
          resolve({ bestUci: null, scoreCp: null, mate: null });
        }, Math.max(1800, moveTimeMs + 1200)),
      };

      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go movetime ${moveTimeMs}`);
    });
  }

  private async getWorker() {
    if (this.worker) return this.worker;

    const workerUrl = `${import.meta.env.BASE_URL}stockfish/stockfish-18-lite-single.js`;
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (event: MessageEvent) => this.handleMessage(String(event.data ?? ''));
    this.worker.onerror = (event) => {
      console.warn('[Stockfish] Worker error:', event.message);
    };
    return this.worker;
  }

  private ensureReady(worker: Worker) {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise<void>((resolve) => {
      const listener = (event: MessageEvent) => {
        const line = String(event.data ?? '');
        if (line.includes('uciok')) {
          worker.removeEventListener('message', listener);
          worker.postMessage('isready');
          resolve();
        }
      };
      worker.addEventListener('message', listener);
      worker.postMessage('uci');
    });

    return this.readyPromise;
  }

  private setSkill(worker: Worker, skillLevel: number) {
    const clamped = Math.max(1, Math.min(20, Math.round(skillLevel)));
    if (this.currentSkill === clamped) return;
    worker.postMessage(`setoption name Skill Level value ${clamped}`);
    if (clamped >= 20) {
      worker.postMessage('setoption name UCI_LimitStrength value false');
    } else {
      worker.postMessage('setoption name UCI_LimitStrength value true');
    }
    this.currentSkill = clamped;
  }

  private handleMessage(line: string) {
    if (!this.pending) return;

    if (line.startsWith('info ')) {
      // Track the most recent evaluation reported during the search. The last
      // score line before "bestmove" reflects the engine's final assessment.
      const mateMatch = line.match(/score mate (-?\d+)/);
      const cpMatch = line.match(/score cp (-?\d+)/);
      if (mateMatch) {
        this.pending.mate = Number(mateMatch[1]);
        this.pending.scoreCp = null;
      } else if (cpMatch) {
        this.pending.scoreCp = Number(cpMatch[1]);
        this.pending.mate = null;
      }
      return;
    }

    if (line.startsWith('bestmove ')) {
      const [, bestMove] = line.split(/\s+/);
      const pending = this.pending;
      this.pending = null;
      window.clearTimeout(pending.timeoutId);
      pending.resolve({ bestUci: bestMove || null, scoreCp: pending.scoreCp, mate: pending.mate });
    }
  }

  private uciToMove(fen: string, uci: string): Move | null {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
    const game = new Chess(fen);
    const move = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || 'q',
    });
    return move || null;
  }
}

function clampCp(cp: number): number {
  return Math.max(-MATE_CP, Math.min(MATE_CP, Math.round(cp)));
}

function fallbackDepth(skillLevel: number) {
  if (skillLevel >= 18) return 3;
  if (skillLevel >= 10) return 2;
  return 1;
}

export const stockfishEngine = new StockfishEngine();
