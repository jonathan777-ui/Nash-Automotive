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
- **Manual-paste vendors** (Claude API, Gemini API, Grok API, Twenty CRM, Plunk, Stripe, n8n,
  Telnyx, and — new this pass — Netlify API access) work exactly like checkpoint 2, generalized to
  handle vendors needing more than one field (Twenty CRM needs a Base URL and an API token; Stripe
  needs a publishable key, secret key, and webhook signing secret; Telnyx needs five: an API key, a
  Call Control connection ID, a SIP domain, a default outbound number, and a shared demo-line
  number; Netlify API access needs a Personal Access Token, account slug, and site ID). See "The
  wizard now pushes credentials to where they're actually used," below, for what's new about n8n
  and Netlify specifically this pass.
- **Documenso is deliberately not in this list.** Brief v2 / `02 - Launch Checklist` v2 moved it
  out of Phase 1's credential set entirely — MVP e-sign is a lightweight inline capture built
  directly into the portal (typed name + checkbox + timestamp + IP, no vendor account needed).
  Documenso becomes an optional later upgrade, not something this wizard needs to gather yet.
- **Stripe is in this list even though real keys don't exist yet** — per brief v2, Stripe (unlike
  Telnyx) has no account-verification-queue blocker, so the whole payment-link + webhook + CRM
  stage-advance flow is built now against placeholder values and activates the moment real keys
  land here. See `workflows/phase-1-mvp/stripe-payment-to-crm.workflow.json`.
