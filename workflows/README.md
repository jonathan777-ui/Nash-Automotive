# Workflow & automations library

Every automation named in the project brief (`01 - Roadmap`, `02 - Launch Checklist`,
`03 - Claude Code Handoff Brief`), catalogued in one place, phase by phase. This is the map of the
*entire* lead-to-onboarding system — Command Center (`command-center/`) and the KB demo generator
(`src/server/`) are two pieces of it, not the whole thing.

**Read this before importing anything here.** n8n itself doesn't exist yet in this environment (no
Oracle box, no live n8n instance reachable from this sandbox) — every `.workflow.json` file below
was hand-written against n8n's documented export schema and node type strings, **not exported from
a real n8n instance and not verified by importing one back in.** Same discipline as everywhere else
in this repo when a live dependency isn't available: build it, flag exactly what's unverified,
don't guess silently. Treat every JSON file here as a strong first draft to import and correct
against a real n8n instance once one exists, not as tested output.

**Updated against brief v2** (`03 - Claude Code Handoff Brief` + the new `05 - Exhaustive Workflow &
Automation Library`): Front Door Audit added as a real, parallel-running piece; MVP e-sign is now a
lightweight inline capture, not Documenso; Stripe moved from deferred (Phase 5) into Phase 1 with
placeholder credentials; a new CRM Architecture section (added below) changed how the Phase 1
workflows write to Twenty CRM. Everything already built (Command Center, `src/server/`) was checked
against v2 and adjusted where it was affected — see each folder's own README for exactly what
changed and why.

## Status legend

| Status | Meaning |
|---|---|
| **Scaffolded** | A real `.workflow.json` file exists in this folder, ready to import and adjust once n8n + credentials exist. |
| **Partially built** | The workflow's real logic lives in a dedicated service already built in this repo (per the brief's "standalone service, not n8n Code nodes" pattern) — the workflow itself is just the thin n8n trigger/orchestration wrapper around it, not yet scaffolded. |
| **Documented only** | Cataloged below (trigger, steps, systems, gate) but not yet built as JSON — usually because a needed implementation detail isn't decided yet (see the note on each), and guessing it would risk baking in a wrong assumption. |
| **Not started** | Named in the roadmap for a later phase; no design work done yet. |

## Automation risk boundary (applies to every workflow below)

Per the brief: auto-execute anything reversible/internal (enrichment, scoring, drafting,
scheduling, internal alerts). Human gate on anything that sends externally beyond already-approved
operational messaging, anything touching billing/contract stage, anything irreversible. Humans stay
on sales (closing) and support (ticket resolution) — everything else automates as far as safely
possible. Each catalog entry below states which side of that line it's on.

---

## Phase 0 — Infrastructure Foundation

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W0.1 | Nightly backup | Schedule (cron) | Auto (internal, reversible) | **Scaffolded** — `phase-0-infrastructure/nightly-backup.workflow.json` |

**W0.1 — Nightly backup.** `pg_dump` on every Postgres DB (scraper, n8n's own DB if Postgres-backed,
Twenty CRM if/when self-hosted) + an n8n workflow-JSON export, both pushed to the Cloudflare R2
bucket `orbit-backups` (already live). Fails loudly (Slack/alert) rather than silently on any step.
See `phase-0-infrastructure/README.md`.

---

