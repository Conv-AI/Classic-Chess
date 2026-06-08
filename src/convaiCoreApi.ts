import { getConvaiApiKey } from './convaiApiKey';

const API_BASE = 'https://api.convai.com';

export type VoiceOption = {
  name: string;
  value: string;
  gender: string;
  languages: string[];
  sampleLink?: string;
};

export type LanguageOption = {
  code: string;
  name: string;
};

export type CreateCoachInput = {
  charName: string;
  voiceType: string;
  backstory: string;
  languageCodes: string[];
  model: string;
  temperature: number;
};

export type CreateCoachResult = {
  charID: string;
};

function apiHeaders() {
  return {
    'CONVAI-API-KEY': getConvaiApiKey(),
    'Content-Type': 'application/json',
  };
}

/** Model codes from Convai Core AI Settings API (docs.convai.com). */
export const MODEL_OPTIONS = [
  { label: 'Gemini 2.5 Flash Lite (recommended)', value: 'gemini-2.5-flash-lite' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
  { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
  { label: 'GPT-4.1', value: 'gpt-4.1' },
  { label: 'GPT-4.1 nano', value: 'gpt-4.1-nano' },
  { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'Claude 4 Sonnet', value: 'claude-4-sonnet' },
  { label: 'Claude 3.7 Sonnet', value: 'claude-3-7-sonnet' },
  { label: 'Claude Opus 4.1', value: 'claude-opus-4.1' },
  { label: 'Claude Opus 4', value: 'claude-opus-4' },
  { label: 'Gemma 3n e4b', value: 'gemma-3n-e4b' },
  { label: 'Gemma 3n e2b', value: 'gemma-3n-e2b' },
  { label: 'Llama 4 Maverick', value: 'llama-4-maverick' },
  { label: 'Llama 4 Scout', value: 'llama-4-scout' },
  { label: 'Llama 3.3 70B', value: 'llama-3-70B' },
];

export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

function languageMatches(voiceLang: string, selected: string): boolean {
  const v = voiceLang.toLowerCase();
  const s = selected.toLowerCase();
  if (v === s) return true;
  const vBase = v.split('-')[0];
  const sBase = s.split('-')[0];
  return vBase === sBase;
}

/** Voices whose lang_codes include the selected language (or same base locale). */
export function filterVoicesForLanguage(voices: VoiceOption[], languageCode: string): VoiceOption[] {
  if (!languageCode) return voices;
  const compatible = voices.filter((voice) =>
    voice.languages.some((code) => languageMatches(code, languageCode)),
  );
  return compatible.length > 0 ? compatible : voices;
}

export function pickDefaultVoice(voices: VoiceOption[], languageCode: string): string {
  const compatible = filterVoicesForLanguage(voices, languageCode);
  const english = compatible.find((v) =>
    v.languages.some((code) => code.toLowerCase().startsWith('en')),
  );
  return english?.value ?? compatible[0]?.value ?? voices[0]?.value ?? '';
}

export function hasConvaiApiKey(): boolean {
  return Boolean(getConvaiApiKey());
}

export async function fetchVoices(): Promise<VoiceOption[]> {
  const response = await fetch(`${API_BASE}/tts/get_available_voices`, { headers: apiHeaders() });
  if (!response.ok) throw new Error(`Voice list failed: ${response.status}`);
  return normalizeVoices(await response.json());
}

export async function fetchLanguages(): Promise<LanguageOption[]> {
  const response = await fetch(`${API_BASE}/tts/get_available_languages`, { headers: apiHeaders() });
  if (!response.ok) throw new Error(`Language list failed: ${response.status}`);
  return normalizeLanguages(await response.json());
}

export async function createCustomCoach(input: CreateCoachInput): Promise<CreateCoachResult> {
  const headers = apiHeaders();
  const createResponse = await fetch(`${API_BASE}/character/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      charName: input.charName,
      voiceType: input.voiceType,
      backstory: input.backstory,
    }),
  });
  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Character create failed: ${createResponse.status} ${body.slice(0, 120)}`);
  }

  const created = await createResponse.json();
  const charID = created.charID || created.character_id || created.id;
  if (!charID) throw new Error('Convai did not return a character id.');

  const updateResponse = await fetch(`${API_BASE}/character/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      charID,
      model_group_name: input.model,
      temperature: input.temperature,
      languageCodes: input.languageCodes,
    }),
  });
  if (!updateResponse.ok) {
    const body = await updateResponse.text();
    throw new Error(`Character update failed: ${updateResponse.status} ${body.slice(0, 120)}`);
  }

  return { charID };
}

export function normalizeVoices(payload: unknown): VoiceOption[] {
  if (!payload || typeof payload !== 'object') return [];
  const voices: VoiceOption[] = [];
  for (const section of Object.values(payload as Record<string, unknown>)) {
    if (!Array.isArray(section)) continue;
    for (const item of section) {
      if (!item || typeof item !== 'object') continue;
      for (const [name, details] of Object.entries(item as Record<string, unknown>)) {
        const data = details as Record<string, unknown>;
        const value = String(data.voice_value ?? '');
        if (!value) continue;
        voices.push({
          name,
          value,
          gender: String(data.gender ?? 'Unknown'),
          languages: Array.isArray(data.lang_codes) ? data.lang_codes.map(String) : [],
          sampleLink: typeof data.sample_link === 'string' ? data.sample_link : undefined,
        });
      }
    }
  }
  return voices;
}

export function normalizeLanguages(payload: unknown): LanguageOption[] {
  if (!Array.isArray(payload)) return [];
  const languages: LanguageOption[] = [];
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    for (const details of Object.values(item as Record<string, unknown>)) {
      if (!details || typeof details !== 'object') continue;
      const data = details as Record<string, unknown>;
      const code = String(data.lang_code ?? '');
      if (!code) continue;
      languages.push({ code, name: String(data.lang_name ?? code) });
    }
  }
  return languages;
}