- **Five rows are marked `⚠ unconfirmed`** in the UI: Oracle, Google Cloud, Gemini/AI Studio,
  Telnyx, and — new this pass — the Netlify API row (below). I could not verify from here whether
  Oracle's `oci setup config` is genuinely a one-click flow like the other three, whether `gcloud
  auth application-default login` alone is sufficient for Drive API access or just a first step,
  whether the Gemini API key issuance might actually route through that same Google Cloud CLI login
  rather than needing its own manual paste, the exact number of manual setup steps in the Telnyx
  portal (SIP trunk creation, Call Control app, number search/ordering) behind the five fields that
  form collects, or Netlify's exact env-var API shape. See the `uncertain` fields and their
  comments in `src/vendors.ts` for specifics — worth checking against reality during the
  checkpoint-3 walkthrough rather than assuming the guess is right.

### The wizard now pushes credentials to where they're actually used (new this pass)

Every credential this form collects has always been written to Cloudflare Secrets Store as the
system of record — but until this pass, that's *all* it did. n8n and the portal (on Netlify) each
need their own copy of the same values, and getting them there was a fully manual step: `portal/
README.md`'s own env var table has said "same names... so copying a value from there to a Netlify
env var is a rename-free copy" since it was written — a rename-free copy a human still had to
actually perform.

**Now the wizard does that copy itself, best-effort, the moment you save a field**, reported right
back in the same success banner ("pushed to n8n as 'Claude API' (created)", "pushed to Netlify as
STRIPE_SECRET_KEY", or "n8n not connected yet — save the n8n API key above first"). Two new
"pusher" vendor rows make this possible:

- **n8n** — now collects only the API key (the Instance URL moved to a plain `wrangler.toml` var,
  fixing a real bug this pass found: the wizard used to write the Instance URL into Secrets Store,
  where nothing ever actually read it back). Saving the key binds it directly onto this Worker
  (`src/cfWorkerSecrets.ts`, Cloudflare's Workers Scripts API — the same mechanism `wrangler secret
  put` itself uses), not just Secrets Store, so this Worker's own code can use it afterward.
- **Netlify (API access)** — a new row, distinct from the existing Netlify CLI-auth row (that one's
  for *you* to deploy the portal from a terminal; this one's a Personal Access Token + account
  slug + site ID this Worker uses to push env vars into the portal's Netlify site on your behalf).

Once those two are connected, saving **Twenty CRM** (API token *and* the new Base URL field — also
new this pass, previously never collected at all even though every workflow/function in this repo
reads it), **Claude API**, **Telnyx**'s API key, or **Stripe**'s Secret key pushes automatically to
whichever of n8n (as a named Credential object) and/or Netlify (as a site env var) actually
consumes that value — see each vendor's own `hint` text in `src/vendors.ts` for exactly which
destinations apply to which field.

**Real, stated scope limit, not silently worked around:** this can only push values n8n reads
through a named Credential object. A lot of what this repo's workflows need — `TWENTY_CRM_BASE_URL`
inside n8n itself, `STRIPE_WEBHOOK_SECRET`, all four of Telnyx's non-API-key fields — are read as
n8n's own runtime `$env.SOMETHING` instead, which has no REST API to set remotely on a self-hosted
instance. Those still need adding to n8n's own environment directly (Docker Compose env / systemd
unit on the Oracle box) — flagged in the relevant vendor's own hint text, not hidden.

## Piece 2 — Internal Team Messaging (05 §14)

Per brief v2's `05 - Exhaustive Workflow & Automation Library` §14: channel-based chat, @mentions,
comment threads attached to CRM records, and in-app delivery of alerts. Explicitly scoped as
lower-priority/not-urgent in the brief — built anyway once asked, on the same "code it now, activate
on real credentials" discipline as everything else here.

**Status after the v4 review (`06 - Recent Changes Summary`):** the foundation (D1 schema, auth
routing, polling UI) holds up, but the first pass was built against Opportunity-only anchoring and a
free-form channel model, both of which v4 supersedes. Jonathan's requested sequence — object model,
alert-surface priority inversion (Step 3), fixed 11-channel taxonomy (Step 4), Tag-for-Action rebuilt
properly (Step 5) — is **now fully done.** See `CRM-OBJECT-MODEL.md` and `workflows/README.md` for
the full comparison and plan.

**Step 5 — Tag-for-Action rebuilt for real, done this pass.** `05 §14`'s actual mechanism: "@username
(or @AI-employee) + action + company (autocomplete), OR Opportunity ID paste + @target + note.
Human-to-human: personal notification + action button, logs to Activity Event. Human-to-AI: same
mechanism — read-only/reversible = immediate response, external-send/billing/irreversible = same
human-approval gate regardless of trigger." The old `@mention` highlighting in `mentions.ts` was
cosmetic only, not this — it's untouched, still just chat-message styling; Tag-for-Action is a whole
new mechanism sitting alongside it:

- **A real compose form** on `/messaging` (target type, target identifier, action, optional
  Opportunity ID, note) — `POST /messaging/tag-for-action` forwards it server-to-server to
  `tag-for-action.workflow.json` (n8n, new), which logs the durable Activity Event on Twenty CRM.
- **Human target → a personal notification.** New `notifications` D1 table (live, created via the
  Cloudflare MCP tools) + `POST /api/notifications` ingest (same machine-to-machine,
  `ALERTS_INGEST_SECRET`-gated pattern as `/api/alerts`, factored into a shared `withMachineAuth`
  helper this pass). Rendered in the sidebar, scoped to the viewer's own Access-verified email —
  one person never sees another's tags.
- **AI target → classified, then routed.** `tag-for-action.workflow.json` classifies the requested
  action against a small reversible-action set (summarize/research/draft-only); anything not
  recognized defaults to gated, erring toward human approval rather than risking an
  accidental auto-execute. **Reversible** calls Claude for real (same credential/header pattern as
  W3.4's post-call synthesis) and delivers the answer back as a notification, immediately.
  **Gated** creates a new `ai_action_requests` row (live D1 table) instead of calling Claude at
  all — visible in a new "AI actions awaiting approval" panel with Approve/Reject buttons
  (`POST /messaging/ai-actions/resolve`), the actual human-approval gate `05 §14` requires. Nothing
  in this codebase can move a gated request out of `pending` except that click.
- **Not built:** actually *executing* an approved gated action (e.g. really sending a drafted
  email) — Approve/Reject today only changes the request's status; resuming and executing after
  approval needs its own mechanism this repo doesn't have, flagged rather than faked. AI-to-AI
  ("posts into relevant topic channel, visually distinguished from human messages") also isn't
  built — that's system-to-system chatter between running AI agents, not a single request/response
  call the way Tag-for-Action's human-to-AI path is.

**Step 4 — the real 11-channel taxonomy, done this pass.** `05 §14` gives the exact channel map, not
a free-form model: `#new-leads`, `#demos`, `#dialer`, `#nurture`, `#portal-conversion`,
`#onboarding`, `#cx-retention`, `#missed-follow-ups`, `#system-alerts`, `#ai-agents`, `#accounting`.
All 11 seeded directly into the live `channels` table via the Cloudflare D1 MCP tools (the table was
empty — a clean insert, not a migration). `src/messaging/alertRouting.ts` (new, unit-tested) maps an
alert's `source` string to the right channel via substring match, falling back to `#system-alerts`
for anything unrecognized; `POST /api/alerts` computes this at ingest time and a new `channel` column
on `alerts` stores it. Each channel's own message view (`/messaging?channel=...`) now also renders
that channel's alerts above the chat thread — previously every alert only ever showed in the flat
"Recent alerts" sidebar regardless of what it was about.