## Phase 1 — MVP: Lead → Onboarding (only Telnyx deferred)

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W1.1 | Lead intake → **parallel** Deep Dive Research + Front Door Audit → Demo Dashboard write | Webhook (lead form / scraper handoff) | Auto (enrichment, internal) | **Scaffolded**, with named placeholders for the two not-yet-built services — `phase-1-mvp/lead-intake-to-demo-dashboard.workflow.json` |
| W1.2 | Demo generation trigger | Webhook (Demo Dashboard "generate" action) | Auto (internal) | **Partially built** — real logic is `src/server/`'s `POST /generate-demo` (checkpoint 5, code-complete); this workflow is the thin n8n wrapper around it. **Scaffolded** — `phase-1-mvp/demo-generation-trigger.workflow.json` |
| W1.3 | Proposal delivery | Manual (rep sends) or CRM stage change | Auto to generate, human decides when to send | **Partially built** — `portal/public/proposal.html` exists and renders real tier/price options, but the surrounding proposal copy/terms are placeholder text (the brief doesn't specify the actual document content); no separate "delivery" workflow (email/link-send) is scaffolded. |
| W1.4 | Portal e-sign submitted → CRM advance | Webhook (portal's own lightweight inline e-sign capture) | Auto (internal stage advance) | **Scaffolded, both sides** — `portal/public/proposal.html` + `portal/netlify/functions/submit-esign.mts` (the real capture UI and its backend) posting to `phase-1-mvp/portal-esign-submitted.workflow.json` (the n8n side). |
| W1.5 | Onboarding Form submitted → CRM update | Webhook (portal form) | Auto (internal) | **Partially built** — `portal/public/onboarding.html` exists, but its detail fields (hours, contact email) are structural placeholders that don't submit anywhere yet; the brief doesn't specify the Onboarding Form's real field schema. The page's Stripe payment step (W1.6) is fully functional. |
| W1.6 | Stripe payment → CRM advance → Live Client | Webhook (Stripe) | Auto — the brief's own explicit resolution of the billing-stage tension (see below) | **Scaffolded, both sides** — `portal/netlify/functions/create-checkout-session.mts` (creates the real Checkout Session, tier prices from the brief) + `phase-1-mvp/stripe-payment-to-crm.workflow.json` (the webhook/CRM-advance side), both against placeholder Stripe credentials until real ones land. **v2 change:** pulled forward from Phase 5 (deferred) into Phase 1 — Stripe has no verification-queue blocker, unlike Telnyx. |
| W1.7 | Documents/Files access (PIN-gated, post-payment Drive folder repurposing) | Client action on the portal | Auto (internal, with an access audit log per §13) | Documented only |

Portal step order per the brief: Proposal (W1.3) → e-sign (W1.4) → Onboarding Form (W1.5) → Stripe
payment (W1.6). Full detail, node-by-node, for W1.1/W1.2/W1.4/W1.6: `phase-1-mvp/README.md`.

**Front Door Audit (new in v2) — not built as a service anywhere in this repo.** "Live scored audit
of the lead's actual website + AI-answer-engine readiness across 10 weighted categories (Score →
Rebuild Target → Point Lift)," running in parallel with Deep Dive Research on every lead, and
becoming Page 0.5 of the portal ("proof not pitch"). The brief names the *shape* of the output but
not the 10 categories themselves or their weighting — that's real design work, not something safe to
invent here. W1.1 calls it via a named placeholder URL, same treatment as Deep Dive Research.

**W1.7 (new, from §7/§13) — Documents/Files.** "PIN-gated via Netlify Function, with an audit log of
access" — the same per-client Drive folder created earlier in the funnel gets repurposed post-payment
as the file upload/intake point. Not scaffolded: needs the PIN-gating Netlify Function itself
designed (how the PIN is generated/delivered, what the audit log records) before there's a workflow
to write.

**Assumption flagged, not silently made:** the brief describes "Demo Dashboard stages: Demo Queue →
Pending Demos → No Show → Rescheduled → Demo Completed → Future Follow-up" as if it might be a
separate surface from Twenty CRM, but nothing in the brief specifies a distinct Demo Dashboard
database/schema — reinforced, not resolved, by the new CRM Architecture section's "single
Opportunity object... managed from the Company Card." This workflow assumes those six stages are
values of the Opportunity's pipeline **stage** field inside Twenty CRM itself. Worth confirming; if
wrong, every workflow here that "writes to the Demo Dashboard" needs its target changed.

---

## Phase 2 — Calendar + Nurture/CX Cadence + Alerts

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W2.1 | Unified calendar write-through | Any of: dialer, Demo Dashboard, Deals Desk scheduling an event | Auto (internal, reversible) | Documented only |
| W2.2 | Automated nurture cadence | Schedule (cold-opportunity check) | **Human gate** — drafts only, human approves/sends | Documented only |
| W2.3 | Post-onboarding CX touch cadence | Schedule, keyed off Stage = Live Client + tenure | Auto to draft/schedule the touch; send policy per W2.2's gate | Documented only |
| W2.4 | Alerts/notifications | Event-driven (high-value lead, no-show, overdue nurture touch, scraper batch ready) | Auto (internal alert, not external send) | **Scaffolded** — `phase-2-calendar-nurture-alerts/alert-dispatcher.workflow.json`. Real gap found while building it: neither Slack nor an SMS provider is in `02 - Launch Checklist` — see that folder's README. |
| W2.5 | Communications Hub write-through | Every Call/SMS/Social/Other touchpoint | Auto (internal, reversible logging) | Documented only |
| W2.6 | DNC enforcement | Permission check at the dialer action layer | **Hard gate** — not just a UI hide, a block requiring logged admin override for an exception call | **Scaffolded** (action-layer block only; the role-based UI hide is a Twenty CRM permissions config, not a workflow) — `phase-2-calendar-nurture-alerts/dnc-check.workflow.json` |

Not scaffolded yet: W2.1 needs the calendar's actual event schema and the System-Scheduled vs.
Human-Scheduled tagging convention decided against a real Google Calendar setup; W2.2/W2.3 need the
nurture/CX message *content* decided (the brief resolves the CX cadence's timing — 7/30/60/90-day
then quarterly — but not what each touch says).

**W2.4 — scaffolded this pass.** The dispatch mechanism itself (receive an alert, route to Slack
and/or SMS by severity) didn't need the undecided thresholds resolved first — only *what triggers*
an alert ("high-value lead," what counts as "overdue") is still undecided, and any future workflow
that decides those can just call the dispatcher that already exists. See
`phase-2-calendar-nurture-alerts/README.md` for a real gap found while building it: neither Slack
nor an SMS provider is in `02 - Launch Checklist` at all.

**W2.5 (new, from CRM Architecture §13)** — "Communications Hub — custom object covering Calls/SMS/
Social/Other, polymorphic to Person + Company + Opportunity — every touchpoint in one place
regardless of channel." Not scaffolded: this needs the Communications Hub's own object schema built
in Twenty CRM first (a custom object, not a standard one) before any workflow can write to it — a
Twenty CRM configuration step, not something to guess the shape of from here.

**W2.6 (new, from §5/§13) — the action-layer-block half scaffolded this pass.** The DNC list's
source turned out to be identifiable after all: CRM Architecture §13's post-loss routing section
names `restrictionReason` (DNC/Not Interested/Bad Information) as a field on the Opportunity itself
— see `phase-2-calendar-nurture-alerts/dnc-check.workflow.json`. The role-based UI-hiding half is
still a Twenty CRM permissions config, not a workflow, so it's not represented here.

Four of six Phase 2 automations are real and buildable once their remaining specifics exist —
cataloged here so none of them are lost, not because any is hard.

## Phase 3 — Dialer Hopper/Queue Logic (pre-Telnyx)

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W3.1 | Dialer hopper request | Agent action (pull from pool / request scrape) | Auto (internal) | Documented only |
| W3.2 | Per-user isolated queue assignment | Same as W3.1 | Auto (internal) | Documented only |
| W3.3 | Attempt/recycling matrix | Post-call, per attempt | Auto (internal scheduling logic) | **Scaffolded**, with the brief's actual numbers hard-coded (not placeholders) — `phase-3-dialer-hopper/attempt-recycling-matrix.workflow.json` |
| W3.4 | Post-call synthesis (strict 4-key JSON) | Call disposition event | Auto (internal — produces structured data, not an external send) | **Scaffolded**, using Claude Structured Outputs for the brief's exact 4-key contract — `phase-3-dialer-hopper/post-call-synthesis.workflow.json` |

**Explicit correction already captured in the roadmap itself:** this phase is data/workflow layer
only — no live call placement happens here (that's Phase 5, gated on Telnyx). Not scaffolded because
the hopper's actual data model (what a "record" looks like, how a batch is defined) isn't specified
independent of the scraper's own output schema (`04 - Scraper Deployment Scaffold`, a separate
in-progress piece).

**W3.3/W3.4 (from 05 §4 — Dialer & Outreach) — scaffolded this pass.** Unusually well-specified for
what had been "documented only" entries — the attempt matrix's actual numbers are given (6 attempts
no-answer, 4 busy, 8 gatekeeper, hard-stop on opt-out, 4-wave 90-120 day recycling, hard-coded
directly into the workflow rather than left as prose) and post-call synthesis's exact output
contract is given (a strict 4-key JSON: Disposition, Summary, Try-Back Time, DM Presence, enforced
via Claude's Structured Outputs). Neither is *wired to anything live* yet — both depend on the
dialer's own call-event data existing first, which needs Telnyx (Phase 5) or at minimum the
hopper/queue layer (W3.1/W3.2, still not built) generating real dispositions to react to — but the
decision logic itself is real and ready, not blocked on a design question the way W3.1/W3.2 still
are. See `phase-3-dialer-hopper/README.md`.

## Phase 4 — Intelligence Layer

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W4.1 | Client health/usage scoring | Schedule or usage-event | Auto (internal scoring) | Documented only |
| W4.2 | Tier upgrade/upsell signal | Off W4.1's output | Auto to flag/draft; human closes the upsell | Documented only |
| W4.3 | Referral trigger | Off tenure + engagement signal | Auto to flag; **human gate** on the actual outreach (external send) | **Scaffolded**, with named-placeholder thresholds (real numbers undecided) — `phase-4-intelligence-layer/referral-trigger.workflow.json` |
| W4.4 | AI employee (extends AI Activity Summary) | Various | **Human gate** per the brief's AI-employee scope: auto-execute reversible/internal, human gate on external-send/billing/irreversible | Documented only |
| W4.5 | Front Door Audit refresh | Schedule, Stage = Live Client | Auto (internal — produces a retention/upsell proof point, not itself an external send) | Documented only |
| W4.6 | Loss-reason capture | Opportunity marked Lost | Auto (internal capture) | **Scaffolded** — `phase-4-intelligence-layer/loss-reason-capture.workflow.json` |
| W4.7 | Opening-line conversion tracking | Deal outcome, keyed to Deep Dive's recommended opening | Auto (internal analytics) | Documented only |

**W4.3 and W4.6 scaffolded this pass** — see `phase-4-intelligence-layer/README.md` for both,
including W4.3's named-placeholder thresholds and its dependency on W4.1 (not built) for the
`engagementScore` field it filters on.

Still not scaffolded: W4.1's scoring formula (which usage signals, what weighting) isn't decided —
building it now would mean inventing the formula, not encoding a specified one. W4.2 depends on
W4.1. W4.4 references "the existing AI Activity Summary automation," which isn't present in this
Drive folder or this repo — worth locating before extending it. W4.5/W4.7 are each blocked on
something upstream that doesn't exist yet, not on an undecided design: W4.5 needs the Front Door
Audit service itself first (not built — see Phase 1); W4.7 needs Deep Dive Research's opening-line
recommendation to actually be a trackable, ID'd field on the Opportunity, which depends on Deep Dive
Research's own contract (also not built — see Phase 1).

**Iridium tier protection (05 §9, policy note, not a workflow):** the top service tier is explicitly
carved out of every automated pipeline change here — "untouched by automated pipeline changes;
requires human involvement + dedicated training first." Worth building tier-check guards into W4.1/
W4.2 (health scoring, upsell signals) once those exist, so Iridium accounts are excluded by
construction rather than by convention.

## Phase 5 — Telnyx Activation

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W5.1 | Telnyx SIP trunk / number provisioning | Manual (account setup) | N/A (infra, not a runtime automation) | Not started |
| W5.2 | Dialer live call placement (Preview/Power/3-Line) + AMD + local presence | Agent action | **Human gate** — a live outbound call is an external send | Not started |
| W5.3 | Demo extension auto-assignment (1000+) | Threshold/volume trigger | Auto (internal) | Not started |

Deliberately not started — the brief scopes Telnyx to Phase 5, the one piece with a genuine reason
to wait (SIP/number verification queues), same placeholder-strategy rule applied to `src/server/`
(`PLACEHOLDER_TELNYX_SIP_TRUNK` etc. where that infra would eventually plug in).

**Resolved in v2, was flagged as an open tension in the previous version of this library:** the
automation risk boundary's "human gate on anything touching billing/contract stage" and the
roadmap's "Stripe webhook auto-advances the CRM through Contract Signed → Live Client" read as
contradictory on their own. Brief v2 resolves it explicitly and moves Stripe into Phase 1 as the
one deliberate automated exception to that gate — see **W1.6** above, not this phase.

## Phase 6 — Reporting & Support Ticketing

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W6.1 | Pipeline reporting/dashboard | Schedule / on-demand | Auto (internal reporting) | Not started |
| W6.2 | Support ticketing intake | Webhook (client-facing form/email) | Auto to intake/route; human resolves (per "humans stay on... support") | Not started |
| W6.3 | Onboarding provisioning automation | Post-payment event | Auto (internal, reversible provisioning) | Not started |

## Phase 7 — Self-Hosted Twenty CRM Migration

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W7.1 | Twenty CRM cloud → Oracle self-host migration | Manual (one-time, post-stability) | N/A (infra migration, not a runtime automation) | Not started |

Explicitly sequenced *after* everything above is live and stable, per the roadmap — not a workflow
to build now.

---

## CRM Architecture (05 §13) — cross-cutting, not phase-specific

New section in brief v2, added because it "was referenced but never its own section" before. This
isn't a phase of workflows so much as the data model every CRM-writing workflow above has to respect
— already applied as a correction to W1.1 (see its entry above) and worth restating here as the
standing rule for anything written in this library from now on:

- **Object model** — a single Opportunity object (no separate Lead/Deal objects), spanning Cold
  Lead → Contacted → Demo Scheduled → Demo Completed → Won/Lost, managed from the Company Card. This
  is the strongest confirmation yet of this library's own "Demo Dashboard = a Twenty CRM stage view"
  assumption (still worth confirming directly, but now more load-bearing than a guess).
- **Communications Hub** and **Documents/Files object** — new custom-object concepts, cataloged as
  W2.5 (above) and a Phase 1 item respectively; neither is built.
- **Activity Event** — an append-only timeline; this is specifically what the AI Activity Summary
  automation (part of W4.4) writes into once built, not a separate workflow of its own.
- **Opportunity Card UX principle** — "a status badge + button opening the actual tool in a new tab
  ... no embedded tools or inline live data inside the CRM itself; it references, it doesn't host."
  **Binding on every workflow in this library that writes to Twenty CRM**, not just W1.1 (where it
  was already applied as a fix): write status fields and link-out URLs, never raw content from
  another system's response.
- **Post-loss routing** — two Opportunity fields (Post-Loss Track: Nurture/Restricted; Restriction
  Reason: DNC/Not Interested/Bad Information), not separate objects or pipelines — relevant to W4.6
  (loss-reason capture, above) once built: it should write to these two fields, not invent new ones.
- **DNC enforcement** — cataloged as W2.6 (above); cross-referenced here since §13 restates it
  alongside the CRM object model specifically because DNC status has to be checkable *from* the
  Opportunity record, not just enforced at the dialer.

## Internal Team Messaging (05 §14) — Command Center Piece 2, not urgent

New in brief v2, explicitly scoped as part of Command Center **Piece 2** (channel-based chat,
@mentions, in-app delivery of the same alerts as W2.4, comment threads attached to CRM records) —
"not a Slack replacement... separate, for team-to-team communication that lives inside the same tool
as everything else." External Slack (W2.4) keeps receiving system alerts regardless.

**Not a Phase 1 blocker and not scaffolded** — the brief itself sequences this after Piece 1 (the
wizard) ships, same as pipeline reporting (W6.1, also folded into Piece 2). Noted here so it isn't
lost, and noted in `command-center/README.md` as now-explicitly-in-scope for whenever Piece 2 work
starts.

---

## Credential naming — kept consistent with the Command Center

Every workflow that needs a vendor credential references it by the same name the Command Center
wizard writes to Cloudflare Secrets Store (`command-center/src/vendors.ts`), so wiring a real n8n
instance up later is a rename-free copy: `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `GROK_API_KEY`,
`TWENTY_CRM_API_KEY`, `PLUNK_API_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `N8N_INSTANCE_URL`, `N8N_API_KEY`. **`DOCUMENSO_API_KEY` is gone** — brief
v2 moved Documenso out of the Phase 1 credential set entirely (see `phase-1-mvp/README.md`). Where a
workflow needs a credential with no Secrets Store entry yet (e.g. the Places API key — see
`src/server/README.md`), that's flagged the same way there.

**Two more such gaps, found while building Phase 2's alert dispatcher:** `SLACK_WEBHOOK_URL` and
`SMS_PROVIDER_URL` are referenced by `phase-2-calendar-nurture-alerts/alert-dispatcher.workflow.json`
but neither Slack nor an SMS provider appears in `02 - Launch Checklist` at all — not even as a
deferred item. Worth resolving before that workflow matters for real; see that folder's README.

## How this library relates to the rest of the repo

- `command-center/` — Piece 1, gathers these credentials in the first place. Updated for v2: Stripe
  added to the vendor checklist, Documenso removed.
- `src/server/` — Piece 3, the demo generator W1.2 calls into directly. Unaffected by v2 — none of
  the changes (Front Door Audit, e-sign, Stripe, CRM Architecture) touch the KB demo generator's own
  scope.
- `portal/` — the client-facing portal (W1.3-W1.6's real UI + backend), built the pass after brief
  v2 landed. Its two fully functional Netlify Functions (`get-opportunity`,
  `create-checkout-session`) and the e-sign capture flow (`proposal.html` + `submit-esign`) are the
  other end of the W1.4/W1.6 workflows here — see `portal/README.md`.
- `phase-2-calendar-nurture-alerts/`, `phase-3-dialer-hopper/`, `phase-4-intelligence-layer/` — six
  more automations scaffolded this pass (W2.4, W2.6, W3.3, W3.4, W4.3, W4.6), picked because their
  *mechanics* weren't blocked on an undecided business rule even where their inputs — SLA thresholds
  for W4.3, live call-event data for W3.3/W3.4 — still are. Where a number genuinely wasn't decided
  (W4.3's referral thresholds), it's a named placeholder rather than an invented default, same
  pattern as every credential in this repo.
- Everything else here (Deep Dive Research, Front Door Audit, the Demo Dashboard/CRM write targets,
  nurture/CX content, health scoring, Telnyx activation, Internal Team Messaging, the dialer hopper
  itself) is **new scope this library surfaces but doesn't build** — cataloged so nothing named in
  the roadmap gets silently lost, with each "Documented only" / "Not started" entry stating exactly
  what's blocking it from being scaffolded for real.
