import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { parseNicheAtlas } from '../../src/kb/atlasParser.js';
import { loadStaticKbContext } from '../../src/unifiedKb/loadStaticContext.js';
import { generateDemo, type GenerateDemoDeps } from '../../src/server/generateDemo.js';
import type { AnthropicMessagesClient } from '../../src/unifiedKb/generateKb.js';

const kbSourceDir = path.join(import.meta.dirname, '..', '..', 'kb-source');
const atlas = parseNicheAtlas(readFileSync(path.join(kbSourceDir, 'niche-atlas.md'), 'utf8'));
const staticContext = loadStaticKbContext(kbSourceDir);
const validKbMarkdown = readFileSync(path.join(kbSourceDir, 'verticals', 'automotive.md'), 'utf8');

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

function baseDeps(client: AnthropicMessagesClient): GenerateDemoDeps {
  return {
    atlas,
    kbSourceDir,
    placesApiKey: 'places-key',
    anthropicApiKey: 'anthropic-key',
    anthropicClient: client,
    staticContext,
  };
}

describe('generateDemo', () => {
  it('rejects an unknown vertical before attempting any cascade step', async () => {
    const result = await generateDemo(
      { vertical: 'Not A Real Vertical', niche: 'x', manualForm: { companyName: 'A', city: 'B', state: 'C' } },
      baseDeps(fakeClient(validKbMarkdown)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('validation');
      expect(result.reason).toContain('Not A Real Vertical');
    }
  });

  it('rejects a niche that does not belong to the given vertical', async () => {
    const result = await generateDemo(
      { vertical: 'Automotive', niche: 'Definitely not a real niche', manualForm: { companyName: 'A', city: 'B', state: 'C' } },
      baseDeps(fakeClient(validKbMarkdown)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('validation');
      expect(result.reason).toContain('Automotive');
    }
  });

  it('rejects a request with no cascade input at all', async () => {
    const result = await generateDemo(
      { vertical: 'Automotive', niche: 'Auto repair / mechanic' },
      baseDeps(fakeClient(validKbMarkdown)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('validation');
      expect(result.reason).toMatch(/at least one/i);
    }
  });

  it('runs the manual-form cascade step through to a generated UnifiedKb, using real base-layer grounding', async () => {
    const client = fakeClient(validKbMarkdown);
    const result = await generateDemo(
      {
        vertical: 'Automotive',
        niche: 'Auto repair / mechanic',
        manualForm: { companyName: 'Track Dog Racing', city: 'Dallas', state: 'TX' },
      },
      baseDeps(client),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stepUsed).toBe('manual-form');
      expect(result.unifiedKb.vertical).toBe('Automotive');
      expect(result.unifiedKb.companyProfile.company.name).toBe('Track Dog Racing');
    }

    const call = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const systemText = call.system.map((block: { text: string }) => block.text).join('\n');
    expect(systemText).toContain('authoritative source');
  });

  it('propagates a cascade failure (all attempted steps failed) without calling Claude', async () => {
    const client = fakeClient(validKbMarkdown);
    const result = await generateDemo(
      { vertical: 'Automotive', niche: 'Auto repair / mechanic', gbpUrl: 'not-a-real-url' },
      baseDeps(client),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('cascade');
      expect(result.attempts?.length).toBeGreaterThan(0);
    }
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('propagates a generation failure (invalid KB from the model) as stage "generation"', async () => {
    const client = fakeClient('not a valid kb doc at all');
    const result = await generateDemo(
      {
        vertical: 'Automotive',
        niche: 'Auto repair / mechanic',
        manualForm: { companyName: 'Track Dog Racing', city: 'Dallas', state: 'TX' },
      },
      baseDeps(client),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('generation');
      expect(result.reason).toMatch(/missing required section/);
    }
  });
});