- `src/messaging/db.ts` — all reads/writes against a **real, already-provisioned Cloudflare D1
  database** (`orbit-command-center-messaging`, created directly via the Cloudflare MCP tools during
  this build, same as the `STATUS` KV namespace was — not a placeholder). Schema: `channels`,
  `messages`, `mentions`, `comment_threads`, `comments`, `alerts`.
- **`comment_threads` migrated to polymorphic subjects this pass** — `subjectType` (`lead` /
  `opportunity` / `location` / `company` / `organization`) + `subjectId`, replacing the
  Opportunity-only `opportunityId` column, per Communications Hub's explicit polymorphism in §13.
  The live D1 table was empty (nothing deployed yet), so this was a clean drop-and-recreate, not a
  data migration — confirmed via a row count before touching it.
- `src/messaging/mentions.ts` — parses `@handle` mentions out of message/comment text. Not resolved
  against a real Workspace directory (none exists in this system yet) — a mention is stored as the
  literal typed handle; matching it to a real person's notification is follow-up work. **Note:**
  this is cosmetic highlighting only, not Tag-for-Action (§14's actual mechanism — autocomplete,
  action button, Activity Event log, human-to-AI gate) — flagged in the v4 comparison as the wrong
  shape to grow from. Tag-for-Action is now built separately (Step 5, above), not extended from
  this; `mentions.ts` itself is untouched, still just chat-message styling.
- `src/messaging/routes.ts` — the HTTP handlers + server-rendered HTML (channel list, message
  thread with lightweight polling for a "feels live" update without a full page reload, a comment
  thread page keyed by `?subjectType=&subjectId=`, and a recent-alerts panel).
- New routes wired into `src/index.ts`: `GET/POST /messaging`, `GET/POST /messaging/thread`,
  `POST /messaging/alerts/acknowledge` (new this pass — see Step 3 below), and `POST /api/alerts`.
  That last one is deliberately **not** behind Cloudflare Access — n8n's alert-dispatcher workflow
  calls it machine-to-machine and can't complete an interactive Access login, so it's checked
  *before* the Access gate and authenticated with its own shared secret (`ALERTS_INGEST_SECRET`, a
  plain Wrangler secret like `CF_API_TOKEN` — never in Secrets Store or `wrangler.toml`, since
  that's the credential this Worker uses to *receive* pushes, not one a human submits through the
  form). Until that secret is set for real, `/api/alerts` returns 401 on every request rather than
  silently accepting unauthenticated writes. **`/messaging/alerts/acknowledge`, by contrast, IS
  behind Access** — it's the human-facing action a rep takes, routed alongside every other
  `/messaging/*` page.
- 28 tests (`command-center/npm test`) against a fake D1 (records calls, returns queued results —
  same pattern as the `fakeClient()` mocks used for Anthropic calls elsewhere in this repo), plus
  the alerts-ingest auth logic specifically (rejects a missing/wrong/placeholder secret).

