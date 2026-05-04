import { describe, expect, it } from 'vitest';
import { normalizeLanguages, normalizeVoices } from './convaiCoreApi';

describe('Convai Core API helpers', () => {
  it('normalizes nested voice list responses', () => {
    const voices = normalizeVoices({
      Public: [
        {
          'Warm Voice': {
            voice_value: 'warm_voice',
            lang_codes: ['en-US', 'hi-IN'],
            gender: 'FEMALE',
            sample_link: 'https://example.com/sample.mp3',
          },
        },
      ],
    });

    expect(voices).toEqual([
      {
        name: 'Warm Voice',
        value: 'warm_voice',
        gender: 'FEMALE',
        languages: ['en-US', 'hi-IN'],
        sampleLink: 'https://example.com/sample.mp3',
      },
    ]);
  });

  it('normalizes nested language list responses', () => {
    const languages = normalizeLanguages([
      { 'en-US': { lang_code: 'en-US', lang_name: 'English' } },
      { 'hi-IN': { lang_code: 'hi-IN', lang_name: 'Hindi' } },
    ]);

    expect(languages).toEqual([
      { code: 'en-US', name: 'English' },
      { code: 'hi-IN', name: 'Hindi' },
    ]);
  });
});
