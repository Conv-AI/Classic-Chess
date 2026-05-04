export type CoachId = 'magnus' | 'sofia' | 'arjun' | 'leila';

export type DifficultyId = 'new' | 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type CoachConfig = {
  id: CoachId;
  name: string;
  title: string;
  assetName: 'Vincent' | 'Tyler' | 'Cassandra' | 'Danielle';
  modelFile: string;
  idleFile: string;
  characterId: string;
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
};

export const DIFFICULTIES: DifficultyConfig[] = [
  {
    id: 'new',
    label: 'New',
    stockfishSkill: 2,
    elo: '<= 800',
    moveTimeMs: 520,
    commentary: 'Simple, encouraging, and focused on one idea at a time.',
  },
  {
    id: 'beginner',
    label: 'Beginner',
    stockfishSkill: 5,
    elo: '800-1200',
    moveTimeMs: 650,
    commentary: 'Pattern-focused tactical hints and clear corrections.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    stockfishSkill: 12,
    elo: '1200-1600',
    moveTimeMs: 850,
    commentary: 'Strategic ideas, opening principles, and candidate moves.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    stockfishSkill: 19,
    elo: '1600-2000',
    moveTimeMs: 1100,
    commentary: 'Concise, precise notes on turning points.',
  },
  {
    id: 'expert',
    label: 'Expert',
    stockfishSkill: 20,
    elo: '2000+',
    moveTimeMs: 1450,
    commentary: 'Minimal live commentary with deeper post-game review.',
  },
];

export const COACHES: CoachConfig[] = [
  {
    id: 'magnus',
    name: 'Magnus',
    title: 'The Grandmaster',
    assetName: 'Vincent',
    modelFile: 'vincent.glb',
    idleFile: 'vincent-idle.glb',
    characterId: 'da1ff068-477c-11f1-a121-42010a7be02c',
    bgColor: '#d4dce8',
    accent: '#4d6b8f',
    stockfishRange: [18, 20],
    difficultyIds: ['advanced', 'expert'],
    voiceStyle: 'Measured, sparse, authoritative.',
    chessFocus: 'Positional understanding, conversion, long-term plans.',
    promptStyle: 'Speak rarely. Praise only specific, earned moves. Prefer exact concepts over enthusiasm.',
    hintStyle: 'Give the smallest useful clue first. Be direct and economical.',
  },
  {
    id: 'sofia',
    name: 'Sofia',
    title: 'The Tactician',
    assetName: 'Cassandra',
    modelFile: 'cassandra.glb',
    idleFile: 'cassandra-idle.glb',
    characterId: '9f3c8e20-477c-11f1-a6c8-42010a7be02c',
    bgColor: '#d0ddd5',
    accent: '#1f8a6b',
    stockfishRange: [12, 16],
    difficultyIds: ['intermediate', 'advanced'],
    voiceStyle: 'Punchy, direct, energetic about tactics.',
    chessFocus: 'Combinations, forcing moves, initiative, attacking chances.',
    promptStyle: 'Call out tactical chances quickly. Encourage energy, but be plain about blunders.',
    hintStyle: 'Point toward forcing moves: checks, captures, threats, and pins.',
  },
  {
    id: 'arjun',
    name: 'Arjun',
    title: 'The Patient Teacher',
    assetName: 'Tyler',
    modelFile: 'tyler.glb',
    idleFile: 'tyler-idle.glb',
    characterId: 'f465b7aa-477c-11f1-b82a-42010a7be02c',
    bgColor: '#ddd5d0',
    accent: '#b8684d',
    stockfishRange: [1, 6],
    difficultyIds: ['new', 'beginner'],
    voiceStyle: 'Warm, nurturing, explanatory.',
    chessFocus: 'Basics, piece safety, opening principles, confidence.',
    promptStyle: 'Explain the why in plain language. Never shame mistakes. Celebrate small wins.',
    hintStyle: 'Offer gentle scaffolding and name the idea before naming the move.',
  },
  {
    id: 'leila',
    name: 'Leila',
    title: 'The Strategist',
    assetName: 'Danielle',
    modelFile: 'danielle.glb',
    idleFile: 'danielle-idle.glb',
    characterId: 'c1f0a244-477c-11f1-acd0-42010a7be02c',
    bgColor: '#e0d5dd',
    accent: '#8f5f86',
    stockfishRange: [10, 14],
    difficultyIds: ['beginner', 'intermediate', 'advanced'],
    voiceStyle: 'Reflective, considered, big-picture.',
    chessFocus: 'Pawn structures, piece activity, endgames, slow advantages.',
    promptStyle: 'Connect moves to plans. Favor strategic explanation over tactical fireworks.',
    hintStyle: 'Frame hints around improving the worst piece or changing the pawn structure.',
  },
];

export const DEFAULT_COACH = COACHES[2];
export const DEFAULT_DIFFICULTY = DIFFICULTIES[1];

export function getCoach(id: CoachId): CoachConfig {
  return COACHES.find((coach) => coach.id === id) ?? DEFAULT_COACH;
}

export function getDifficulty(id: DifficultyId): DifficultyConfig {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? DEFAULT_DIFFICULTY;
}

export function suggestedDifficultyForCoach(coach: CoachConfig, current: DifficultyConfig): DifficultyConfig {
  if (coach.difficultyIds.includes(current.id)) return current;
  return getDifficulty(coach.difficultyIds[0]);
}
