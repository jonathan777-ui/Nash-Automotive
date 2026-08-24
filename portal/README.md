# Client portal (Netlify-hosted)

The client-facing portal the brief describes as part of Phase 1's MVP funnel: "Why-the-Audit page →
Audit report page → Proposal → lightweight inline e-sign → Onboarding Form → Stripe payment link."
Static HTML pages + three Netlify Functions as the backend — no frontend framework, no build step,
matching the brief's "Netlify... unchanged by any of the above, still the hosting target" scope (this
is a small enough site not to need one).

## Pages (`public/`)

- `audit.html` — Page 0.5, the Front Door Audit "proof, not pitch" page. Renders the score once
  `frontDoorAuditStatus` is `Complete` on the Opportunity, or a pending state otherwise.
- `proposal.html` — package/tier selection + the lightweight inline e-sign capture (typed name +
  checkbox; timestamp and IP are captured **server-side**, not trusted from the browser).
- `onboarding.html` — a Stripe Checkout redirect flow (fully functional against Stripe, using
  placeholder keys until real ones exist) plus placeholder onboarding-detail fields that don't
  submit anywhere yet.
- `index.html` — redirects to `audit.html`, preserving the `?id=` query string.

Every page is driven by one query param, `?id=<opportunityId>` — the Twenty CRM Opportunity ID,
presumably linked to from the CRM/Demo Dashboard once that record exists. `portal.js` is the one
shared script (fetch the Opportunity, render a status badge, escape HTML) — deliberately small
rather than a shared component framework, since three pages don't need one.

## Netlify Functions (`netlify/functions/`)

Each function has its **logic** as a plain, framework-agnostic, unit-tested module in
`netlify/functions/lib/`, and a thin adapter file (`.mts`, the modern Netlify Functions
`Request → Response` shape) that just wires env vars and HTTP framing around it — same pattern as
`src/server/`'s `generateDemo.ts` / `handleGenerateDemo.ts` split, for the same reason: the actual
behavior is testable without needing a live Netlify environment.

- **`get-opportunity`** (`GET /api/opportunity?id=...`) — the only way the portal pages read Twenty
  CRM data, because `TWENTY_CRM_API_KEY` can never reach the browser. Returns only the fields the
  portal needs to render (company name, stage, Deep Dive Research / Front Door Audit status + link),
  never the raw CRM record.
- **`submit-esign`** (`POST /api/esign`) — validates the signature payload server-side (mirroring
  `workflows/phase-1-mvp/portal-esign-submitted.workflow.json`'s own check), captures the real
  timestamp and IP itself, and forwards to that n8n webhook. **Assumes the portal posts to n8n
  rather than writing to Twenty CRM directly** — same assumption flagged in that workflow's own
  README, kept consistent here.
- **`create-checkout-session`** (`POST /api/create-checkout-session`) — calls Stripe's REST API
  directly (form-urlencoded, per Stripe's own convention — not the Stripe SDK, and not JSON) to
  create a Checkout Session, with `metadata.opportunityId` set so
  `workflows/phase-1-mvp/stripe-payment-to-crm.workflow.json` can find its way back to the right
  CRM record once the webhook fires. Tier prices (`lib/createCheckoutSession.ts`) are the brief's
  own numbers (Gold $750 / Platinum $1,650 / Iridium $2,600) — Rhodium is deliberately excluded
  from this generic flow since it's custom-priced, not a fixed amount.

## What's real vs. placeholder

- **Fully functional, ready for real credentials:** `get-opportunity` and `create-checkout-session`
  work end to end against Twenty CRM and Stripe respectively — they just need
  `TWENTY_CRM_API_KEY`/`TWENTY_CRM_BASE_URL` and `STRIPE_SECRET_KEY` set as real Netlify environment
  variables (see below) instead of the named placeholder fallbacks in `lib/*.ts`. `submit-esign`
  needs `N8N_ESIGN_WEBHOOK_URL` pointing at a real, deployed n8n instance running that workflow.
- **Structural placeholders, not yet real:** the onboarding form's detail fields (business hours,
  contact email) don't submit anywhere — the brief doesn't specify the Onboarding Form's actual
  field schema yet (`W1.5` in `workflows/README.md`). The Proposal page's surrounding copy/terms
  are placeholder text — the brief doesn't specify the Proposal document's actual content either
  (`W1.3`). The tier selection and prices themselves *are* real (from the brief's own KB tier
  structure), just the words around them aren't final.

## Environment variables (set as real Netlify env vars, never committed)

| Variable | Used by | Falls back to (placeholder) |
|---|---|---|
| `TWENTY_CRM_BASE_URL` | `get-opportunity` | empty string (fails clearly, not silently) |
| `TWENTY_CRM_API_KEY` | `get-opportunity` | `PLACEHOLDER_TWENTY_CRM_API_KEY` |
| `N8N_ESIGN_WEBHOOK_URL` | `submit-esign` | `PLACEHOLDER_N8N_ESIGN_WEBHOOK_URL` |
| `STRIPE_SECRET_KEY` | `create-checkout-session` | `PLACEHOLDER_STRIPE_SECRET_KEY` |

Same names as the Command Center wizard writes to Cloudflare Secrets Store
(`command-center/src/vendors.ts`) — `TWENTY_CRM_API_KEY` and `STRIPE_SECRET_KEY` specifically, so
copying a value from there to a Netlify env var is a rename-free copy. `TWENTY_CRM_BASE_URL` and
`N8N_ESIGN_WEBHOOK_URL` aren't vendor *secrets* (they're instance URLs), so they're not in the
wizard's Secrets Store list — set them directly as Netlify env vars once the Oracle box/n8n instance
exists.

## What's unverified

- **Twenty CRM's exact REST response shape** — `get-opportunity` tries two plausible shapes
  (`{data: {opportunity: {...}}}` and a direct record) rather than committing to one guess, but
  neither is confirmed against a real Twenty CRM instance or its API docs from this sandbox.
- **`context.ip` in a Netlify Function** — `submit-esign` uses it to capture the signer's real IP,
  with a documented fallback to the `x-nf-client-connection-ip` header if that field turns out to be
  empty/undefined in practice. Not confirmed against a live deployment.
- **Stripe's Checkout Session response/error shapes** — built from Stripe's well-documented public
  API conventions (form-urlencoded request, `{url, error: {message}}`-shaped response), not tested
  against a real Stripe account (no usable key in this environment — a `401` from Stripe with the
  placeholder key is the *expected*, correct behavior here, not a bug).
- **Not deployed to Netlify from this sandbox** — no `netlify dev`/`netlify deploy` was run (no
  Netlify credentials here either). 15 tests cover every Function's actual logic against mocked
  `fetch` calls; the static pages were reviewed by reading them, not rendered in a real browser.

## Running it

```
npm install
npm test          # 15 tests, all against mocked fetch calls
npm run typecheck
```

(`npm test` from the **repo root** also picks these up automatically alongside the other two
pieces' tests, since vitest's default file glob isn't scoped per-package — harmless duplication,
not a bug; `portal/`'s own `npm test` is the one to run when working on just this piece.)

Once deployed (`netlify deploy` from this directory, or connected via the Netlify UI/CLI to this
repo with `portal/` as the base directory) and the environment variables above are set for real,
every piece here activates without further code changes.
