# Phase 1 — MVP: Lead → Onboarding

Four scaffolded workflows, in the order a lead actually moves through them, plus three new
CRM-Architecture workflows added this pass (not brief-W-numbered — named in `05 §7/§13/§15`, not the
roadmap's own W-list). **Updated against brief v2 / `02 - Launch Checklist` v2** — Front Door Audit
added, Documenso replaced with lightweight inline e-sign, Stripe pulled forward into Phase 1. See
`workflows/README.md` for W1.3 and W1.5 (still documented-only — blocked on the Proposal document
format and the Onboarding Form's field schema, neither of which is specified yet).

## New this pass — the Contract lifecycle, closed out for real

`05 §13`'s Location Contract Lock and Contract Amendment Flow were both named since an early pass but
explicitly deferred as "Step 2/3 work." With the full spec re-confirmed against the source doc, both
are built now, plus the steady-state Billing Period rollover `05 §15` needs and W1.6 never built:

- **`location-contract-lock-check.workflow.json`** — a synchronous gate (same family as W2.6/W2.7):
  given a set of Location IDs and (optionally) the Company a deal would belong to, blocks when any
  Location already has an active Contract held by a **different** Company, and separately flags
  ("amendment candidates") when one's held by the **same** Company — the exact distinguishing rule
  the spec states. Fires the `05 §11`-named "Location Contract Lock conflict" alert on a block.
  **Wired for real into W1.6 below** (see that section) — unlike W2.6/W2.7, whose caller is the
  not-yet-built live-dial engine, this gate's caller already exists in this repo.
- **`contract-amendment-flow.workflow.json`** — the full flow for an EXISTING Company's Contract
  change: supersedes the old Contract (`status: 'Superseded'`, `supersededByContractId` set, never
  deleted), creates a new Contract version with recalculated Total/Agreement Value, writes a new
  **AccountingAuditEvent** (new object — see `CRM-OBJECT-MODEL.md`) logging old→new Contract IDs and
  before/after values, advances the driving Opportunity's stage to **`Expansion`** (a distinct bucket
  from the new-logo Won funnel, per spec), rolls the Billing Period over to the new Contract, and
  fires the `05 §11`-named "Contract Amendment logged" alert into `#accounting` (`05 §14`'s new
  channel). **Now has a real caller** — `command-center`'s `/deals-desk` page, built this pass (see
  `command-center/README.md`), backed by a new `deals-desk-lookup.workflow.json` (below) for the
  search/detail read side this write-only workflow never provided itself.
- **`deals-desk-lookup.workflow.json`** (new, supports the Deals Desk UI) — the read side
  `contract-amendment-flow.workflow.json` never had: a name search returning LiveClient Companies
  (`{searchTerm}`), or one Company's full detail plus its active Contract (`{companyId}`). Two
  responses, not a shared multi-item Merge — same reasoning `pipeline-reporting-digest.workflow.json`
  gives for avoiding an uncertain multi-input Merge node elsewhere in this repo.
- **`billing-period-rollover.workflow.json`** — schedule-triggered (daily), the third leg Billing
  Period needed: for every *unchanged* active Contract (not being amended), auto-creates the next
  monthly period once the current one's `periodEnd` passes. W1.6 creates period #1 on Won;
  `contract-amendment-flow.workflow.json` closes/reopens a period on an Amendment; this covers
  everything else, so no active Contract can ever run out of a current Billing Period.

All three share the same `revenueCents: 0`-on-creation simplification W1.6 already had: real revenue
linkage needs a recurring-charge Stripe webhook this repo doesn't wire up anywhere (only the initial
Checkout Session is handled) — flagged consistently, not solved three different ways.

## New this pass — audit gaps closed (`06`'s audit-gap list, not brief-W-numbered)

- **TCPA consent capture** — `lead-intake-to-demo-dashboard.workflow.json` (W1.1) now normalizes and
  writes a strict-boolean `tcpaConsent` field onto the Opportunity at intake. Enforced downstream by
  `phase-3-dialer-hopper/hopper-load-campaign.workflow.json`, not here — this workflow only records
  the fact; the dialer hopper is what actually excludes non-consenting leads from auto-dial.
