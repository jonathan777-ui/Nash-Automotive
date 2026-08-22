import { parseMapsUrl, resolveShortLink, isShortLink } from './urlParser.js';
import { getPlaceDetails, searchPlaceByText, type PlacesApiPlace } from './placesClient.js';
import type { CompanyProfile } from '../company/types.js';

export interface GbpIngestSuccess {
  ok: true;
  profile: CompanyProfile;
}
export interface GbpIngestFailure {
  ok: false;
  reason: string;
}
export type GbpIngestResult = GbpIngestSuccess | GbpIngestFailure;

/** Cascade step 1: "Google Business Profile link → pull hours, services, etc. directly."
 * Deliberately does not try to derive a Places API place_id from a Maps URL's embedded feature
 * ID (the `0x...:0x...` pair) — that's a different ID format and conflating them silently fails
 * or, worse, resolves to the wrong business. Instead: use an explicit place_id if the URL happens
 * to carry one, otherwise fall back to a Text Search biased by whatever name/coordinates the URL
 * exposes. */
export async function ingestFromGbpUrl(
  gbpUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GbpIngestResult> {
  const resolvedUrl = isShortLink(gbpUrl) ? await resolveShortLink(gbpUrl, fetchImpl) : gbpUrl;
  const parsed = parseMapsUrl(resolvedUrl);
  if (!parsed) {
    return { ok: false, reason: `Could not read a business name, coordinates, or place ID out of ${gbpUrl}` };
  }

  const result = parsed.placeId
    ? await getPlaceDetails(parsed.placeId, apiKey, fetchImpl)
    : parsed.name
      ? await searchPlaceByText(
          parsed.name,
          apiKey,
          parsed.lat !== undefined && parsed.lng !== undefined ? { lat: parsed.lat, lng: parsed.lng } : undefined,
          fetchImpl,
        )
      : { ok: false as const, errorMessage: 'URL had coordinates but no business name to search for.' };

  if (!result.ok || !result.place) {
    return { ok: false, reason: result.errorMessage ?? 'Places API lookup failed.' };
  }

  return { ok: true, profile: toCompanyProfile(result.place, gbpUrl) };
}

function toCompanyProfile(place: PlacesApiPlace, sourceUrl: string): CompanyProfile {
  return {
    company: {
      name: place.displayName?.text ?? 'Unknown business',
      address: place.formattedAddress,
      website: place.websiteUri,
      businessStatus: place.businessStatus,
      primaryType: place.primaryType,
      types: place.types,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
    },
    contact: {
      phone: place.internationalPhoneNumber,
    },
    background: {
      source: 'gbp',
      sourceUrl,
      fetchedAt: new Date().toISOString(),
    },
    services: {
      weekdayDescriptions: place.regularOpeningHours?.weekdayDescriptions,
      periods: place.regularOpeningHours?.periods
        ?.filter((p): p is Required<typeof p> => Boolean(p.close))
        .map((p) => ({
          day: p.open.day,
          open: formatHourMinute(p.open.hour, p.open.minute),
          close: formatHourMinute(p.close.hour, p.close.minute),
        })),
    },
  };
}

function formatHourMinute(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
