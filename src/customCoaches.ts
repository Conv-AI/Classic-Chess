import type { CoachConfig } from './coachConfig';
import { DEFAULT_PORTRAIT_FILE } from './coachConfig';

const STORAGE_KEY = 'classic-chess.customCoaches.v1';

export type StoredCustomCoach = {
  id: string;
  name: string;
  characterId: string;
  backstory: string;
  createdAt: string;
  speakingStyleDescription?: string;
  sampleDialogue?: string;
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
    assetName: 'Leila',
    portraitFile: DEFAULT_PORTRAIT_FILE,
    portraitFocusY: 13,
    modelFile: 'cc-female.glb',
    idleFile: 'cc-female-animations.glb',
    characterId: stored.characterId,
    bgColor: '#e0d5dd',
    accent: '#8f5f86',
    stockfishRange: [8, 14],
    difficultyIds: ['beginner', 'intermediate', 'advanced'],
    voiceStyle: stored.speakingStyleDescription?.trim() || 'Warm and adaptive.',
    chessFocus: stored.backstory.slice(0, 120) || 'General chess coaching.',
    promptStyle: [
      `I speak in first person as ${stored.name}. ${stored.backstory}`,
      stored.speakingStyleDescription?.trim() ? `Speaking style: ${stored.speakingStyleDescription.trim()}` : '',
      stored.sampleDialogue?.trim() ? `Sample lines in my voice: ${stored.sampleDialogue.trim()}` : '',
    ].filter(Boolean).join(' '),
    hintStyle: 'I give progressive hints tied to the position.',
  };
}
