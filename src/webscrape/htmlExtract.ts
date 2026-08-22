/** Extracts foundational company info from a single business's own website HTML. Deliberately
 * NOT the anti-ban bulk extraction engine scoped to `04 - Scraper Deployment Scaffold` —
 * that service discovers and scores *new* leads at volume from Maps/Chamber/Facebook/Instagram.
 * This is a one-off fetch of a single already-known URL (a prospect's own site, reached only
 * after they had no GBP link), so there's no rate-limit/anti-ban concern to duplicate.
 *
 * Prefers schema.org JSON-LD (`<script type="application/ld+json">`) when present — many site
 * builders (Wix, Squarespace, WordPress business plugins) embed it automatically, and it's far
 * more reliable than guessing at a site's HTML structure. Falls back to `<title>`/meta tags and a
 * plain-text phone-number scan when a site has none.
 */
export interface ExtractedSiteInfo {
  name?: string;
  phone?: string;
  address?: string;
  description?: string;
  /** Raw hour strings, whatever format the source used (schema.org day-range strings like
   * "Mo-Fr 09:00-17:00", or free text) — not normalized into per-day periods the way GBP's are. */
  hoursText?: string[];
  /** True when the JSON-LD path found usable data, for callers that want to know which path ran. */
  source: 'jsonld' | 'meta-fallback';
}

interface JsonLdAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
}

interface JsonLdNode {
  '@type'?: string | string[];
  name?: string;
  telephone?: string;
  description?: string;
  address?: string | JsonLdAddress;
  openingHours?: string | string[];
  openingHoursSpecification?: { dayOfWeek?: string | string[]; opens?: string; closes?: string }[];
  '@graph'?: JsonLdNode[];
}

function looksLikeBusiness(node: JsonLdNode): boolean {
  return Boolean(node.name) && Boolean(node.telephone || node.address || node.openingHours || node.openingHoursSpecification);
}

function flattenJsonLdBlocks(html: string): JsonLdNode[] {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes: JsonLdNode[] = [];

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue; // malformed JSON-LD is common in the wild; skip rather than fail the whole extraction
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates as JsonLdNode[]) {
      if (candidate['@graph']) nodes.push(...candidate['@graph']);
      else nodes.push(candidate);
    }
  }
  return nodes;
}

function formatAddress(address: string | JsonLdAddress | undefined): string | undefined {
  if (!address) return undefined;
  if (typeof address === 'string') return address;
  return [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode]
    .filter(Boolean)
    .join(', ') || undefined;
}

function extractFromMeta(html: string): ExtractedSiteInfo {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1];
  // A conservative North American phone pattern; intentionally not trying to cover every locale.
  const phone = /(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/.exec(html)?.[1];

  return { name: title, description, phone, source: 'meta-fallback' };
}

export function extractCompanyInfoFromHtml(html: string): ExtractedSiteInfo {
  const jsonLdNodes = flattenJsonLdBlocks(html);
  const businessNode = jsonLdNodes.find(looksLikeBusiness);

  if (businessNode) {
    const hoursText = businessNode.openingHoursSpecification
      ? businessNode.openingHoursSpecification.map((spec) => {
          const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek.join(', ') : spec.dayOfWeek ?? '';
          return `${days} ${spec.opens ?? '?'}-${spec.closes ?? '?'}`.trim();
        })
      : businessNode.openingHours
        ? Array.isArray(businessNode.openingHours)
          ? businessNode.openingHours
          : [businessNode.openingHours]
        : undefined;

    return {
      name: businessNode.name,
      phone: businessNode.telephone,
      address: formatAddress(businessNode.address),
      description: businessNode.description,
      hoursText,
      source: 'jsonld',
    };
  }

  return extractFromMeta(html);
}
