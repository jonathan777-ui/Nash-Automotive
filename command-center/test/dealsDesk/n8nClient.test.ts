import { describe, expect, it, vi } from 'vitest';
import { amendContract, getCompanyDetail, searchCompanies } from '../../src/dealsDesk/n8nClient.js';

const deps = { n8nInstanceUrl: 'https://n8n.example.com' };

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('searchCompanies', () => {
  it('returns the company list on success', async () => {
    const fetchImpl = fakeFetch(200, { ok: true, companies: [{ id: 'co-1', name: 'Track Dog Racing', engagementScore: 80, currentTier: 'Gold' }] });
    const result = await searchCompanies('track', { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.companies).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://n8n.example.com/webhook/deals-desk-lookup',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ searchTerm: 'track' }) }),
    );
  });

  it('fails cleanly when the network call throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await searchCompanies('track', { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('network down');
  });
});

describe('getCompanyDetail', () => {
  it('returns the company and its active contract', async () => {
    const fetchImpl = fakeFetch(200, {
      ok: true,
      company: { id: 'co-1', name: 'Track Dog Racing', engagementScore: 80, currentTier: 'Gold' },
      contract: { id: 'con-1', companyId: 'co-1', locationIds: ['loc-1'], status: 'Active', totalValue: 75000, agreementValue: 75000, tier: 'Gold' },
    });
    const result = await getCompanyDetail('co-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.contract?.id).toBe('con-1');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://n8n.example.com/webhook/deals-desk-lookup',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ companyId: 'co-1' }) }),
    );
  });

  it('handles a company with no active contract', async () => {
    const fetchImpl = fakeFetch(200, { ok: true, company: { id: 'co-1', name: 'No Contract Co', engagementScore: null, currentTier: null }, contract: null });
    const result = await getCompanyDetail('co-1', { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.contract).toBeNull();
  });
});

describe('amendContract', () => {
  it('submits the amendment and returns the new contract id', async () => {
    const fetchImpl = fakeFetch(200, { ok: true, newContractId: 'con-2', oldContractId: 'con-1' });
    const result = await amendContract(
      { companyId: 'co-1', oldContractId: 'con-1', opportunityId: 'opp-1', newLocationIds: ['loc-1', 'loc-2'], newTotalValueCents: 165000, newAgreementValueCents: 165000 },
      { ...deps, fetchImpl },
    );
    expect(result.ok).toBe(true);
    expect(result.newContractId).toBe('con-2');
  });

  it('surfaces a failure reason on error', async () => {
    const fetchImpl = fakeFetch(500, { ok: false, reason: 'Twenty CRM unreachable.' });
    const result = await amendContract(
      { companyId: 'co-1', oldContractId: 'con-1', opportunityId: 'opp-1', newLocationIds: ['loc-1'], newTotalValueCents: 75000, newAgreementValueCents: 75000 },
      { ...deps, fetchImpl },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Twenty CRM unreachable.');
  });
});
