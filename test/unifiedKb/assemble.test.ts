import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { parseNicheAtlas } from '../../src/kb/atlasParser.js';
import { assembleUnifiedKb } from '../../src/unifiedKb/assemble.js';
import { loadKbGrounding } from '../../src/unifiedKb/kbLibrary.js';
import type { AnthropicMessagesClient } from '../../src/unifiedKb/generateKb.js';
import type { StaticKbContext } from '../../src/unifiedKb/promptBuilder.js';
import type { CompanyProfile } from '../../src/company/types.js';

const kbSourceDir = path.join(import.meta.dirname, '..', '..', 'kb-source');
const atlas = parseNicheAtlas(readFileSync(path.join(kbSourceDir, 'niche-atlas.md'), 'utf8'));
const validKbMarkdown = readFileSync(path.join(kbSourceDir, 'verticals', 'law-firms.md'), 'utf8');

const staticContext: StaticKbContext = {
  kbTemplate: 'template',
  compliancePatterns: 'compliance',
  languageDialectLayer: 'dialect',
  goldStandardExample: 'gold standard',
};

const profile: CompanyProfile = {
  company: { name: 'Track Dog Racing', website: 'https://trackdogracing.com' },
  contact: { phone: '214-340-9797' },
  background: { source: 'gbp', fetchedAt: new Date().toISOString() },
  services: {},
};

function fakeClient(markdown: string): AnthropicMessagesClient {
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: markdown }],
        stop_reason: 'end_turn',
      }) as unknown as Anthropic.Message),
    },
  };
}

describe('assembleUnifiedKb', () => {
  it('produces a UnifiedKb with the disclaimer injected and the parsed KB doc attached', async () => {
    const automotive = atlas.verticals.find((v) => v.name === 'Automotive')!;
    const result = await assembleUnifiedKb(profile, automotive, 'Auto repair / mechanic', {
      apiKey: 'x',
      staticContext,
      client: fakeClient(validKbMarkdown),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unifiedKb.vertical).toBe('Automotive');
    expect(result.unifiedKb.niche).toBe('Auto repair / mechanic');
    expect(result.unifiedKb.companyProfile.company.name).toBe('Track Dog Racing');
    expect(result.unifiedKb.kbDoc.sections).toHaveLength(15);
    expect(result.unifiedKb.disclaimer.en).toContain('Track Dog Racing');
    expect(result.unifiedKb.disclaimer.es).toContain('Track Dog Racing');
    expect(result.unifiedKb.rawMarkdown).toBe(validKbMarkdown.trim());
  });

  it('threads real base-layer + overlay grounding from kbLibrary through into the API request', async () => {
    const automotive = atlas.verticals.find((v) => v.name === 'Automotive')!;
    const grounding = loadKbGrounding(kbSourceDir, 'Automotive', 'Auto repair / mechanic');
    const client = fakeClient(validKbMarkdown);

    const result = await assembleUnifiedKb(profile, automotive, 'Auto repair / mechanic', {
      apiKey: 'x',
      staticContext,
      client,
      grounding,
    });

    expect(result.ok).toBe(true);
    const call = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const systemText = call.system.map((block: { text: string }) => block.text).join('\n');
    expect(systemText).toContain('authoritative source');
    expect(systemText).toContain('## A. Voice tuning');
  });

  it('propagates a generation failure without producing a partial UnifiedKb', async () => {
    const automotive = atlas.verticals.find((v) => v.name === 'Automotive')!;
    const result = await assembleUnifiedKb(profile, automotive, 'Auto repair / mechanic', {
      apiKey: 'x',
      staticContext,
      client: fakeClient('not a valid kb doc at all'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/missing required section/);
  });
});
