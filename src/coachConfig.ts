import { loadCustomCoaches, storedCoachToConfig } from './customCoaches';

export type BuiltinCoachId = 'magnus' | 'sofia' | 'arjun' | 'leila';
export type CoachId = BuiltinCoachId | `custom-${string}`;

export type DifficultyId = 'new' | 'beginner' | 'intermediate' | 'advanced' | 'expert';

export const DEFAULT_PORTRAIT_FILE = 'coach-portraits/leila.png';

export type CoachConfig = {
  id: CoachId;
  name: string;
  title: string;
  assetName: 'Vincent' | 'Tyler' | 'Cassandra' | 'Leila';
  portraitFile: string;
  /** Vertical focus when baking menu thumbs — must match scripts/coachPortraitCrop.mjs */
  portraitFocusY?: number;
  modelFile: string;
  idleFile: string;
  /** LTM-enabled Convai character for signed-in Google users. */
  characterId: string;
  /** Optional LTM-disabled clone for anonymous guests (env: VITE_CONVAI_GUEST_CHARACTER_*). */
  guestCharacterId?: string;
  bgColor: string;
  accent: string;
  stockfishRange: [number, number];
  difficultyIds: DifficultyId[];
  voiceStyle: string;
  chessFocus: string;
  promptStyle: string;
  hintStyle: string;
};

export type DifficultyConfig = {
  id: DifficultyId;
  label: string;
  stockfishSkill: number;
  elo: string;
  moveTimeMs: number;
  commentary: string;
  curriculum: string;
  explanationDepth: string;
};

export const DIFFICULTIES: DifficultyConfig[] = [
  {
    id: 'new',
    label: 'New',
    stockfishSkill: 2,
    elo: '<= 800',
    moveTimeMs: 520,
    commentary: 'Simple, encouraging, and focused on one idea at a time.',
    curriculum: 'piece names, legal moves, checks, captures, threats, king safety, defended and undefended pieces, basic development, and why castling matters',
    explanationDepth: 'Use plain beginner language. Explain one chess idea with no jargon unless you immediately define it.',
  },
  {
    id: 'beginner',
    label: 'Beginner',
    stockfishSkill: 5,
    elo: '800-1200',
    moveTimeMs: 650,
    commentary: 'Pattern-focused tactical hints and clear corrections.',
    curriculum: 'opening principles, loose pieces, simple pins and forks, piece safety, center control, castling, and the checks-captures-threats thinking routine',
    explanationDepth: 'Use clear teaching language. Name common patterns and briefly explain why they matter.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    stockfishSkill: 12,
    elo: '1200-1600',
    moveTimeMs: 850,
    commentary: 'Strategic ideas, opening principles, and candidate moves.',
    curriculum: 'candidate moves, forcing lines, development lead, pawn breaks, weak squares, pins, discovered attacks, outposts, open files, and basic endgame conversion',
    explanationDepth: 'Use real chess vocabulary and connect the move to a plan or calculation line.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    stockfishSkill: 19,
    elo: '1600-2000',
    moveTimeMs: 1100,
    commentary: 'Concise, precise notes on turning points.',
    curriculum: 'calculation trees, prophylaxis, initiative, imbalances, pawn structure, exchange decisions, converting advantages, defensive resources, and engine-style candidate comparison',
    explanationDepth: 'Be concise but dense. Reference concrete chess concepts and explain the critical branch.',
  },
  {
    id: 'expert',
    label: 'Expert',
    stockfishSkill: 20,
    elo: '2000+',
    moveTimeMs: 1450,
    commentary: 'Minimal live commentary with deeper post-game review.',
    curriculum: 'evaluation swings, move-order nuance, strategic concessions, endgame tablebase-style precision, defensive resources, and long forcing variations',
    explanationDepth: 'Assume a strong student. Use compact expert language and focus only on critical moments.',
  },
];

