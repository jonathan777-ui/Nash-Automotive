import { describe, expect, it, vi } from 'vitest';
import { createCheckoutSession } from '../netlify/functions/lib/createCheckoutSession.js';

const deps = {
  stripeSecretKey: 'sk_test_placeholder',
  successUrl: 'https://portal.example.com/onboarding.html?ok=1',
  cancelUrl: 'https://portal.example.com/onboarding.html?ok=0',
};

describe('createCheckoutSession', () => {
  it('rejects an unknown tier (e.g. Rhodium, which is intentionally not in the price map)', async () => {
    const fetchImpl = vi.fn();
    const result = await createCheckoutSession(
      { opportunityId: 'opp-1', tier: 'Rhodium' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Rhodium');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a missing opportunity id', async () => {
    const result = await createCheckoutSession({ opportunityId: '', tier: 'Gold' }, deps);
    expect(result.ok).toBe(false);
  });

  it('sends the correct form-urlencoded body (not JSON) with the tier price and opportunity metadata', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_123' }), { status: 200 }),
    );
    const result = await createCheckoutSession(
      { opportunityId: 'opp-1', tier: 'Platinum' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test_123');

    const [url, init] = fetchImpl.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers.Authorization).toBe('Bearer sk_test_placeholder');
    const sentBody = new URLSearchParams(init.body as string);
    expect(sentBody.get('line_items[0][price_data][unit_amount]')).toBe('165000');
    expect(sentBody.get('metadata[opportunityId]')).toBe('opp-1');
  });

  it('surfaces Stripe error messages (e.g. an invalid placeholder key) rather than a generic failure', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid API Key provided' } }), { status: 401 }),
    );
    const result = await createCheckoutSession(
      { opportunityId: 'opp-1', tier: 'Gold' },
      { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.reason).toContain('Invalid API Key');
    }
  });
});
