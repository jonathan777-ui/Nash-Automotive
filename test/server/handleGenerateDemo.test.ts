import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { parseNicheAtlas } from '../../src/kb/atlasParser.js';
import { loadStaticKbContext } from '../../src/unifiedKb/loadStaticContext.js';
import { handleGenerateDemo } from '../../src/server/handleGenerateDemo.js';
import type { GenerateDemoDeps } from '../../src/server/generateDemo.js';
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

function baseDeps(): GenerateDemoDeps {
  return {
    atlas,
    kbSourceDir,
    placesApiKey: 'places-key',
    anthropicApiKey: 'anthropic-key',
    anthropicClient: fakeClient(validKbMarkdown),
    staticContext,
  };
}

describe('handleGenerateDemo', () => {
  it('returns 400 for a body missing vertical/niche', async () => {
    const result = await handleGenerateDemo({ manualForm: { companyName: 'A', city: 'B', state: 'C' } }, baseDeps());
    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
  });

  it('returns 400 for a non-object body', async () => {
    const result = await handleGenerateDemo('just a string', baseDeps());
    expect(result.status).toBe(400);
  });

  it('returns 400 for a malformed manualForm', async () => {
    const result = await handleGenerateDemo(
      { vertical: 'Automotive', niche: 'Auto repair / mechanic', manualForm: { companyName: 'A' } },
      baseDeps(),
    );
    expect(result.status).toBe(400);
  });

  it('returns 400 for an unknown vertical (validation-stage failure)', async () => {
    const result = await handleGenerateDemo(
      { vertical: 'Nope', niche: 'x', manualForm: { companyName: 'A', city: 'B', state: 'C' } },
      baseDeps(),
    );
    expect(result.status).toBe(400);
    expect(result.body.stage).toBe('validation');
  });

  it('returns 422 for a cascade-stage failure', async () => {
    const result = await handleGenerateDemo(
      { vertical: 'Automotive', niche: 'Auto repair / mechanic', gbpUrl: 'not-a-real-url' },
      baseDeps(),
    );
    expect(result.status).toBe(422);
    expect(result.body.stage).toBe('cascade');
  });

  it('returns 502 for a generation-stage failure', async () => {
    const deps = { ...baseDeps(), anthropicClient: fakeClient('not a valid kb doc') };
    const result = await handleGenerateDemo(
      {
        vertical: 'Automotive',
        niche: 'Auto repair / mechanic',
        manualForm: { companyName: 'Track Dog Racing', city: 'Dallas', state: 'TX' },
      },
      deps,
    );
    expect(result.status).toBe(502);
    expect(result.body.stage).toBe('generation');
  });

  it('returns 200 with the generated UnifiedKb on success', async () => {
    const result = await handleGenerateDemo(
      {
        vertical: 'Automotive',
        niche: 'Auto repair / mechanic',
        manualForm: { companyName: 'Track Dog Racing', city: 'Dallas', state: 'TX' },
      },
      baseDeps(),
    );
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.stepUsed).toBe('manual-form');
  });
});