- **`proposal-viewed.workflow.json`** — a webhook (`portal/public/proposal.html`'s fire-and-forget
  beacon, wired via `portal/netlify/functions/proposal-viewed.mts`) recording the first time a lead
  actually opens their Proposal page (`proposalViewedAt`, first-view-wins). Exists to give portal
  abandonment (below) a real "was this actually opened" signal instead of guessing from stage alone.
- **`portal-abandonment-followup.workflow.json`** — every 6 hours, finds `DemoCompleted`-stage
  Opportunities that were viewed (`proposalViewedAt` set) 48+ hours ago (judgment-call window, see the
  workflow's own trigger notes) and never followed up, drafts a gentle nudge via Claude (draft-only,
  human sends), and alerts `#portal-conversion`. Single-shot per Opportunity, not a repeating cadence.
- **`refund-request.workflow.json`** — a pure gate, not a processor: logs a refund request to a Twenty
  CRM Activity Event, notifies a named accounting recipient, and alerts `#accounting`. Never calls
  Stripe's refund API and never writes a "refunded" state anywhere — a human always processes the
  actual refund. Deliberately not built on Command Center's `ai_action_requests` table (that queue is
  specifically for AI-employee actions awaiting approval; a refund request was never an AI action).
- **Failed/declined payment dunning** — see W1.6's own section below.

