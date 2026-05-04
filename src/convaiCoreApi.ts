const API_KEY = import.meta.env.VITE_CONVAI_API_KEY as string;
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

const headers = {
  'CONVAI-API-KEY': API_KEY,
  'Content-Type': 'application/json',
};

export const MODEL_OPTIONS = [
  { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
  { label: 'GPT-4.1', value: 'gpt-4.1' },
  { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
  { label: 'Claude 4 Sonnet', value: 'claude-4-sonnet' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Llama 4 Scout', value: 'llama-4-scout' },
];

export function hasConvaiApiKey(): boolean {
  return Boolean(API_KEY);
}

export async function fetchVoices(): Promise<VoiceOption[]> {
  const response = await fetch(`${API_BASE}/tts/get_available_voices`, { headers });
  if (!response.ok) throw new Error(`Voice list failed: ${response.status}`);
  return normalizeVoices(await response.json());
}

export async function fetchLanguages(): Promise<LanguageOption[]> {
  const response = await fetch(`${API_BASE}/tts/get_available_languages`, { headers });
  if (!response.ok) throw new Error(`Language list failed: ${response.status}`);
  return normalizeLanguages(await response.json());
}

export async function createCustomCoach(input: CreateCoachInput): Promise<CreateCoachResult> {
  const createResponse = await fetch(`${API_BASE}/character/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      charName: input.charName,
      voiceType: input.voiceType,
      backstory: input.backstory,
    }),
  });
  if (!createResponse.ok) throw new Error(`Character create failed: ${createResponse.status}`);

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
  if (!updateResponse.ok) throw new Error(`Character update failed: ${updateResponse.status}`);

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
