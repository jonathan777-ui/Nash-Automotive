/**
 * Parses a Google Business Profile / Maps URL into whatever we can read out of it directly,
 * without calling any API. A Maps URL's embedded feature ID (the `0x...:0x...` pair after `!1s`)
 * is NOT the same thing as a Places API `place_id` (a `ChIJ...`-style opaque string) — conflating
 * the two is a common mistake. Rather than solving that ID-format mismatch, this deliberately
 * only extracts what's safe to read literally (name, coordinates, or an explicit `place_id:`
 * param on the rarer URLs that carry one already) and leaves resolution to a Places API Text
 * Search biased by those coordinates — see ingest.ts.
 */
export interface ParsedMapsUrl {
  name?: string;
  lat?: number;
  lng?: number;
  /** Only set on the uncommon URL shapes that already embed a real Places API place_id. */
  placeId?: string;
}

const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'g.page', 'goo.gl']);

export function isShortLink(url: string): boolean {
  try {
    return SHORT_LINK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function parseMapsUrl(url: string): ParsedMapsUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const result: ParsedMapsUrl = {};

  const explicitPlaceId = parsed.searchParams.get('place_id') ?? extractPlaceIdFromQueryParam(parsed);
  if (explicitPlaceId) result.placeId = explicitPlaceId;

  const nameMatch = /\/maps\/place\/([^/@]+)/.exec(parsed.pathname);
  if (nameMatch) {
    result.name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
  }

  const coordMatch = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(parsed.pathname + parsed.search);
  if (coordMatch) {
    result.lat = Number(coordMatch[1]);
    result.lng = Number(coordMatch[2]);
  }

  if (!result.name && !result.lat && !result.placeId) return null;
  return result;
}

function extractPlaceIdFromQueryParam(url: URL): string | undefined {
  // Some share links encode it as ?q=place_id:ChIJ... rather than a plain place_id= param.
  const q = url.searchParams.get('q');
  const m = q ? /place_id:([^&\s]+)/.exec(q) : null;
  return m?.[1];
}

/** Follows redirects for known Google short-link domains only — deliberately not a general
 * URL-unshortener, to avoid this becoming an open redirect-follower for arbitrary input. */
export async function resolveShortLink(
  url: string,
  fetchImpl: typeof fetch = fetch,
  maxHops = 5,
): Promise<string> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    if (!isShortLink(current)) return current;
    const response = await fetchImpl(current, { redirect: 'manual' });
    const location = response.headers.get('location');
    if (!location) return current;
    current = new URL(location, current).toString();
  }
  return current;
}