`churn-winback.workflow.json` (the last audit-gap item, client health scoring's own consumer) lives in
`phase-4-intelligence-layer/`, documented in that phase's README instead — it depends on
`health-scoring.workflow.json`'s `engagementScore`, which is a Phase 4 output.

## W1.1 — `lead-intake-to-demo-dashboard.workflow.json`

Webhook (lead intake) → normalize the payload → **resolve or create a Location** (GBP/website-keyed
— new this pass, see below) → **fire Deep Dive Research and Front Door Audit in parallel** (per the
Launch Checklist's explicit "parallel Deep Dive Research + Front Door Audit" build step) → merge the
two results → write Front Door Audit onto the **Location**, Deep Dive Research + stage `Demo Queue`
onto the **Opportunity**.

**Front Door Audit is new in this version and not built anywhere in this repo.** The brief names its
output shape (a score, a rebuild target, a point lift, across "10 weighted categories") but not what
those 10 categories actually are or how they're weighted — building the real scoring logic now would
mean inventing that design, not encoding a decided one. Same treatment as Deep Dive Research: a
named placeholder URL, flagged clearly rather than guessed. Both should most likely end up as
dedicated Node/TS services (per the brief's own "standalone service, not n8n Code nodes"
architecture principle, already applied to the demo generator), once their contracts are decided.

**CRM write corrected for the CRM Architecture section (05 §13).** An earlier version of this
workflow dumped the full Deep Dive Research response into a CRM field — that directly violates the
Opportunity Card UX principle ("a status badge + button opening the actual tool in a new tab... no
embedded tools or inline live data inside the CRM itself; it references, it doesn't host"). Fixed to
write status fields + link-out report URLs instead.

**Object model migration (this pass, per `CRM-OBJECT-MODEL.md`):** Front Door Audit moved off the
Opportunity onto a Location — audits are inherently per-site, and an Opportunity spanning multiple
Locations needs an independent audit result for each, which a single Opportunity field couldn't
represent. This required adding a real Location resolve-or-create step (search by `gbpUrl`, fall
back to creating one) before the parallel research calls, so there's somewhere real to write the
audit result to. Deep Dive Research and the `Demo Queue` stage stayed on the Opportunity — see
`CRM-OBJECT-MODEL.md`'s anchor-decision table for the reasoning per field.

**Assumptions flagged, not silently made:** that the lead-intake caller posts the specific field
names this workflow expects (now including `gbpUrl`, separate from `websiteUrl`); that a Merge node
joins the two parallel research branches (its exact parameter shape is the most version-sensitive
part of this workflow — see the node's own `notes`); and that this workflow's caller has already
created the Opportunity (it resolves/creates the Location, not the Opportunity itself).

## W1.2 — `demo-generation-trigger.workflow.json`

The one workflow in this library calling a **real, already-built, already-tested** contract: this
repo's own `src/server/` `POST /generate-demo` (checkpoint 5). Webhook → call the demo generator →
branch on `ok` → advance the Opportunity to `Pending Demos` and write demo status to the target
Location on success, or fire an alert on failure.

**Object model migration (this pass):** demo generation is inherently per-Location (one GBP/business
per call to `/generate-demo`), so demo status now writes there, not just the Opportunity — the
triggering payload needs a `locationId` alongside `opportunityId` now. **Also fixed a real bug found
while making this change**: the CRM-write nodes previously read `$json.body.opportunityId`, but
`$json` at that point is the demo generator's own response (`{ok, unifiedKb, stepUsed}` or `{ok,
stage, reason}`), which has no `.body` field at all — that expression was always `undefined`. Fixed
to reference the original webhook trigger node directly, the same pattern the alert node already
used correctly. A `demoSiteUrl` link-out field on the Location is a natural addition once a real
demo-hosting URL exists (not yet, per root README's "Next" section).

**New this pass — Phase 5/W5.3 wiring.** A third fire-and-forget branch off `Generated OK?`'s success
path calls `phase-5-telnyx-activation/demo-extension-auto-assign.workflow.json`, so every successful
demo generation also gets a phone-dialable extension assigned automatically — see that phase's own
README for what that does and, honestly, what it still can't do (the actual live voice-AI bridge).

## W1.4 — `portal-esign-submitted.workflow.json` *(replaces the old Documenso-based workflow)*

*(Was mislabeled "W1.3" in an earlier version of this file — W1.3 is Proposal delivery, still
documented-only, cataloged in `workflows/README.md` not here. Fixed while reviewing this file for
the object model migration.)*

**Brief v2 change:** MVP e-sign is no longer Documenso — it's a lightweight inline capture (typed
name + checkbox + timestamp + IP) built directly into the Proposal page of the portal. Documenso
becomes an optional later upgrade, not an MVP dependency, and isn't in the credential set at all
anymore (see `command-center/src/vendors.ts`).

This workflow receives that capture from the portal → validates the payload minimally → advances the
Opportunity to `Contract Signed` in Twenty CRM, storing the signature fields (typed name, timestamp,
IP) directly — that's CRM-native audit-trail data, not a rendering of some other tool's content, so
it doesn't run into the Opportunity Card "no embedded data" principle the way raw research content
would. Responds synchronously (`responseNode`, not `onReceived`) since the portal's own JS needs to
know whether the sign was recorded before unlocking the Onboarding Form.

**CONFIRMED unchanged by the object model migration** (`CRM-OBJECT-MODEL.md`): e-sign is a pre-sale
event on the deal itself, so it correctly stays Opportunity-anchored — not moved to Company, unlike
what happens a few steps later once payment clears (see W1.6 below).

**Assumes the portal posts to n8n rather than writing to Twenty CRM directly** — consistent with the
brief's "single choke point through n8n" pattern used elsewhere, but not explicitly stated for this
specific write; worth confirming once the portal's own architecture is decided (not built in this
repo — see `workflows/README.md`'s Portal status).

## W1.6 — `stripe-payment-to-crm.workflow.json`

**Brief v2 change:** Stripe is no longer deferred to Phase 5 — "no verification-queue blocker like
Telnyx has, so no reason to defer the build itself." Built now with placeholder credentials
(`PLACEHOLDER_STRIPE_PUBLISHABLE_KEY`, `PLACEHOLDER_STRIPE_SECRET_KEY`,
`PLACEHOLDER_STRIPE_WEBHOOK_SECRET`), activating the moment real keys land via the Command Center
wizard.

Stripe webhook → **verify the signature** (a Code node implementing Stripe's documented HMAC scheme
— the algorithm itself is stable, but this is the single riskiest node in the whole library: it
depends on the webhook node actually exposing the *raw* request body, which is genuinely uncertain
for this n8n version; see the node's own `notes` for a safer architectural fallback if it doesn't
work as written) → classify the event type → **create the Company, create a Contract mirroring the
Opportunity's Locations, set each Location `Active`, create the first Billing/Accounting Period,
advance the Opportunity to `Won`** — or respond 200-but-unhandled for any other Stripe event (per
Stripe's own guidance, to avoid unnecessary retries).

**Object model migration (this pass) — the single most structurally significant change in this
library.** This workflow is where the pre-sale funnel object (Opportunity) hands off to the
client-relationship object (Company/Contract), per `CRM-OBJECT-MODEL.md`'s load-bearing distinction.
What changed:
- The terminal Opportunity stage is renamed from an earlier, invented "Live Client" to the brief's
  own literal wording: "all Locations on the Contract reach **Won** together" (`05 §7`).
- "Live Client" as a *concept* didn't disappear — it moved to the Company (`status: 'LiveClient'`),
  since that's the object that actually represents an ongoing client relationship post-sale. This is
  what fixed W4.3's (referral trigger) dangling query — see that workflow's own notes.
- A Contract is created on the new Company, mirroring the winning Opportunity's `locationIds`, and
  each of those Locations gets `contractStatus: 'ActiveM2M'` — this is the exact field Location
  Contract Lock will check once its enforcement workflow is built (not this pass).
- A first Billing/Accounting Period record is created (`05 §15`, new in v4) so nothing downstream
  has to special-case "no billing period yet" the moment a client goes live. Recurring monthly
  generation is now `billing-period-rollover.workflow.json` (above); COGS breakdown and commission
  *calculation* (as opposed to the `commissionStatus` lifecycle field, which exists) remain not
  built — no per-client usage-cost data exists anywhere in this repo yet to calculate them from.
- **New-logo path only, and now enforced, not just noted.** This workflow always creates a fresh
  Company — an existing Company adding a Location or changing tier is Contract Amendment Flow
  (`contract-amendment-flow.workflow.json`, above), built this pass. **`Check Location Contract
  Lock`/`Lock check allowed?`** (new nodes, right after `Fetch Opportunity`) call
  `location-contract-lock-check.workflow.json` for real before any Company/Contract gets created —
  if a named Location already has an active Contract under an unrelated Company, this workflow now
  responds `ok:true, handled:false` to Stripe (the payment itself isn't retried) and stops, leaving
  the conflict for a human to resolve, instead of silently creating a duplicate/conflicting Company.
- Tier is now reverse-derived from the paid amount against the brief's own known tier prices, since
  the portal doesn't currently pass a `tier` field in Stripe metadata (only `opportunityId`) —
  avoided a second coordinated change to `portal/` for this.
- **Failed/declined payment now has a distinct path (this pass, `06`'s audit-gap list: "failed/
  declined payment handling — retry/dunning, distinct CRM state").** The signature/classification
  node now recognizes `payment_intent.payment_failed`/`checkout.session.expired` alongside the
  existing success types, and a new **`Payment succeeded?`** IF node (right after `Relevant event
  type?`) splits the two: a real success continues into the Won/Contract path unchanged; a failure
  branches into `Fetch Opportunity (dunning)` → `Write dunning state` (writes `paymentStatus:
  'Failed'`, increments `dunningAttemptCount`, records `lastPaymentFailureReason` from Stripe's own
  `last_payment_error.message`) → `Alert: payment failed` (routes to `#portal-conversion` —
  `alertRouting.ts` matches `'stripe-payment'`) → a distinct `Respond: handled (dunning)`. No retry is
  triggered automatically anywhere in this path — retrying a charge is a billing action, gated to a
  human, same as every other billing/contract decision in this repo.

**Still true from before:** assumes the Checkout Session/PaymentIntent was created with
`metadata.opportunityId` set — `portal/netlify/functions/create-checkout-session.mts` does this
already, confirmed unaffected by the object model migration (checkout still happens pre-sale, so
`opportunityId` is still the right thing to carry).

## Shared caveats across all four

- **Twenty CRM's exact REST/GraphQL schema is unconfirmed.** Every write to Twenty CRM here assumes
  a REST endpoint shaped like `PATCH /rest/opportunities/{id}` with plain string fields — reasonable
  given Twenty CRM's general REST API pattern, but not checked against real API docs or a real
  instance from this sandbox. Confirm field names — especially whether `stage` is a literal string
  or a select-field option ID — before relying on these.
- **None of these four have been imported into a real n8n instance.** Node type strings/
  `typeVersion`s were checked against current n8n documentation and community examples via web
  search, not a live install (`docs.n8n.io` itself is egress-blocked from this sandbox). The Merge
  node (W1.1) and the raw-body/signature-verification path (W1.4) are the two most likely things
  here to need hand-fixing on import — flagged explicitly in their own node `notes`, not buried.
- Every external HTTP call uses a credential referenced **by name** (`Twenty CRM API`, `Stripe`),
  matching the same name the Command Center wizard writes to Cloudflare Secrets Store — no key is
  embedded in these files.
