import { describe, expect, it, vi } from 'vitest';
import { verifyDocumentsPin } from '../netlify/functions/lib/verifyDocumentsPin.js';

// sha256('123456') - computed once via node:crypto, hardcoded here so tests don't depend on the
// module's own hashing function to also verify itself (that would let a hashing bug pass silently).
const HASH_OF_123456 = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

function routedFetch(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return vi.fn(async (url: string) => {
    const match = Object.entries(routes).find(([key]) => url.includes(key));
    if (!match) return new Response(JSON.stringify({ error: 'no route for ' + url }), { status: 404 });
    const [, route] = match;
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
}

const deps = { twentyCrmBaseUrl: 'https://crm.example.com', twentyCrmApiKey: 'test-key' };

describe('verifyDocumentsPin', () => {
  it('rejects a missing opportunityId or pin without calling Twenty CRM', async () => {
    const fetchImpl = vi.fn();
    const result = await verifyDocumentsPin({ opportunityId: '', pin: '123456' }, { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('grants access and returns the Drive folder URL on a correct PIN', async () => {
    const fetchImpl = routedFetch({
      '/rest/opportunities/opp-1': { body: { companyId: 'co-1' } },
      '/rest/companies/co-1': { body: { documentsAccessPinHash: HASH_OF_123456, driveFolderUrl: 'https://drive.google.com/drive/folders/abc' } },
      '/rest/activityEvents': { body: { ok: true } },
    });
    const result = await verifyDocumentsPin({ opportunityId: 'opp-1', pin: '123456' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.driveFolderUrl).toBe('https://drive.google.com/drive/folders/abc');
  });

  it('rejects an incorrect PIN', async () => {
    const fetchImpl = routedFetch({
      '/rest/opportunities/opp-1': { body: { companyId: 'co-1' } },
      '/rest/companies/co-1': { body: { documentsAccessPinHash: HASH_OF_123456, driveFolderUrl: 'https://drive.google.com/drive/folders/abc' } },
      '/rest/activityEvents': { body: { ok: true } },
    });
    const result = await verifyDocumentsPin({ opportunityId: 'opp-1', pin: '000000' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('logs the access attempt (best-effort) regardless of outcome', async () => {
    const fetchImpl = routedFetch({
      '/rest/opportunities/opp-1': { body: { companyId: 'co-1' } },
      '/rest/companies/co-1': { body: { documentsAccessPinHash: HASH_OF_123456, driveFolderUrl: 'https://drive.google.com/drive/folders/abc' } },
      '/rest/activityEvents': { body: { ok: true } },
    });
    await verifyDocumentsPin({ opportunityId: 'opp-1', pin: '123456' }, { ...deps, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/rest/activityEvents'), expect.objectContaining({ method: 'POST' }));
  });

  it('treats an audit-log write failure as non-fatal (still reports the PIN result)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/rest/opportunities/opp-1')) return new Response(JSON.stringify({ companyId: 'co-1' }), { status: 200 });
      if (url.includes('/rest/companies/co-1')) {
        return new Response(
          JSON.stringify({ documentsAccessPinHash: HASH_OF_123456, driveFolderUrl: 'https://drive.google.com/drive/folders/abc' }),
          { status: 200 },
        );
      }
      throw new Error('audit log endpoint down');
    }) as unknown as typeof fetch;
    const result = await verifyDocumentsPin({ opportunityId: 'opp-1', pin: '123456' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(true);
  });

  it('reports not-yet-provisioned when the Opportunity has no companyId yet', async () => {
    const fetchImpl = routedFetch({
      '/rest/opportunities/opp-1': { body: {} },
    });
    const result = await verifyDocumentsPin({ opportunityId: 'opp-1', pin: '123456' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.reason).toMatch(/not been provisioned/);
    }
  });

  it('reports not-yet-provisioned when the Company has no PIN hash yet', async () => {
    const fetchImpl = routedFetch({
      '/rest/opportunities/opp-1': { body: { companyId: 'co-1' } },
      '/rest/companies/co-1': { body: {} },
    });
    const result = await verifyDocumentsPin({ opportunityId: 'opp-1', pin: '123456' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it('fails cleanly when the network call itself throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await verifyDocumentsPin({ opportunityId: 'opp-1', pin: '123456' }, { ...deps, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('network down');
  });
});
