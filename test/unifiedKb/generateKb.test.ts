import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { generateKb, type AnthropicMessagesClient } from '../../src/unifiedKb/generateKb.js';
import type { CompanyProfile } from '../../src/company/types.js';
import type { StaticKbContext } from '../../src/unifiedKb/promptBuilder.js';

const validKbMarkdown = readFileSync(
  path.join(import.meta.dirname, '..', '..', 'kb-source', 'verticals', 'law-firms.md'),
  'utf8',
);

const staticContext: StaticKbContext = {
  kbTemplate: 'template',
  compliancePatterns: 'compliance',
  languageDialectLayer: 'dialect',
  goldStandardExample: 'gold standard',
};

const profile: CompanyProfile = {
  company: { name: 'Track Dog Racing' },
  contact: {},
  background: { source: 'gbp', fetchedAt: new Date().toISOString() },
  services: {},
};

function fakeClient(response: { content: { type: string; text?: string }[]; stop_reason: string }): AnthropicMessagesClient {
  return {
    messages: {
      create: vi.fn(async () => response as unknown as Anthropic.Message),
    },
  };
}

describe('generateKb', () => {
  it('accepts a generated KB that has all required sections', async () => {
    const client = fakeClient({ content: [{ type: 'text', text: validKbMarkdown }], stop_reason: 'end_turn' });
    const result = await generateKb(profile, 'VERTICAL TEXT', 'Personal Injury', { apiKey: 'x', staticContext, client });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kbDoc.sections).toHaveLength(15);
      expect(result.rawMarkdown).toBe(validKbMarkdown.trim());
    }
  });

  it('joins multiple text blocks (e.g. alongside a thinking block) into one markdown document', async () => {
    const client = fakeClient({
      content: [
        { type: 'thinking', text: 'internal reasoning, not markdown' },
        { type: 'text', text: validKbMarkdown },
      ],
      stop_reason: 'end_turn',
    });
    const result = await generateKb(profile, 'VERTICAL TEXT', 'Personal Injury', { apiKey: 'x', staticContext, client });
    expect(result.ok).toBe(true);
  });

  it('rejects a generated KB missing the non-negotiable compliance section', async () => {
    const missingCompliance = validKbMarkdown.replace(
      /## 5\. COMPLIANCE GUARDRAILS[\s\S]*?(?=\n## 6\. )/,
      '',
    );
    const client = fakeClient({ content: [{ type: 'text', text: missingCompliance }], stop_reason: 'end_turn' });
    const result = await generateKb(profile, 'VERTICAL TEXT', 'Personal Injury', { apiKey: 'x', staticContext, client });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/missing required section.*§5/);
    }
  });

  it('fails cleanly on a refusal stop reason rather than parsing garbage', async () => {
    const client = fakeClient({ content: [], stop_reason: 'refusal' });
    const result = await generateKb(profile, 'VERTICAL TEXT', 'Personal Injury', { apiKey: 'x', staticContext, client });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/refused/);
  });

  it('fails cleanly when the API call itself throws', async () => {
    const client: AnthropicMessagesClient = {
      messages: {
        create: vi.fn(async () => {
          throw new Error('network down');
        }),
      },
    };
    const result = await generateKb(profile, 'VERTICAL TEXT', 'Personal Injury', { apiKey: 'x', staticContext, client });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('network down');
  });

  it('passes grounding through into the actual API request when supplied', async () => {
    const client = fakeClient({ content: [{ type: 'text', text: validKbMarkdown }], stop_reason: 'end_turn' });
    await generateKb(profile, 'VERTICAL TEXT', 'Auto repair / mechanic', {
      apiKey: 'x',
      staticContext,
      client,
      grounding: { verticalBase: 'BASE LAYER CONTENT', nicheOverlay: 'OVERLAY CONTENT' },
    });

    const call = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const systemText = call.system.map((block: { text: string }) => block.text).join('\n');
    expect(systemText).toContain('BASE LAYER CONTENT');
    expect(systemText).toContain('OVERLAY CONTENT');
  });
});
