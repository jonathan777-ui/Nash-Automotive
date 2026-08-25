import { describe, expect, it, vi } from 'vitest';
import { upsertN8nCredential } from '../../src/pushTargets/n8nCredentials.js';

const deps = { n8nInstanceUrl: 'https://n8n.example.com', n8nApiKey: 'n8n-key-1' };

function routedFetch(routes: { list: unknown; create?: { status?: number }; update?: { status?: number } }): typeof fetch {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === undefined && url.endsWith('/credentials')) {
      return new Response(JSON.stringify(routes.list), { status: 200 });
    }
    if (init?.method === 'PATCH') {
      return new Response('{}', { status: routes.update?.status ?? 200 });
    }
    if (init?.method === 'POST') {
      return new Response('{}', { status: routes.create?.status ?? 200 });
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
}

describe('upsertN8nCredential', () => {
  it('creates a new credential when no name match exists', async () => {
    const fetchImpl = routedFetch({ list: [] });
    const result = await upsertN8nCredential(
      { ...deps, fetchImpl },
      { name: 'Claude API', type: 'httpHeaderAuth', data: { name: 'x-api-key', value: 'sk-ant-123' } },
    );
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://n8n.example.com/api/v1/credentials',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Claude API', type: 'httpHeaderAuth', data: { name: 'x-api-key', value: 'sk-ant-123' } }),
      }),
    );
  });

  it('updates the existing credential when a name match exists', async () => {
    const fetchImpl = routedFetch({ list: [{ id: 'cred-1', name: 'Twenty CRM API' }] });
    const result = await upsertN8nCredential(
      { ...deps, fetchImpl },
      { name: 'Twenty CRM API', type: 'httpBearerAuth', data: { token: 'tok-123' } },
    );
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('https://n8n.example.com/api/v1/credentials/cred-1', expect.objectContaining({ method: 'PATCH' }));
  });

  it('handles a {data: [...]} wrapped list response', async () => {
    const fetchImpl = routedFetch({ list: { data: [{ id: 'cred-2', name: 'Telnyx API' }] } });
    const result = await upsertN8nCredential(
      { ...deps, fetchImpl },
      { name: 'Telnyx API', type: 'httpHeaderAuth', data: { name: 'Authorization', value: 'Bearer x' } },
    );
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(true);
  });

  it('fails cleanly when listing credentials fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const result = await upsertN8nCredential({ ...deps, fetchImpl }, { name: 'X', type: 'httpBearerAuth', data: { token: 'y' } });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('list');
  });

  it('fails cleanly when the create call itself throws', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === undefined) return new Response('[]', { status: 200 });
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await upsertN8nCredential({ ...deps, fetchImpl }, { name: 'X', type: 'httpBearerAuth', data: { token: 'y' } });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('network down');
  });
});
