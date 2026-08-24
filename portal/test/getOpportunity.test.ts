import { describe, expect, it, vi } from 'vitest';
import { getOpportunityForPortal } from '../netlify/functions/lib/getOpportunity.js';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const deps = { twentyCrmBaseUrl: 'https://crm.example.com', twentyCrmApiKey: 'test-key' };

describe('getOpportunityForPortal', () => {
  it('rejects a missing opportunity id without calling Twenty CRM', async () => {
    const fetchImpl = fakeFetch(200, {});
    const result = await getOpportunityForPortal('', { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a direct-shape Twenty CRM response to the public portal fields', async () => {
    const fetchImpl = fakeFetch(200, {
      name: 'Track Dog Racing',
      stage: 'Demo Queue',
      frontDoorAuditScore: 62,
      frontDoorAuditReportUrl: 'https://portal.example.com/audit/abc',
    });
    const result = await getOpportunityForPortal('opp-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opportunity.companyName).toBe('Track Dog Racing');
      expect(result.opportunity.frontDoorAuditScore).toBe(62);
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://crm.example.com/rest/opportunities/opp-1',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-key' } }),
    );
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
