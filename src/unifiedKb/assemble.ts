import { generateKb, type GenerateKbDeps } from './generateKb.js';
import { buildDisclaimer } from './disclaimer.js';
import { renderVerticalForPrompt } from './renderVertical.js';
import type { CompanyProfile } from '../company/types.js';
import type { AtlasVertical } from '../kb/types.js';
import type { UnifiedKb } from './types.js';

export interface AssembleSuccess {
  ok: true;
  unifiedKb: UnifiedKb;
}
export interface AssembleFailure {
  ok: false;
  reason: string;
}
export type AssembleResult = AssembleSuccess | AssembleFailure;

/** Checkpoint 4: "combine whatever the cascade produces with the matching niche KB to populate
 * the Company Profile" into a Unified KB. Generates the KB via Claude — reusing checkpoint 1's
 * parser/validator to check the result rather than trusting it blindly — then injects the fixed
 * disclaimer as a separate structured field rather than asking the model to reproduce it exactly. */
export async function assembleUnifiedKb(
  profile: CompanyProfile,
  vertical: AtlasVertical,
  niche: string,
  deps: GenerateKbDeps,
): Promise<AssembleResult> {
  const verticalText = renderVerticalForPrompt(vertical);
  const result = await generateKb(profile, verticalText, niche, deps);
  if (!result.ok) return { ok: false, reason: result.reason };

  return {
    ok: true,
    unifiedKb: {
      companyProfile: profile,
      vertical: vertical.name,
      niche,
      kbDoc: result.kbDoc,
      rawMarkdown: result.rawMarkdown,
      disclaimer: buildDisclaimer(profile.company.name),
      generatedAt: new Date().toISOString(),
    },
  };
}
