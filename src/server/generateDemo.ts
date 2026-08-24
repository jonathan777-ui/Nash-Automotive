import { resolveCompanyProfile } from '../cascade/resolveCompanyProfile.js';
import { assembleUnifiedKb } from '../unifiedKb/assemble.js';
import { loadKbGrounding } from '../unifiedKb/kbLibrary.js';
import { loadStaticKbContext } from '../unifiedKb/loadStaticContext.js';
import type { AnthropicMessagesClient } from '../unifiedKb/generateKb.js';
import type { StaticKbContext } from '../unifiedKb/promptBuilder.js';
import type { NicheAtlas } from '../kb/types.js';
import type { UnifiedKb } from '../unifiedKb/types.js';

/** Checkpoint 5's request shape: the input cascade's three sources plus the vertical/niche every
 * generation needs regardless of which cascade step actually resolves the Company Profile — the
 * atlas's own niche list is the source of truth here (per buildManualFormProfile's existing
 * validation), so this is checked up front rather than only for the manual-form path. */
export interface GenerateDemoRequest {
  vertical: string;
  niche: string;
  gbpUrl?: string;
  websiteUrl?: string;
  manualForm?: { companyName: string; city: string; state: string };
}

export interface GenerateDemoSuccess {
  ok: true;
  unifiedKb: UnifiedKb;
  stepUsed: 'gbp' | 'website-scrape' | 'manual-form';
}
export interface GenerateDemoFailure {
  ok: false;
  /** Which stage rejected the request — lets an HTTP adapter or an n8n workflow pick a sensible
   * status code / retry policy without string-matching the reason. */
  stage: 'validation' | 'cascade' | 'generation';
  reason: string;
  /** Set only for stage 'cascade' — every input-cascade step actually attempted, so a caller can
   * show why each one failed rather than just the last. */
  attempts?: { step: string; reason: string }[];
}
export type GenerateDemoResult = GenerateDemoSuccess | GenerateDemoFailure;

export interface GenerateDemoDeps {
  atlas: NicheAtlas;
  kbSourceDir: string;
  placesApiKey: string;
  anthropicApiKey: string;
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to a real Anthropic client built from anthropicApiKey inside
   * generateKb.ts. */
  anthropicClient?: AnthropicMessagesClient;
  /** Injectable for tests (and to avoid re-reading the same static files on every request in a
   * long-running server — see src/server/index.ts); defaults to loadStaticKbContext(kbSourceDir). */
  staticContext?: StaticKbContext;
}

/** Checkpoint 5: "a first full demo generated end to end" — the standalone Node/TS app the brief
 * calls for ("called via HTTP/webhook from n8n — not n8n workflow JSON + Code nodes"), minus the
 * actual HTTP transport (see handleGenerateDemo.ts / index.ts). Ties together every prior
 * checkpoint: the input cascade (GBP -> website scrape -> manual form), the base+overlay-aware
 * Unified KB assembly, and the atlas as the single source of truth for valid vertical/niche pairs. */
export async function generateDemo(
  request: GenerateDemoRequest,
  deps: GenerateDemoDeps,
): Promise<GenerateDemoResult> {
  const vertical = deps.atlas.verticals.find((v) => v.name === request.vertical);
  if (!vertical) {
    return {
      ok: false,
      stage: 'validation',
      reason:
        `"${request.vertical}" is not a vertical in the niche atlas. Valid verticals: ` +
        deps.atlas.verticals.map((v) => v.name).join(', '),
    };
  }

  const nicheExists = vertical.niches.some((n) => n.name === request.niche);
  if (!nicheExists) {
    return {
      ok: false,
      stage: 'validation',
      reason:
        `"${request.niche}" is not a niche under ${vertical.name}. Valid niches: ` +
        vertical.niches.map((n) => n.name).join(', '),
    };
  }

  if (!request.gbpUrl && !request.websiteUrl && !request.manualForm) {
    return {
      ok: false,
      stage: 'validation',
      reason: 'At least one of gbpUrl, websiteUrl, or manualForm is required.',
    };
  }

  const cascadeResult = await resolveCompanyProfile(
    {
      gbpUrl: request.gbpUrl,
      websiteUrl: request.websiteUrl,
      manual: request.manualForm
        ? { ...request.manualForm, vertical: request.vertical, niche: request.niche }
        : undefined,
    },
    { placesApiKey: deps.placesApiKey, atlas: deps.atlas, fetchImpl: deps.fetchImpl },
  );
  if (!cascadeResult.ok) {
    return { ok: false, stage: 'cascade', reason: cascadeResult.reason, attempts: cascadeResult.attempts };
  }

  const grounding = loadKbGrounding(deps.kbSourceDir, vertical.name, request.niche);
  const staticContext = deps.staticContext ?? loadStaticKbContext(deps.kbSourceDir);

  const assembleResult = await assembleUnifiedKb(cascadeResult.profile, vertical, request.niche, {
    apiKey: deps.anthropicApiKey,
    staticContext,
    grounding,
    client: deps.anthropicClient,
  });
  if (!assembleResult.ok) {
    return { ok: false, stage: 'generation', reason: assembleResult.reason };
  }

  return { ok: true, unifiedKb: assembleResult.unifiedKb, stepUsed: cascadeResult.stepUsed };
}
