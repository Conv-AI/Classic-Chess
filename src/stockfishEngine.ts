import { Chess, type Move } from 'chess.js';
import { chooseDanielleMove } from './chessAi';

type PendingSearch = {
  resolve: (uciMove: string | null) => void;
  timeoutId: number;
};

class StockfishEngine {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private pending: PendingSearch | null = null;
  private currentSkill: number | null = null;

  async bestMove(fen: string, moveTimeMs = 700, skillLevel = 12): Promise<Move | null> {
    if (typeof Worker === 'undefined') return chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null;

    try {
      const worker = await this.getWorker();
      await this.ensureReady(worker);
      this.setSkill(worker, skillLevel);

      return await new Promise<string | null>((resolve) => {
        if (this.pending) {
          window.clearTimeout(this.pending.timeoutId);
          this.pending.resolve(null);
        }

        this.pending = {
          resolve,
          timeoutId: window.setTimeout(() => {
            this.pending = null;
            resolve(null);
          }, Math.max(1800, moveTimeMs + 1200)),
        };

        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go movetime ${moveTimeMs}`);
      }).then((uciMove) => {
        if (uciMove) return this.uciToMove(fen, uciMove);
        return chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null;
      });
    } catch (err) {
      console.warn('[Stockfish] Falling back to local AI:', err);
      return chooseDanielleMove(fen, fallbackDepth(skillLevel)) ?? null;
    }
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
    if (!line.startsWith('bestmove ') || !this.pending) return;
    const [, bestMove] = line.split(/\s+/);
    const pending = this.pending;
    this.pending = null;
    window.clearTimeout(pending.timeoutId);
    pending.resolve(bestMove || null);
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

function fallbackDepth(skillLevel: number) {
  if (skillLevel >= 18) return 3;
  if (skillLevel >= 10) return 2;
  return 1;
}

export const stockfishEngine = new StockfishEngine();
