import type { CoachId, DifficultyId } from './coachConfig';

export type MoveSnapshot = {
  san: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  color: 'w' | 'b';
  by: string;
  fenBefore: string;
  fenAfter: string;
};

export type KeyMoment = {
  moveNumber: number;
  label: string;
  description: string;
  bestMove?: string;
};

export type AnalysisSummary = {
  opening: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  keyMoments: KeyMoment[];
  tips: string[];
};

export type StoredGameSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  mode: 'quick-play' | 'puzzle';
  coachId: CoachId;
  difficultyId: DifficultyId;
  result: string;
  finalFen: string;
  hintsUsed: number;
  moves: MoveSnapshot[];
  analysis?: AnalysisSummary;
};

const STORAGE_KEY = 'classic-chess.sessions.v1';

export function loadSessions(): StoredGameSession[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSession(session: StoredGameSession): void {
  const sessions = loadSessions();
  const next = [session, ...sessions.filter((item) => item.id !== session.id)].slice(0, 50);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function deleteSession(id: string): void {
  const next = loadSessions().filter((session) => session.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function createSessionId(): string {
  return `game-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
