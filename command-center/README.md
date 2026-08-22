# Orbit Command Center

Piece 1 of the lead-to-onboarding system (build order, per the project brief): a persistent
Operations Command Center, not a throwaway one-time credential wizard. This replaces an earlier
plan for a standalone Worker used once and torn down — confirmed before starting that nothing had
actually been built under that earlier plan (checked both this repo's git history and the
Cloudflare account's existing Workers directly), so there was nothing to restructure.

Nothing else in the build (n8n, the scraper, the KB generator, Twenty CRM wiring) can proceed
without credentials being gathered somewhere — that's why this is Piece 1.

## Status: checkpoints 1 & 2 code-complete, neither deployed/verified yet

Per the staged build-out, the wizard is checked in at three checkpoints:

1. **Auth working** — don't proceed past this un-gated. *(code-complete)*
2. Form + Secrets Store write working for a couple of test credentials. *(code-complete)*
3. Full field set + confirmation flow. *(not started)*

Both 1 and 2 were built and typechecked in the same pass rather than waiting for a live
deployment cycle between them, since nothing here can be deployed from this session anyway — see
`DEPLOY.md`. Deploy and verify both together in one pass, in the order DEPLOY.md lays out (Access
gate first, then the form behind it).

### Checkpoint 1 — auth gate

`src/index.ts` requires and independently re-verifies a `Cf-Access-Jwt-Assertion` (issuer +
audience, via `jose` against the Access team's JWKS endpoint) rather than trusting the header's
mere presence, and fails closed with a 500 if `TEAM_DOMAIN`/`POLICY_AUD` are still placeholders.

### Checkpoint 2 — test credential form + Secrets Store write

- `src/vendors.ts` defines two manual-paste test vendors (Plunk, Documenso — neither has a known
  CLI-auth path, so they exercise the fallback path specifically, not the CLI-auth path).
- `POST /secrets` writes the submitted value into Cloudflare Secrets Store via
  `src/secretsStore.ts`.
- **Read `src/secretsStore.ts`'s header comment before trusting it.** The request shape is a
  confident inference from Cloudflare's REST conventions and the fully-documented `wrangler
  secrets-store secret create` CLI command — not a verified match against the live API. I could
  not fetch the literal OpenAPI reference for this endpoint (direct fetch to
  developers.cloudflare.com is blocked in this environment, and the Cloudflare-docs search tool
  available here only ever surfaced the wrangler CLI reference across several targeted queries,
  never the raw request/response schema). DEPLOY.md's verification step (9) is written assuming
  this might need a one-line fix — if the write 400s, the error is shown directly rather than
  swallowed, and the fix is almost certainly in that one file.
- The bootstrap credential the Worker uses to *write* to Secrets Store (`CF_API_TOKEN`) is a
  plain Wrangler secret, not something stored in Secrets Store itself — avoids the chicken-and-egg
  problem of needing Secrets Store access to bootstrap Secrets Store access.

## Explicitly not in scope yet

- The full vendor field set from `02 - Launch Checklist` (Oracle, GitHub, Netlify, Claude/Gemini/
  Grok, Twenty CRM, n8n, Google Drive, backup storage, domain/DNS) — checkpoint 3.
- Any CLI-auth vendor path — per the brief, those don't go through this web form at all. The
  realistic flow is Jonathan running `gh auth login` / `netlify login` / `oci setup config` /
  `wrangler login` in a terminal (likely in a live Claude Code session), with Claude Code handling
  the follow-up key generation and the eventual Secrets Store write from there. This form only
  covers vendors with no CLI-auth option. Checkpoint 3 needs to decide, vendor by vendor, which
  path each one takes — not decided yet.
- Piece 2 (the rest of the Command Center — pipeline visibility, system health) — lower priority,
  grows incrementally after the wizard ships; not started.

## Once deployed

Tell me the Worker's URL once you've completed `DEPLOY.md` for both checkpoints — including
whether the Secrets Store write worked as-is or needed the one-line fix noted above. Checkpoint 3
starts from there.
