# Orbit Command Center

Piece 1 of the lead-to-onboarding system (build order, per the project brief): a persistent
Operations Command Center, not a throwaway one-time credential wizard. This replaces an earlier
plan for a standalone Worker used once and torn down — confirmed before starting that nothing had
actually been built under that earlier plan (checked both this repo's git history and the
Cloudflare account's existing Workers directly), so there was nothing to restructure.

Nothing else in the build (n8n, the scraper, the KB generator, Twenty CRM wiring) can proceed
without credentials being gathered somewhere — that's why this is Piece 1.

## Status: all three checkpoints code-complete, none deployed/verified yet

Per the staged build-out, the wizard is checked in at three checkpoints:

1. **Auth working** — don't proceed past this un-gated. *(code-complete)*
2. Form + Secrets Store write working for a couple of test credentials. *(code-complete)*
3. Full field set + confirmation flow. *(code-complete)*

All three were built and typechecked in the same pass rather than waiting for a live deployment
cycle between each, since nothing here can be deployed from this session anyway and you said
you'd rather do the whole real setup in one sitting once it's built — see `DEPLOY.md` for the
full deploy + verify sequence, in order (Access gate first, form behind it, then the checklist).

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

### Checkpoint 3 — the full vendor checklist

- `src/vendors.ts` now lists every credential from `02 - Launch Checklist` (domain/DNS and R2
  backup storage excluded — neither is a secret to collect; R2 is already live per the checklist,
  and domain/DNS is a Cloudflare DNS config step, not an API key). Each vendor is tagged
  `authMode: 'cli' | 'manual'`.
- **CLI-auth vendors** (GitHub `gh auth login`, Netlify `netlify login`, Oracle `oci setup config`,
  Google Cloud `gcloud auth application-default login`) don't submit a secret through this form at
  all — per the brief, that credential material gets generated and written to Secrets Store
  separately, by you (likely with Claude Code driving a terminal session). This form's job for
  those rows is just a "mark connected" checkbox, tracked in a new Cloudflare KV namespace
  (`STATUS`) I provisioned directly during this build — a real, non-placeholder resource, since KV
  is one of the few things the tools in this session could actually create.
- **Manual-paste vendors** (Claude API, Gemini API, Grok API, Twenty CRM, Plunk, Documenso, n8n)
  work exactly like checkpoint 2, generalized to handle vendors needing more than one field (n8n
  needs both an instance URL and an API key).
- **Three rows are marked `⚠ unconfirmed`** in the UI: Oracle, Google Cloud, and Gemini/AI Studio.
  I could not verify from here whether Oracle's `oci setup config` is genuinely a one-click flow
  like the other three, whether `gcloud auth application-default login` alone is sufficient for
  Drive API access or just a first step, or whether the Gemini API key issuance might actually
  route through that same Google Cloud CLI login rather than needing its own manual paste. See the
  `uncertain` fields and their comments in `src/vendors.ts` for specifics — worth checking against
  reality during the checkpoint-3 walkthrough rather than assuming the guess is right.

## Explicitly not in scope

- Piece 2 (the rest of the Command Center — pipeline visibility, system health) — lower priority,
  grows incrementally after the wizard ships; not started.

## Once deployed

Tell me the Worker's URL once you've been through `DEPLOY.md` end to end — including which of the
three unconfirmed CLI rows turned out to be right, and whether the Secrets Store write needed the
one-line fix noted in checkpoint 2. From there this piece is done; Piece 3 (the KB demo generator,
`kb-source/` + `src/kb/` at the repo root) is next in priority order.
