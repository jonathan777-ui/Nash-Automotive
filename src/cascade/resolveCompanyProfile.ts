import { ingestFromGbpUrl } from '../gbp/ingest.js';
import { fetchCompanyInfo } from '../webscrape/fetchCompanyInfo.js';
import { buildManualFormProfile, type ManualFormInput } from '../manualForm/buildProfile.js';
import type { NicheAtlas } from '../kb/types.js';
import type { CompanyProfile } from '../company/types.js';

export interface CascadeInput {
  gbpUrl?: string;
  websiteUrl?: string;
  manual?: ManualFormInput;
}

export interface CascadeSuccess {
  ok: true;
  profile: CompanyProfile;
  stepUsed: 'gbp' | 'website-scrape' | 'manual-form';
}
export interface CascadeFailure {
  ok: false;
  reason: string;
  /** Every step actually attempted before giving up, so a caller can show why each one failed
   * rather than just the last. */
  attempts: { step: string; reason: string }[];
}
export type CascadeResult = CascadeSuccess | CascadeFailure;

export interface CascadeDeps {
  placesApiKey: string;
  atlas: NicheAtlas;
  fetchImpl?: typeof fetch;
}

/** Runs the full input cascade in priority order — GBP link, then website scrape, then manual
 * form — stopping at the first step with input that succeeds. A step is only attempted if its
 * input was actually provided; a failed earlier step falls through to the next one that has
 * input, rather than stopping cold. */
export async function resolveCompanyProfile(input: CascadeInput, deps: CascadeDeps): Promise<CascadeResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const attempts: { step: string; reason: string }[] = [];

  if (input.gbpUrl) {
    const result = await ingestFromGbpUrl(input.gbpUrl, deps.placesApiKey, fetchImpl);
    if (result.ok) return { ok: true, profile: result.profile, stepUsed: 'gbp' };
    attempts.push({ step: 'gbp', reason: result.reason });
  }

  if (input.websiteUrl) {
    const result = await fetchCompanyInfo(input.websiteUrl, fetchImpl);
    if (result.ok) return { ok: true, profile: result.profile, stepUsed: 'website-scrape' };
    attempts.push({ step: 'website-scrape', reason: result.reason });
  }

  if (input.manual) {
    const result = buildManualFormProfile(input.manual, deps.atlas);
    if (result.ok) return { ok: true, profile: result.profile, stepUsed: 'manual-form' };
    attempts.push({ step: 'manual-form', reason: result.reason });
  }

  if (attempts.length === 0) {
    return {
      ok: false,
      reason: 'No input provided at all (no GBP link, website, or manual form fields).',
      attempts,
    };
  }

  return { ok: false, reason: `All ${attempts.length} cascade step(s) attempted failed.`, attempts };
}
