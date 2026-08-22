# Orbit Command Center

Piece 1 of the lead-to-onboarding system (build order, per the project brief): a persistent
Operations Command Center, not a throwaway one-time credential wizard. This replaces an earlier
plan for a standalone Worker used once and torn down — confirmed before starting that nothing had
actually been built under that earlier plan (checked both this repo's git history and the
Cloudflare account's existing Workers directly), so there was nothing to restructure.

Nothing else in the build (n8n, the scraper, the KB generator, Twenty CRM wiring) can proceed
without credentials being gathered somewhere — that's why this is Piece 1.

## Status: checkpoint 1 — auth gate (code-complete, not yet deployed/verified)

Per the staged build-out, the wizard is checked in at three checkpoints:

1. **Auth working** — don't proceed past this un-gated. *(this checkpoint)*
2. Form + Secrets Store write working for a couple of test credentials.
3. Full field set + confirmation flow.

`src/index.ts` is a Cloudflare Worker that:

- Requires a `Cf-Access-Jwt-Assertion` header (present only when Cloudflare Access sits in front
  of the Worker and the caller already passed its login policy).
- Independently re-verifies that JWT itself (issuer + audience, via `jose` against the Access
  team's JWKS endpoint) rather than trusting the header's mere presence — defense in depth against
  an Access misconfiguration.
- Fails closed: if `TEAM_DOMAIN`/`POLICY_AUD` are still the placeholder values in `wrangler.toml`,
  it refuses every request with a 500 rather than silently serving unauthenticated.
- Renders a minimal confirmation page showing the verified caller's email — proof the gate is
  checking real identity, not just presence of *a* login screen.

**This checkpoint is not done yet** — it's written and typechecks, but nothing can deploy it or
configure Cloudflare Access from this session (no `wrangler`, no API token, no MCP tool for
Workers deploy / Access / Secrets Store here). See `DEPLOY.md` for the exact steps to run from
your machine, ending in a real verification (sign in with an `@orbitaiautomation.com` address,
confirm a non-domain address is refused, confirm `curl` with no session gets a 403).

## Explicitly not in scope yet

- The credential intake form (checkpoint 2) — no form fields exist yet, on purpose.
- Any write to Cloudflare Secrets Store (checkpoint 2).
- Piece 2 (the rest of the Command Center — pipeline visibility, system health) — lower priority,
  grows incrementally after the wizard ships; not started.

## Once deployed

Tell me the Worker's URL once you've completed `DEPLOY.md` and verified the Access gate actually
refuses unauthenticated/wrong-domain requests. Checkpoint 2 starts from there.
