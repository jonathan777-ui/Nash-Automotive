import { describe, expect, it } from 'vitest';
import { buildDisclaimer } from '../../src/unifiedKb/disclaimer.js';

describe('buildDisclaimer', () => {
  it('names the company in both languages and says it is a demo, not the live system', () => {
    const disclaimer = buildDisclaimer('Track Dog Racing');
    expect(disclaimer.en).toContain('Track Dog Racing');
    expect(disclaimer.en.toLowerCase()).toContain('ai demo');
    expect(disclaimer.en.toLowerCase()).toContain('not');
    expect(disclaimer.es).toContain('Track Dog Racing');
    expect(disclaimer.es.toLowerCase()).toContain('demostración de ia');
  });
});
