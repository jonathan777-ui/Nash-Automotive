import { describe, expect, it, vi } from 'vitest';
import { getOpportunityForPortal } from '../netlify/functions/lib/getOpportunity.js';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

/** Routes by URL substring, for tests exercising the Opportunity fetch + N Location fetches. */
function routedFetch(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return vi.fn(async (url: string) => {
    const match = Object.entries(routes).find(([key]) => url.includes(key));
    if (!match) return new Response(JSON.stringify({ error: 'no route for ' + url }), { status: 404 });
    const [, route] = match;
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
}

const deps = { twentyCrmBaseUrl: 'https://crm.example.com', twentyCrmApiKey: 'test-key' };

describe('getOpportunityForPortal', () => {
  it('rejects a missing opportunity id without calling Twenty CRM', async () => {
    const fetchImpl = fakeFetch(200, {});
    const result = await getOpportunityForPortal('', { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a direct-shape Twenty CRM response and fetches each of its Locations', async () => {
    const fetchImpl = routedFetch({
      '/rest/opportunities/opp-1': {
        body: { name: 'Track Dog Racing', stage: 'Demo Queue', locationIds: ['loc-1'] },
      },
      '/rest/locations/loc-1': {
        body: { id: 'loc-1', name: 'Track Dog Racing - Main St', frontDoorAuditScore: 62, frontDoorAuditReportUrl: 'https://portal.example.com/audit/abc' },
      },
    });
    const result = await getOpportunityForPortal('opp-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opportunity.companyName).toBe('Track Dog Racing');
      expect(result.opportunity.locations).toHaveLength(1);
      expect(result.opportunity.locations[0]).toMatchObject({ id: 'loc-1', frontDoorAuditScore: 62 });
    }
  });

  it('returns an empty locations array when the Opportunity has no locationIds', async () => {
    const fetchImpl = routedFetch({
      '/rest/opportunities/opp-1': { body: { name: 'No Locations Yet', stage: 'Demo Queue' } },
    });
    const result = await getOpportunityForPortal('opp-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.opportunity.locations).toEqual([]);
  });

  it('skips a Location that fails to fetch rather than failing the whole page', async () => {
    const fetchImpl = routedFetch({
      '/rest/opportunities/opp-1': { body: { name: 'Multi-site Co', stage: 'Demo Queue', locationIds: ['loc-1', 'loc-2'] } },
      '/rest/locations/loc-1': { body: { id: 'loc-1', name: 'Site One' } },
      '/rest/locations/loc-2': { status: 500, body: { error: 'boom' } },
    });
    const result = await getOpportunityForPortal('opp-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opportunity.locations).toHaveLength(1);
      expect(result.opportunity.locations[0]!.id).toBe('loc-1');
    }
  });

  it('also handles a {data: {opportunity: {...}}} wrapped response shape', async () => {
    const fetchImpl = fakeFetch(200, { data: { opportunity: { name: 'Wrapped Co', stage: 'Pending Demos' } } });
    const result = await getOpportunityForPortal('opp-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.opportunity.companyName).toBe('Wrapped Co');
  });

  it('returns a 404-mapped failure when Twenty CRM 404s', async () => {
    const fetchImpl = fakeFetch(404, { error: 'not found' });
    const result = await getOpportunityForPortal('missing', { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it('fails cleanly on an unexpected response shape rather than throwing', async () => {
    const fetchImpl = fakeFetch(200, { totally: 'unexpected' });
    const result = await getOpportunityForPortal('opp-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Unexpected/);
  });

  it('fails cleanly when the network call itself throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await getOpportunityForPortal('opp-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('network down');
  });
});