export const COACHES: CoachConfig[] = [
  {
    id: 'magnus',
    name: 'Magnus',
    title: 'The Grandmaster',
    assetName: 'Vincent',
    portraitFile: 'coach-portraits/magnus.png',
    portraitFocusY: 14,
    modelFile: 'magnus.glb',
    idleFile: 'magnus-animations.glb',
    characterId: 'da1ff068-477c-11f1-a121-42010a7be02c',
    bgColor: '#d4dce8',
    accent: '#4d6b8f',
    stockfishRange: [18, 20],
    difficultyIds: ['advanced', 'expert'],
    voiceStyle: 'Measured, sparse, authoritative.',
    chessFocus: 'Positional understanding, conversion, long-term plans.',
    promptStyle: 'I speak as Magnus in first person, never as an outside narrator. I reference concrete calculation, evaluation, and study themes such as prophylaxis, weak squares, conversion, and endgame technique.',
    hintStyle: 'I give the smallest useful clue first, then the candidate idea, then the move. I connect each hint to a serious study habit such as candidate moves or prophylaxis.',
  },
  {
    id: 'sofia',
    name: 'Sofia',
    title: 'The Tactician',
    assetName: 'Cassandra',
    portraitFile: 'coach-portraits/sofia.png',
    portraitFocusY: 14,
    modelFile: 'sofia.glb',
    idleFile: 'sofia-animations.glb',
    characterId: '9f3c8e20-477c-11f1-a6c8-42010a7be02c',
    bgColor: '#d0ddd5',
    accent: '#1f8a6b',
    stockfishRange: [12, 16],
    difficultyIds: ['intermediate', 'advanced'],
    voiceStyle: 'Punchy, direct, energetic about tactics.',
    chessFocus: 'Combinations, forcing moves, initiative, attacking chances.',
    promptStyle: 'I speak as Sofia in first person, never as an outside narrator. I make tactics feel like calculation class: checks, captures, threats, pins, forks, discovered attacks, deflection, overload, and king safety.',
    hintStyle: 'I point toward forcing moves first, then name the tactical motif, then give the move. I explain why the tactic works, not just that it works.',
  },
  {
    id: 'arjun',
    name: 'Arjun',
    title: 'The Patient Teacher',
    assetName: 'Tyler',
    portraitFile: 'coach-portraits/arjun.png',
    portraitFocusY: 15,
    modelFile: 'arjun.glb',
    idleFile: 'arjun-animations.glb',
    characterId: 'f465b7aa-477c-11f1-b82a-42010a7be02c',
    bgColor: '#ddd5d0',
    accent: '#b8684d',
    stockfishRange: [1, 6],
    difficultyIds: ['new', 'beginner'],
    voiceStyle: 'Warm, nurturing, explanatory.',
    chessFocus: 'Basics, piece safety, opening principles, confidence.',
    promptStyle: 'I speak as Arjun in first person, never as an outside narrator. I teach like a patient classroom coach: piece safety, development, center control, castling, simple tactics, and thinking routines.',
    hintStyle: 'I offer gentle scaffolding: first where to look, then the concept, then the move. I explain the why in beginner language.',
  },
  {
    id: 'leila',
    name: 'Leila',
    title: 'The Strategist',
    assetName: 'Leila',
    portraitFile: 'coach-portraits/leila.png',
    portraitFocusY: 14,
    modelFile: 'cc-female.glb',
    idleFile: 'cc-female-animations.glb',
    characterId: 'c1f0a244-477c-11f1-acd0-42010a7be02c',
    bgColor: '#e0d5dd',
    accent: '#8f5f86',
    stockfishRange: [10, 14],
    difficultyIds: ['beginner', 'intermediate', 'advanced'],
    voiceStyle: 'Reflective, considered, big-picture.',
    chessFocus: 'Pawn structures, piece activity, endgames, slow advantages.',
    promptStyle: 'I speak as Leila in first person, never as an outside narrator. I connect moves to plans using pawn structure, weak squares, outposts, open files, exchanges, endgames, and improving the worst piece.',
    hintStyle: 'I frame hints around the plan first: weak squares, pawn breaks, improving pieces, or simplifying. Then I reveal the move only when appropriate.',
  },
];

function guestCharacterIdFromEnv(coachId: BuiltinCoachId): string | undefined {
  const envByCoach: Record<BuiltinCoachId, string | undefined> = {
    magnus: import.meta.env.VITE_CONVAI_GUEST_CHARACTER_MAGNUS,
    sofia: import.meta.env.VITE_CONVAI_GUEST_CHARACTER_SOFIA,
    arjun: import.meta.env.VITE_CONVAI_GUEST_CHARACTER_ARJUN,
    leila: import.meta.env.VITE_CONVAI_GUEST_CHARACTER_LEILA,
  };
  const value = envByCoach[coachId]?.trim();
  return value || undefined;
}

for (const coach of COACHES) {
  if (coach.id === 'magnus' || coach.id === 'sofia' || coach.id === 'arjun' || coach.id === 'leila') {
    coach.guestCharacterId = guestCharacterIdFromEnv(coach.id);
  }
}

/** Signed-in users keep LTM characters; guests use optional LTM-off clones. */
export function resolveConvaiCharacterId(coach: CoachConfig, signedInWithLtm: boolean): string {
  if (signedInWithLtm) return coach.characterId;
  return coach.guestCharacterId?.trim() || coach.characterId;
}

export const DEFAULT_COACH = COACHES.find((c) => c.id === 'leila') ?? COACHES[3];
export const DEFAULT_DIFFICULTY = DIFFICULTIES[1];

export function getCoachPortraitUrl(coach: Pick<CoachConfig, 'portraitFile'>): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  return `${base}${coach.portraitFile || DEFAULT_PORTRAIT_FILE}`;
}

export function getCoachPortraitThumbUrl(coach: Pick<CoachConfig, 'portraitFile'>): string {
  const portrait = coach.portraitFile || DEFAULT_PORTRAIT_FILE;
  if (!/coach-portraits\/[^/]+\.png$/i.test(portrait)) {
    return getCoachPortraitUrl(coach);
  }
  return getCoachPortraitUrl({ portraitFile: portrait.replace(/\.png$/i, '-thumb.png') });
}

export function getAllCoaches(): CoachConfig[] {
  const custom = loadCustomCoaches().map(storedCoachToConfig);
  return [...COACHES, ...custom];
}

export function getCoach(id: CoachId): CoachConfig {
  const builtin = COACHES.find((coach) => coach.id === id);
  if (builtin) return builtin;
  const custom = loadCustomCoaches().find((c) => c.id === id);
  if (custom) return storedCoachToConfig(custom);
  return DEFAULT_COACH;
}

export function getDifficulty(id: DifficultyId): DifficultyConfig {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? DEFAULT_DIFFICULTY;
}

export function suggestedDifficultyForCoach(coach: CoachConfig, current: DifficultyConfig): DifficultyConfig {
  if (coach.difficultyIds.includes(current.id)) return current;
  return getDifficulty(coach.difficultyIds[0]);
}
