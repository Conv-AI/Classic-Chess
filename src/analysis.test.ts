import { describe, expect, it } from 'vitest';
import { identifyOpening } from './analysis';

describe('analysis helpers', () => {
  it('identifies common openings from SAN prefixes', () => {
    expect(identifyOpening(['e4', 'c5', 'Nf3'])).toBe('Sicilian Defense');
    expect(identifyOpening(['d4', 'd5', 'c4'])).toBe("Queen's Gambit");
  });

  it('falls back for unknown openings', () => {
    expect(identifyOpening(['h4', 'a5'])).toBe('Unclassified opening');
  });
});
