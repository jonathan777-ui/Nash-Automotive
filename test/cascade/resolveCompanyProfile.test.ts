import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseNicheAtlas } from '../../src/kb/atlasParser.js';
import { resolveCompanyProfile } from '../../src/cascade/resolveCompanyProfile.js';
import type { ManualFormInput } from '../../src/manualForm/buildProfile.js';

const atlasPath = path.join(import.meta.dirname, '..', '..', 'kb-source', 'niche-atlas.md');
const atlas = parseNicheAtlas(readFileSync(atlasPath, 'utf8'));

const manual: ManualFormInput = {
  companyName: 'Joe’s HVAC',
  city: 'Austin',
  state: 'TX',
  vertical: 'Home Services',
  niche: 'HVAC',
};

function routedFetch(routes: Record<string, () => Response>): typeof fetch {
  return vi.fn(async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return handler();
    }
    throw new Error(`unrouted fetch: ${url}`);
  }) as unknown as typeof fetch;
}

describe('resolveCompanyProfile', () => {
  it('uses the GBP step first when it succeeds', async () => {
    const fetchImpl = routedFetch({
      'https://places.googleapis.com/v1/places:searchText': () =>
        new Response(
          JSON.stringify({ places: [{ id: '1', displayName: { text: 'Track Dog Racing' } }] }),
          { status: 200 },
        ),
    });

    const result = await resolveCompanyProfile(
      { gbpUrl: 'https://www.google.com/maps/place/Track+Dog+Racing/@32.7,-97.3,17z', websiteUrl: 'https://ignored.example', manual },
      { placesApiKey: 'key', atlas, fetchImpl },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stepUsed).toBe('gbp');
      expect(result.profile.company.name).toBe('Track Dog Racing');
    }
  });

  it('falls through to website scrape when the GBP step fails', async () => {
    const fetchImpl = routedFetch({
      'https://places.googleapis.com': () => new Response(JSON.stringify({ places: [] }), { status: 200 }),
      'https://realsite.example': () =>
        new Response('<title>Real Site Business</title>', { status: 200 }),
    });

    const result = await resolveCompanyProfile(
      { gbpUrl: 'https://www.google.com/maps/place/Something/@1,2,3z', websiteUrl: 'https://realsite.example', manual },
      { placesApiKey: 'key', atlas, fetchImpl },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stepUsed).toBe('website-scrape');
      expect(result.profile.company.name).toBe('Real Site Business');
    }
  });

  it('falls through all the way to the manual form when both prior steps fail', async () => {
    const fetchImpl = routedFetch({
      'https://places.googleapis.com': () => new Response(JSON.stringify({ places: [] }), { status: 200 }),
      'https://deadsite.example': () => new Response('not found', { status: 404 }),
    });

    const result = await resolveCompanyProfile(
      { gbpUrl: 'https://www.google.com/maps/place/Something/@1,2,3z', websiteUrl: 'https://deadsite.example', manual },
      { placesApiKey: 'key', atlas, fetchImpl },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stepUsed).toBe('manual-form');
      expect(result.profile.company.name).toBe(manual.companyName);
    }
  });

  it('reports every attempted step when all provided steps fail', async () => {
    const fetchImpl = routedFetch({
      'https://places.googleapis.com': () => new Response(JSON.stringify({ places: [] }), { status: 200 }),
      'https://deadsite.example': () => new Response('not found', { status: 404 }),
    });

    const result = await resolveCompanyProfile(
      { gbpUrl: 'https://www.google.com/maps/place/Something/@1,2,3z', websiteUrl: 'https://deadsite.example' },
      { placesApiKey: 'key', atlas, fetchImpl },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts.map((a) => a.step)).toEqual(['gbp', 'website-scrape']);
    }
  });

  it('fails cleanly when no input at all is given', async () => {
    const result = await resolveCompanyProfile({}, { placesApiKey: 'key', atlas });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toEqual([]);
      expect(result.reason).toMatch(/No input provided/);
    }
  });
});
