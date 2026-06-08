import type { CoachConfig } from './coachConfig';

const STORAGE_KEY = 'classic-chess.customCoaches.v1';

export type StoredCustomCoach = {
  id: string;
  name: string;
  characterId: string;
  backstory: string;
  createdAt: string;
};

export function loadCustomCoaches(): StoredCustomCoach[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomCoach(entry: StoredCustomCoach): void {
  const existing = loadCustomCoaches().filter((c) => c.id !== entry.id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing].slice(0, 12)));
}

export function storedCoachToConfig(stored: StoredCustomCoach): CoachConfig {
  return {
    id: stored.id as CoachConfig['id'],
    name: stored.name,
    title: 'Custom Coach',
    assetName: 'Danielle',
    modelFile: 'danielle.glb',
    idleFile: 'danielle-idle.glb',
    characterId: stored.characterId,
    bgColor: '#e0d5dd',
    accent: '#8f5f86',
    stockfishRange: [8, 14],
    difficultyIds: ['beginner', 'intermediate', 'advanced'],
    voiceStyle: 'Warm and adaptive.',
    chessFocus: stored.backstory.slice(0, 120) || 'General chess coaching.',
    promptStyle: `I speak in first person as ${stored.name}. ${stored.backstory}`,
    hintStyle: 'I give progressive hints tied to the position.',
  };
}
