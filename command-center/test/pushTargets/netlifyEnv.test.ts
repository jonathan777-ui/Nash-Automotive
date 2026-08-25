import { describe, expect, it, vi } from 'vitest';
import { setNetlifyEnvVar } from '../../src/pushTargets/netlifyEnv.js';

const deps = { accessToken: 'nf-token-1', accountSlug: 'orbit-ai', siteId: 'site-123' };

describe('setNetlifyEnvVar', () => {
  it('PATCHes the account-scoped env endpoint with the right shape', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const result = await setNetlifyEnvVar({ ...deps, fetchImpl }, { key: 'TWENTY_CRM_API_KEY', value: 'tok-abc' });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.netlify.com/api/v1/accounts/orbit-ai/env/TWENTY_CRM_API_KEY',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ key: 'TWENTY_CRM_API_KEY', values: [{ value: 'tok-abc', context: 'production' }], scopes: ['functions', 'builds'] }),
      }),
    );
  });

  it('fails cleanly on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    const result = await setNetlifyEnvVar({ ...deps, fetchImpl }, { key: 'X', value: 'y' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('403');
  });

  it('fails cleanly when the network call itself throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await setNetlifyEnvVar({ ...deps, fetchImpl: fetchImpl as unknown as typeof fetch }, { key: 'X', value: 'y' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('network down');
  });
});