**Step 3 — alert-surface priority fix, done this pass.** `05 §11` states Command Center messaging is
the *primary* alert surface (actionable buttons, deep-link to exact action) and Google Chat is
*secondary* (external-visibility-only); the alert-dispatcher workflow used to treat them as roughly
parallel targets with no distinction. Fixed by making each surface actually match its role:
  - **`alerts` gained `link_url`, `acknowledged_by`, `acknowledged_at` columns** (applied directly
    to the live D1 database via the Cloudflare MCP tools, same "actually do it with the live tools
    available" discipline as the table's original creation — not a migration file sitting unapplied).
  - **`recordAlert`/`listRecentAlerts`/`POST /api/alerts` carry the alert's `linkUrl` through** — the
    n8n alert-dispatcher workflow (W2.4) now forwards it when the triggering event names a specific
    record.
  - **`/messaging`'s alert rows are now actionable**: a real "Open record →" link when `linkUrl` is
    set, and an Acknowledge button (`POST /messaging/alerts/acknowledge`, first-to-acknowledge wins —
    a repeat click on an already-acknowledged alert is a no-op) that shows who handled it once
    clicked. This is the concrete difference between "primary, actionable surface" and "a text log."
  - **Google Chat/SMS are now explicitly secondary**: both messages gained a link back to
    `{COMMAND_CENTER_URL}/messaging` appended to the existing severity/source/message text, instead
    of being a dead-end notification with nothing pointing back to the actionable surface.

**Not built:** real-time push (WebSocket via a Durable Object) — the message/comment views poll
every 5s instead, which is simple, testable, and good enough for a "not urgent" internal tool; a
natural v2 upgrade if it ever needs to feel more instant (the notifications/AI-actions panels added
in Step 5 aren't included in that 5s poll either yet — same limitation, a full page load/nav shows
them). Steps 4 and 5 are both done, per the Status line above — see `workflows/README.md`'s Internal
Team Messaging section for the original staged plan.

Pipeline visibility/reporting (the rest of Piece 2, absorbing Phase 6's W6.1) is now built as a
weekly digest posted to `#accounting` (`workflows/phase-6-reporting-support/pipeline-reporting-digest.workflow.json`)
rather than a live Command Center page — no brief-v2 urgency behind a real dashboard UI the way
messaging had. System health remains not started.

## Deals Desk + Dialer (new this pass — the Deals Desk/dialer UI task)

Two new pages, `/dialer` and `/deals-desk`, closing what was by far the largest gap flagged
throughout this whole build: every backend piece the dialer hopper (Phase 3) and Contract Amendment
Flow needed was real and callable, but nothing in this repo actually called them in sequence for a
live rep. Same architecture as everything else here — server-rendered HTML, no client-side
framework, Cloudflare Access-gated — and the same "Command Center never talks to Twenty CRM
directly" rule Tag-for-Action already follows: both pages call out to two small new n8n workflows
(`rep-lookup.workflow.json`, `deals-desk-lookup.workflow.json`, `workflows/phase-3-dialer-hopper/`
and `phase-1-mvp/`) rather than reading Twenty CRM themselves.

- **`/dialer`** — Get next call (`hopper-request-next.workflow.json`, W3.1) → Place call
  (`dialer-place-call.workflow.json`, Phase 5/W5.2 — gated by DNC/compliant-hours the moment the
  rep actually dials, not before) → Call wrap-up (`call-wrap-up.workflow.json`, W3.6, required
  before the next call can be claimed). The in-progress call's state round-trips through a single
  base64-encoded `state=` query param between actions (no server-side session store), same encoding
  Telnyx's own `client_state` mechanism already uses in `dialer-place-call.workflow.json` — a
  pattern reused, not invented fresh for this page. A real gap found and fixed while building this:
  Location never had a `phone` field anywhere in `CRM-OBJECT-MODEL.md`, even though the ingestion
  pipeline (`src/company/types.ts`'s `CompanyProfile`) already carried one — now written at lead
  intake and returned by `hopper-request-next.workflow.json`'s claim response.
- **`/deals-desk`** — search LiveClient Companies → view one's active Contract → submit an
  amendment (`contract-amendment-flow.workflow.json`, `05 §7/§13` — a new Contract version,
  superseding the old one, never an edit in place). This is the exact "rep action (Deals Desk, not
  built)" caller that workflow's own notes have named as missing since it was written.

**Not built: real live-call audio.** The rep's own SIP softphone/desk-phone client (dialing their
internal Telnyx extension, `Rep.sipExtension`) carries the actual call audio once Telnyx bridges the
two legs — this page shows and controls call *metadata* (who to call, disposition, wrap-up), the
same way many real-world dialer UIs work; it doesn't embed a WebRTC audio client, which would be a
materially different, telephony-SDK-specific frontend task.

## Once deployed

Tell me the Worker's URL once you've been through `DEPLOY.md` end to end — including which of the
three unconfirmed CLI rows turned out to be right, and whether the Secrets Store write needed the
one-line fix noted in checkpoint 2. From there this piece is done; Piece 3 (the KB demo generator,
`kb-source/` + `src/kb/` at the repo root) is next in priority order.
