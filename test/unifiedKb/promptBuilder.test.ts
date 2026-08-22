import { describe, expect, it } from 'vitest';
import { buildSystemBlocks, buildUserMessage, type StaticKbContext } from '../../src/unifiedKb/promptBuilder.js';
import type { CompanyProfile } from '../../src/company/types.js';

const staticContext: StaticKbContext = {
  kbTemplate: '# KB TEMPLATE CONTENT',
  compliancePatterns: '# COMPLIANCE PATTERNS CONTENT',
  languageDialectLayer: '# LANGUAGE LAYER CONTENT',
  goldStandardExample: '# GOLD STANDARD CONTENT',
};

const profile: CompanyProfile = {
  company: { name: 'Track Dog Racing', address: '123 Race Way', website: 'https://trackdogracing.com' },
  contact: { phone: '214-340-9797' },
  background: { source: 'gbp', fetchedAt: new Date().toISOString(), description: 'Miata specialists.' },
  services: { weekdayDescriptions: ['Monday: 9-5', 'Tuesday: 9-5'] },
};

describe('buildSystemBlocks', () => {
  it('puts every static reference doc in the first block, ahead of the vertical-specific second block', () => {
    const blocks = buildSystemBlocks(staticContext, 'VERTICAL TEXT HERE');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toContain('KB TEMPLATE CONTENT');
    expect(blocks[0].text).toContain('COMPLIANCE PATTERNS CONTENT');
    expect(blocks[0].text).toContain('LANGUAGE LAYER CONTENT');
    expect(blocks[0].text).toContain('GOLD STANDARD CONTENT');
    expect(blocks[1].text).toContain('VERTICAL TEXT HERE');
  });

  it('marks both blocks cacheable, so a shared prefix survives across many companies in the same vertical', () => {
    const blocks = buildSystemBlocks(staticContext, 'VERTICAL TEXT HERE');
    for (const block of blocks) {
      expect(block.cache_control).toEqual({ type: 'ephemeral' });
    }
  });
});

describe('buildUserMessage', () => {
  it('includes the company facts and the target niche', () => {
    const message = buildUserMessage(profile, 'Performance/Tuning');
    expect(message).toContain('Track Dog Racing');
    expect(message).toContain('123 Race Way');
    expect(message).toContain('214-340-9797');
    expect(message).toContain('https://trackdogracing.com');
    expect(message).toContain('Monday: 9-5; Tuesday: 9-5');
    expect(message).toContain('Miata specialists.');
    expect(message).toContain('Performance/Tuning');
  });

  it('explicitly tells the model not to write the disclaimer itself', () => {
    const message = buildUserMessage(profile, 'Performance/Tuning');
    expect(message.toLowerCase()).toContain('do not include the standing ai-demo disclaimer');
  });

  it('falls back gracefully when hours are unknown', () => {
    const noHours: CompanyProfile = { ...profile, services: {} };
    const message = buildUserMessage(noHours, 'Performance/Tuning');
    expect(message).toMatch(/not known/);
  });
});
