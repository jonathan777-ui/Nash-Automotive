# Phase 1 — MVP: Lead → Onboarding

Four scaffolded workflows, in the order a lead actually moves through them. **Updated against brief
v2 / `02 - Launch Checklist` v2** — Front Door Audit added, Documenso replaced with lightweight
inline e-sign, Stripe pulled forward into Phase 1. See `workflows/README.md` for W1.3 and W1.5
(still documented-only — blocked on the Proposal document format and the Onboarding Form's field
schema, neither of which is specified yet).

## W1.1 — `lead-intake-to-demo-dashboard.workflow.json`

Webhook (lead intake) → normalize the payload → **fire Deep Dive Research and Front Door Audit in
parallel** (per the Launch Checklist's explicit "parallel Deep Dive Research + Front Door Audit"
build step — both branch off the same normalize node, not chained) → merge the two results → write
onto the Twenty CRM Opportunity with stage `Demo Queue`.

**Front Door Audit is new in this version and not built anywhere in this repo.** The brief names its
output shape (a score, a rebuild target, a point lift, across "10 weighted categories") but not what
those 10 categories actually are or how they're weighted — building the real scoring logic now would
mean inventing that design, not encoding a decided one. Same treatment as Deep Dive Research: a
named placeholder URL, flagged clearly rather than guessed. Both should most likely end up as
dedicated Node/TS services (per the brief's own "standalone service, not n8n Code nodes"
architecture principle, already applied to the demo generator), once their contracts are decided.

**CRM write corrected for the new CRM Architecture section (05 §13).** An earlier version of this
workflow dumped the full Deep Dive Research response into a CRM field — that directly violates the
Opportunity Card UX principle now documented explicitly ("a status badge + button opening the actual
tool in a new tab... no embedded tools or inline live data inside the CRM itself; it references, it
doesn't host"). Fixed to write status fields + link-out report URLs instead.

**Assumptions flagged, not silently made:** that "Demo Dashboard" is a view over Twenty CRM
Opportunity stages rather than a separate system (more directly supported now by §13's "single
Opportunity object... managed from the Company Card"); that the lead-intake caller posts the
specific field names this workflow expects; and that a Merge node joins the two parallel branches
(its exact parameter shape is the most version-sensitive part of this workflow — see the node's own
`notes`).

## W1.2 — `demo-generation-trigger.workflow.json`

Unchanged by brief v2. The one workflow in this library calling a **real, already-built,
already-tested** contract: this repo's own `src/server/` `POST /generate-demo` (checkpoint 5).
Webhook → call the demo generator → branch on `ok` → advance the Opportunity to `Pending Demos` on
success, or fire an alert on failure. Already fits the Opportunity Card principle as-is (writes a
status field only); a `demoSiteUrl` link-out field is a natural addition once a real demo-hosting
URL exists (not yet, per root README's "Next" section).

## W1.3 — `portal-esign-submitted.workflow.json` *(replaces the old Documenso-based workflow)*

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

**Assumes the portal posts to n8n rather than writing to Twenty CRM directly** — consistent with the
brief's "single choke point through n8n" pattern used elsewhere, but not explicitly stated for this
specific write; worth confirming once the portal's own architecture is decided (not built in this
repo — see `workflows/README.md`'s Portal status).

## W1.4 — `stripe-payment-to-crm.workflow.json` *(new)*

**Brief v2 change:** Stripe is no longer deferred to Phase 5 — "no verification-queue blocker like
Telnyx has, so no reason to defer the build itself." Built now with placeholder credentials
(`PLACEHOLDER_STRIPE_PUBLISHABLE_KEY`, `PLACEHOLDER_STRIPE_SECRET_KEY`,
`PLACEHOLDER_STRIPE_WEBHOOK_SECRET`), activating the moment real keys land via the Command Center
wizard.

Stripe webhook → **verify the signature** (a Code node implementing Stripe's documented HMAC scheme
— the algorithm itself is stable, but this is the single riskiest node in the whole library: it
depends on the webhook node actually exposing the *raw* request body, which is genuinely uncertain
for this n8n version; see the node's own `notes` for a safer architectural fallback if it doesn't
work as written) → classify the event type → advance the Opportunity straight to `Live Client` on a
completed payment, or respond 200-but-unhandled for any other Stripe event (per Stripe's own
guidance, to avoid unnecessary retries).

**Assumption flagged, not silently made:** the brief phrases this as one webhook advancing "Contract
Signed → Onboarding → Live Client," but doesn't specify why an intermediate Onboarding pause would
be needed once payment clears — this workflow jumps straight to `Live Client`, writing
`onboardingProvisioningStatus: 'Pending'` so the actual provisioning automation (W6.3, documented-
only, not built) has something to update rather than this workflow silently claiming provisioning
is done. Also assumes the Checkout Session/PaymentIntent was created with `metadata.opportunityId`
set — that has to happen wherever the Stripe payment link actually gets created (the portal's
Onboarding Form step, not built in this repo).

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
