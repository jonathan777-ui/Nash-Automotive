import { extractCompanyInfoFromHtml } from './htmlExtract.js';
import type { CompanyProfile } from '../company/types.js';

export interface WebScrapeSuccess {
  ok: true;
  profile: CompanyProfile;
}
export interface WebScrapeFailure {
  ok: false;
  reason: string;
}
export type WebScrapeResult = WebScrapeSuccess | WebScrapeFailure;

/** Cascade step 2: "No GBP, but has a website → scrape it for foundational company info." A
 * single fetch of one already-known URL — see htmlExtract.ts for why this doesn't need the
 * anti-ban machinery scoped to the separate lead-gen scraper. */
export async function fetchCompanyInfo(
  websiteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WebScrapeResult> {
  let response: Response;
  try {
    response = await fetchImpl(websiteUrl, { headers: { 'User-Agent': 'OrbitAI-DemoGenerator/0.1 (+company info fetch)' } });
  } catch (err) {
    return { ok: false, reason: `Could not reach ${websiteUrl}: ${(err as Error).message}` };
  }

  if (!response.ok) {
    return { ok: false, reason: `${websiteUrl} responded with HTTP ${response.status}` };
  }

  const html = await response.text();
  const extracted = extractCompanyInfoFromHtml(html);

  if (!extracted.name) {
    return { ok: false, reason: `Fetched ${websiteUrl} but found no business name (no JSON-LD, no <title>).` };
  }

  const profile: CompanyProfile = {
    company: {
      name: extracted.name,
      address: extracted.address,
      website: websiteUrl,
    },
    contact: {
      phone: extracted.phone,
    },
    background: {
      source: 'website-scrape',
      sourceUrl: websiteUrl,
      fetchedAt: new Date().toISOString(),
      description: extracted.description,
    },
    services: {
      weekdayDescriptions: extracted.hoursText,
    },
  };

  return { ok: true, profile };
}
