import { describe, expect, it, vi } from 'vitest';
import { isShortLink, parseMapsUrl, resolveShortLink } from '../../src/gbp/urlParser.js';

describe('parseMapsUrl', () => {
  it('extracts name and coordinates from a standard /maps/place/ URL', () => {
    const url = 'https://www.google.com/maps/place/Track+Dog+Racing/@32.7357,-97.3255,17z/data=!3m1!4b1';
    const parsed = parseMapsUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Track Dog Racing');
    expect(parsed!.lat).toBeCloseTo(32.7357);
    expect(parsed!.lng).toBeCloseTo(-97.3255);
    expect(parsed!.placeId).toBeUndefined();
  });

  it('extracts an explicit place_id when the URL carries one', () => {
    const url = 'https://www.google.com/maps/place/?q=place_id:ChIJrTLr-GyuEmsRBfy61i59si0';
    const parsed = parseMapsUrl(url);
    expect(parsed?.placeId).toBe('ChIJrTLr-GyuEmsRBfy61i59si0');
  });

  it('returns null for a URL with nothing usable', () => {
    expect(parseMapsUrl('https://example.com/not-a-maps-link')).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    expect(parseMapsUrl('not a url at all')).toBeNull();
  });
});

describe('isShortLink', () => {
  it('recognizes known Google short-link domains', () => {
    expect(isShortLink('https://maps.app.goo.gl/abc123')).toBe(true);
    expect(isShortLink('https://g.page/some-business')).toBe(true);
  });

  it('does not treat a full maps.google.com URL as a short link', () => {
    expect(isShortLink('https://www.google.com/maps/place/Foo/@1,2,3z')).toBe(false);
  });
});

describe('resolveShortLink', () => {
  it('follows a redirect chain for a short link and stops at a non-short-link target', async () => {
    const fakeFetch = vi.fn(async (url: string | Request) => {
      const href = typeof url === 'string' ? url : url.url;
      if (href === 'https://maps.app.goo.gl/abc123') {
        return new Response(null, { status: 301, headers: { location: 'https://www.google.com/maps/place/Foo/@1,2,3z' } });
      }
      throw new Error(`unexpected fetch to ${href}`);
    });

    const resolved = await resolveShortLink('https://maps.app.goo.gl/abc123', fakeFetch as unknown as typeof fetch);
    expect(resolved).toBe('https://www.google.com/maps/place/Foo/@1,2,3z');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('returns the input unchanged when it is not a short link', async () => {
    const fakeFetch = vi.fn();
    const resolved = await resolveShortLink('https://www.google.com/maps/place/Foo/@1,2,3z', fakeFetch as unknown as typeof fetch);
    expect(resolved).toBe('https://www.google.com/maps/place/Foo/@1,2,3z');
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
