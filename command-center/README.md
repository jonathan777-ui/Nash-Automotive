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

- `src/vendors.ts` defines two manual-paste test vendors (Plunk, Stripe — neither has a known
  CLI-auth path, so they exercise the fallback path specifically, not the CLI-auth path). Was
  (Plunk, Documenso) originally; swapped when Documenso dropped out of the Phase 1 credential set
  — see checkpoint 3's note below.
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
- **Manual-paste vendors** (Claude API, Gemini API, Grok API, Twenty CRM, Plunk, Stripe, n8n) work
  exactly like checkpoint 2, generalized to handle vendors needing more than one field (n8n needs
  both an instance URL and an API key; Stripe needs a publishable key, secret key, and webhook
  signing secret).
- **Documenso is deliberately not in this list.** Brief v2 / `02 - Launch Checklist` v2 moved it
  out of Phase 1's credential set entirely — MVP e-sign is a lightweight inline capture built
  directly into the portal (typed name + checkbox + timestamp + IP, no vendor account needed).
  Documenso becomes an optional later upgrade, not something this wizard needs to gather yet.
- **Stripe is in this list even though real keys don't exist yet** — per brief v2, Stripe (unlike
  Telnyx) has no account-verification-queue blocker, so the whole payment-link + webhook + CRM
  stage-advance flow is built now against placeholder values and activates the moment real keys
  land here. See `workflows/phase-1-mvp/stripe-payment-to-crm.workflow.json`.
- **Three rows are marked `⚠ unconfirmed`** in the UI: Oracle, Google Cloud, and Gemini/AI Studio.
  I could not verify from here whether Oracle's `oci setup config` is genuinely a one-click flow
  like the other three, whether `gcloud auth application-default login` alone is sufficient for
  Drive API access or just a first step, or whether the Gemini API key issuance might actually
  route through that same Google Cloud CLI login rather than needing its own manual paste. See the
  `uncertain` fields and their comments in `src/vendors.ts` for specifics — worth checking against
  reality during the checkpoint-3 walkthrough rather than assuming the guess is right.

## Piece 2 — Internal Team Messaging (05 §14), built this pass

Per brief v2's new `05 - Exhaustive Workflow & Automation Library` §14: channel-based chat,
@mentions, comment threads attached to CRM records, and in-app delivery of the same alerts
`workflows/phase-2-calendar-nurture-alerts/alert-dispatcher.workflow.json` sends to Google Chat.
Explicitly scoped as lower-priority/not-urgent in the brief — built anyway once asked, on the same
"code it now, activate on real credentials" discipline as everything else here.

- `src/messaging/db.ts` — all reads/writes against a **real, already-provisioned Cloudflare D1
  database** (`orbit-command-center-messaging`, created directly via the Cloudflare MCP tools during
  this build, same as the `STATUS` KV namespace was — not a placeholder). Schema: `channels`,
  `messages`, `mentions`, `comment_threads`, `comments`, `alerts`.
- `src/messaging/mentions.ts` — parses `@handle` mentions out of message/comment text. Not resolved
  against a real Workspace directory (none exists in this system yet) — a mention is stored as the
  literal typed handle; matching it to a real person's notification is follow-up work.
- `src/messaging/routes.ts` — the HTTP handlers + server-rendered HTML (channel list, message
  thread with lightweight polling for a "feels live" update without a full page reload, a comment
  thread page keyed by `?opportunityId=`, and a recent-alerts panel).
- New routes wired into `src/index.ts`: `GET/POST /messaging`, `GET/POST /messaging/thread`,
  and `POST /api/alerts`. That last one is deliberately **not** behind Cloudflare Access — n8n's
  alert-dispatcher workflow calls it machine-to-machine and can't complete an interactive Access
  login, so it's checked *before* the Access gate and authenticated with its own shared secret
  (`ALERTS_INGEST_SECRET`, a plain Wrangler secret like `CF_API_TOKEN` — never in Secrets Store or
  `wrangler.toml`, since that's the credential this Worker uses to *receive* pushes, not one a human
  submits through the form). Until that secret is set for real, `/api/alerts` returns 401 on every
  request rather than silently accepting unauthenticated writes.
- 19 tests (`command-center/npm test`) against a fake D1 (records calls, returns queued results —
  same pattern as the `fakeClient()` mocks used for Anthropic calls elsewhere in this repo), plus
  the alerts-ingest auth logic specifically (rejects a missing/wrong/placeholder secret).

**Not built:** real-time push (WebSocket via a Durable Object) — the message/comment views poll
every 5s instead, which is simple, testable, and good enough for a "not urgent" internal tool; a
natural v2 upgrade if it ever needs to feel more instant. Also not built: wiring an actual link to
a comment thread onto a Twenty CRM Opportunity Card (per §13's "status badge + button opening the
actual tool in a new tab" pattern) — the thread page itself is ready at a stable URL
(`/messaging/thread?opportunityId=...`), but nothing yet writes that URL onto the Opportunity; a
one-line addition to `workflows/phase-1-mvp/lead-intake-to-demo-dashboard.workflow.json` once
that's wanted.

Pipeline visibility/reporting and system health (the rest of Piece 2, absorbing Phase 6's W6.1)
remain not started — lower priority, no brief-v2 urgency behind them the way messaging had.

## Once deployed

Tell me the Worker's URL once you've been through `DEPLOY.md` end to end — including which of the
three unconfirmed CLI rows turned out to be right, and whether the Secrets Store write needed the
one-line fix noted in checkpoint 2. From there this piece is done; Piece 3 (the KB demo generator,
`kb-source/` + `src/kb/` at the repo root) is next in priority order.
