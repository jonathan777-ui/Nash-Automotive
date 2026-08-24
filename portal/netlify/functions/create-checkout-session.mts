import type { Context, Config } from '@netlify/functions';
import { createCheckoutSession, type CheckoutInput } from './lib/createCheckoutSession.js';

export default async (req: Request, _context: Context): Promise<Response> => {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = input as Partial<CheckoutInput> | null;
  if (typeof body?.opportunityId !== 'string' || typeof body?.tier !== 'string') {
    return new Response(JSON.stringify({ ok: false, reason: 'Body must be {opportunityId: string, tier: string}.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const origin = new URL(req.url).origin;
  const result = await createCheckoutSession(body as CheckoutInput, {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? 'PLACEHOLDER_STRIPE_SECRET_KEY',
    successUrl: `${origin}/onboarding.html?id=${encodeURIComponent(body.opportunityId)}&payment=success`,
    cancelUrl: `${origin}/onboarding.html?id=${encodeURIComponent(body.opportunityId)}&payment=cancelled`,
  });

  return new Response(
    JSON.stringify(result.ok ? { ok: true, checkoutUrl: result.checkoutUrl } : { ok: false, reason: result.reason }),
    { status: result.ok ? 200 : result.status, headers: { 'Content-Type': 'application/json' } },
  );
};

export const config: Config = {
  path: '/api/create-checkout-session',
};
