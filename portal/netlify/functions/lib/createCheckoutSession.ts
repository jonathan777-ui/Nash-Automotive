/** Tier structure per the brief (03 - Claude Code Handoff Brief, Piece 3 / KB system structure) -
 * Gold/Platinum/Iridium are fixed prices, Rhodium is "custom" (no fixed amount, so it's excluded
 * from this map entirely rather than guessing a number - a Rhodium checkout needs a manually-priced
 * Stripe Price/Payment Link, not this generic flow). */
export const TIER_PRICES_CENTS: Record<string, number> = {
  Gold: 75000,
  Platinum: 165000,
  Iridium: 260000,
};

/** CONFIRMED unchanged by the object model migration (CRM-OBJECT-MODEL.md): Checkout happens
 * pre-sale, so opportunityId is still the right thing to carry in Stripe's metadata here — it's
 * workflows/phase-1-mvp/stripe-payment-to-crm.workflow.json's job (not this function's) to resolve
 * the Opportunity into a Company/Contract/Location set once the webhook fires on success. */
export interface CheckoutInput {
  opportunityId: string;
  tier: string;
}

export interface CreateCheckoutSuccess {
  ok: true;
  checkoutUrl: string;
}
export interface CreateCheckoutFailure {
  ok: false;
  status: number;
  reason: string;
}
export type CreateCheckoutResult = CreateCheckoutSuccess | CreateCheckoutFailure;

export interface CreateCheckoutDeps {
  stripeSecretKey: string;
  successUrl: string;
  cancelUrl: string;
  fetchImpl?: typeof fetch;
}

/** Calls Stripe's REST API directly (form-urlencoded, per Stripe's own API convention - NOT JSON,
 * a common mistake) rather than pulling in the Stripe SDK - this is the only Stripe-touching code
 * in the repo and it's small enough that a dependency wasn't worth it. UNVERIFIED against a real
 * Stripe account (no usable key in this environment - deps.stripeSecretKey is the named placeholder
 * PLACEHOLDER_STRIPE_SECRET_KEY until the Command Center wizard writes a real one), but a 401 from
 * Stripe with a placeholder key is the CORRECT behavior here, not a bug - same "fails clearly, not
 * silently" pattern as everywhere else a live credential is still a placeholder. */
export async function createCheckoutSession(
  input: CheckoutInput,
  deps: CreateCheckoutDeps,
): Promise<CreateCheckoutResult> {
  if (!input.opportunityId?.trim()) return { ok: false, status: 400, reason: 'Missing opportunity id.' };

  const amountCents = TIER_PRICES_CENTS[input.tier];
  if (!amountCents) {
    return {
      ok: false,
      status: 400,
      reason:
        `"${input.tier}" has no fixed price (valid: ${Object.keys(TIER_PRICES_CENTS).join(', ')}, or ` +
        `"Rhodium" which is custom-priced and not supported by this generic checkout flow).`,
    };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    mode: 'payment',
    success_url: deps.successUrl,
    cancel_url: deps.cancelUrl,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amountCents),
    'line_items[0][price_data][product_data][name]': `Orbit AI — ${input.tier} tier`,
    'line_items[0][quantity]': '1',
    'metadata[opportunityId]': input.opportunityId,
  });

  let response: Response;
  try {
    response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  } catch (err) {
    return { ok: false, status: 502, reason: `Could not reach Stripe: ${(err as Error).message}` };
  }

  const responseBody = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: responseBody?.error?.message ?? `Stripe returned ${response.status}.`,
    };
  }

  if (!responseBody?.url) {
    return { ok: false, status: 502, reason: 'Stripe response had no checkout URL.' };
  }

  return { ok: true, checkoutUrl: responseBody.url };
}
