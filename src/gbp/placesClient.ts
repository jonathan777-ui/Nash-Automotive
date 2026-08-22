/**
 * Google Places API (New) client — v1, `places.googleapis.com`.
 *
 * Based on documented public API knowledge, not fetched fresh in this session (no Google API
 * doc-search tool was available here, only Cloudflare's). Higher confidence than a cold guess —
 * this is a stable, well-established Google API — but still worth a live smoke test against a
 * real API key before trusting it fully; see gbp/README.md.
 */

const FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'internationalPhoneNumber',
  'websiteUri',
  'businessStatus',
  'primaryType',
  'types',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
].join(',');

export interface PlacesApiPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: {
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }[];
  };
}

export interface PlacesClientResult {
  ok: boolean;
  place?: PlacesApiPlace;
  errorMessage?: string;
}

export async function getPlaceDetails(
  placeId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlacesClientResult> {
  const response = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
  });
  return parseSinglePlaceResponse(response);
}

export async function searchPlaceByText(
  query: string,
  apiKey: string,
  locationBias: { lat: number; lng: number } | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<PlacesClientResult> {
  const body: Record<string, unknown> = { textQuery: query };
  if (locationBias) {
    body.locationBias = {
      circle: { center: { latitude: locationBias.lat, longitude: locationBias.lng }, radius: 200.0 },
    };
  }

  const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK.split(',').map((f) => `places.${f}`).join(','),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) return { ok: false, errorMessage: await describeError(response) };
  const json = (await response.json().catch(() => undefined)) as { places?: PlacesApiPlace[] } | undefined;
  const place = json?.places?.[0];
  if (!place) return { ok: false, errorMessage: 'No places matched the search text.' };
  return { ok: true, place };
}

async function parseSinglePlaceResponse(response: Response): Promise<PlacesClientResult> {
  if (!response.ok) return { ok: false, errorMessage: await describeError(response) };
  const place = (await response.json().catch(() => undefined)) as PlacesApiPlace | undefined;
  if (!place) return { ok: false, errorMessage: 'Empty response body from Places API.' };
  return { ok: true, place };
}

async function describeError(response: Response): Promise<string> {
  const body = await response.json().catch(() => undefined);
  const message =
    body && typeof body === 'object' && 'error' in body
      ? JSON.stringify((body as { error: unknown }).error)
      : `HTTP ${response.status}`;
  return message;
}
