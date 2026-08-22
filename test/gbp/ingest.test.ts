import { describe, expect, it, vi } from 'vitest';
import { ingestFromGbpUrl } from '../../src/gbp/ingest.js';

const SEARCH_TEXT_RESPONSE = {
  places: [
    {
      id: 'ChIJrTLr-GyuEmsRBfy61i59si0',
      displayName: { text: 'Track Dog Racing' },
      formattedAddress: '123 Race Way, Fort Worth, TX 76102',
      internationalPhoneNumber: '+1 214-340-9797',
      websiteUri: 'https://trackdogracing.com',
      businessStatus: 'OPERATIONAL',
      primaryType: 'car_repair',
      types: ['car_repair', 'store'],
      rating: 4.8,
      userRatingCount: 212,
      regularOpeningHours: {
        weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM', 'Tuesday: 9:00 AM – 5:00 PM'],
        periods: [
          { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
          { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } },
        ],
      },
    },
  ],
};

const PLACE_DETAILS_RESPONSE = SEARCH_TEXT_RESPONSE.places[0];

function fakeFetch(handlers: { textSearch?: unknown; placeDetails?: unknown; status?: number }) {
  return vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'https://places.googleapis.com/v1/places:searchText') {
      return new Response(JSON.stringify(handlers.textSearch ?? SEARCH_TEXT_RESPONSE), {
        status: handlers.status ?? 200,
      });
    }
    if (url.startsWith('https://places.googleapis.com/v1/places/')) {
      return new Response(JSON.stringify(handlers.placeDetails ?? PLACE_DETAILS_RESPONSE), {
        status: handlers.status ?? 200,
      });
    }
    throw new Error(`unexpected fetch to ${url} (init: ${JSON.stringify(init)})`);
  }) as unknown as typeof fetch;
}

describe('ingestFromGbpUrl', () => {
  it('resolves via Text Search when the URL only has a name + coordinates', async () => {
    const url = 'https://www.google.com/maps/place/Track+Dog+Racing/@32.7357,-97.3255,17z';
    const result = await ingestFromGbpUrl(url, 'test-api-key', fakeFetch({}));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.company.name).toBe('Track Dog Racing');
    expect(result.profile.company.address).toBe('123 Race Way, Fort Worth, TX 76102');
    expect(result.profile.company.website).toBe('https://trackdogracing.com');
    expect(result.profile.contact.phone).toBe('+1 214-340-9797');
    expect(result.profile.background.source).toBe('gbp');
    expect(result.profile.background.sourceUrl).toBe(url);
    expect(result.profile.services.weekdayDescriptions).toHaveLength(2);
    expect(result.profile.services.periods).toEqual([
      { day: 1, open: '09:00', close: '17:00' },
      { day: 2, open: '09:00', close: '17:00' },
    ]);
  });

  it('resolves via Place Details when the URL already carries an explicit place_id', async () => {
    const url = 'https://www.google.com/maps/place/?q=place_id:ChIJrTLr-GyuEmsRBfy61i59si0';
    const fetchImpl = fakeFetch({});
    const result = await ingestFromGbpUrl(url, 'test-api-key', fetchImpl);

    expect(result.ok).toBe(true);
    // Only Place Details should have been called, not Text Search, since the place_id was explicit.
    const calledUrls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) =>
      typeof c[0] === 'string' ? c[0] : (c[0] as Request).url,
    );
    expect(calledUrls).toEqual(['https://places.googleapis.com/v1/places/ChIJrTLr-GyuEmsRBfy61i59si0']);
  });

  it('follows a maps.app.goo.gl redirect before parsing', async () => {
    const shortUrl = 'https://maps.app.goo.gl/abc123';
    const fullUrl = 'https://www.google.com/maps/place/Track+Dog+Racing/@32.7357,-97.3255,17z';
    const fetchImpl = vi.fn(async (input: string | Request) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === shortUrl) return new Response(null, { status: 301, headers: { location: fullUrl } });
      if (url === 'https://places.googleapis.com/v1/places:searchText') {
        return new Response(JSON.stringify(SEARCH_TEXT_RESPONSE), { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    const result = await ingestFromGbpUrl(shortUrl, 'test-api-key', fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.background.sourceUrl).toBe(shortUrl);
  });

  it('fails cleanly with the raw error surfaced when the URL has nothing usable', async () => {
    const result = await ingestFromGbpUrl('https://example.com/nope', 'test-api-key', fakeFetch({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Could not read/);
  });

  it('fails cleanly when Places API returns an error, without swallowing the message', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'API key invalid' } }), { status: 403 })) as unknown as typeof fetch;
    const url = 'https://www.google.com/maps/place/Track+Dog+Racing/@32.7357,-97.3255,17z';
    const result = await ingestFromGbpUrl(url, 'bad-key', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('API key invalid');
  });
});
