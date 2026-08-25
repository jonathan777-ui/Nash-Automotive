import { describe, expect, it, vi } from 'vitest';
import { bindWorkerSecret } from '../src/cfWorkerSecrets.js';

const env = { CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1', CF_WORKER_SCRIPT_NAME: 'orbit-command-center' };

describe('bindWorkerSecret', () => {
  it('PUTs to the Workers script secrets endpoint with the right shape', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, result: {} }), { status: 200 }));
    const result = await bindWorkerSecret(env, { name: 'N8N_API_KEY', value: 'secret-value' }, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/workers/scripts/orbit-command-center/secrets',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'N8N_API_KEY', text: 'secret-value', type: 'secret_text' }),
      }),
    );
  });

  it('surfaces Cloudflare error details on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'invalid token' }] }), { status: 403 }));
    const result = await bindWorkerSecret(env, { name: 'X', value: 'y' }, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('invalid token');
  });

  it('fails cleanly when the network call itself throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await bindWorkerSecret(env, { name: 'X', value: 'y' }, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('network down');
  });
});
