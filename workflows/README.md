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
placeholder credentials. Everything already built (Command Center, `src/server/`) was checked
against v2 and adjusted where it was affected — see each folder's own README for exactly what
changed and why.

**Updated again against brief v4** (`06 - Recent Changes Summary` + `05` FINAL v4): the CRM object
model changed twice since — Location added as its own object, an Opportunity can span multiple
Locations, Company/Organization/Contract/Billing-Accounting-Period all locked in. This was reviewed
against everything already built before touching anything (per Jonathan's explicit request), then
migrated in the agreed order: object model first. **`CRM-OBJECT-MODEL.md` at the repo root is now
the canonical reference** for which object every workflow/function anchors to and why — see the CRM
Architecture section below for the full comparison and what moved.

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
bucket `orbit-backups` (already live). Fails loudly (Google Chat/alert) rather than silently on any step.
See `phase-0-infrastructure/README.md`.

---

## Phase 1 — MVP: Lead → Onboarding (only Telnyx deferred)

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W1.1 | Lead intake → resolve/create Location → **parallel** Deep Dive Research + Front Door Audit → Location + Opportunity writes | Webhook (lead form / scraper handoff) | Auto (enrichment, internal) | **Scaffolded**, with named placeholders for the two not-yet-built services — `phase-1-mvp/lead-intake-to-demo-dashboard.workflow.json`. **Object model migration:** now resolves/creates a Location (GBP-driven) before running the two research calls; Front Door Audit writes to that Location, Deep Dive Research + Demo Queue stage stay on the Opportunity. |
| W1.2 | Demo generation trigger | Webhook (Demo Dashboard "generate" action) | Auto (internal) | **Partially built** — real logic is `src/server/`'s `POST /generate-demo` (checkpoint 5, code-complete); this workflow is the thin n8n wrapper around it. **Scaffolded** — `phase-1-mvp/demo-generation-trigger.workflow.json`. **Object model migration:** demo status now also writes to the target Location; fixed a pre-existing bug where the CRM writes read a nonexistent `$json.body` field instead of the original webhook payload. |
| W1.3 | Proposal delivery | Manual (rep sends) or CRM stage change | Auto to generate, human decides when to send | **Partially built** — `portal/public/proposal.html` exists and renders real tier/price options, but the surrounding proposal copy/terms are placeholder text (the brief doesn't specify the actual document content); no separate "delivery" workflow (email/link-send) is scaffolded. |
| W1.4 | Portal e-sign submitted → CRM advance | Webhook (portal's own lightweight inline e-sign capture) | Auto (internal stage advance) | **Scaffolded, both sides** — `portal/public/proposal.html` + `portal/netlify/functions/submit-esign.mts` (the real capture UI and its backend) posting to `phase-1-mvp/portal-esign-submitted.workflow.json` (the n8n side). |
| W1.5 | Onboarding Form submitted → CRM update | Webhook (portal form) | Auto (internal) | **Partially built** — `portal/public/onboarding.html` exists, but its detail fields (hours, contact email) are structural placeholders that don't submit anywhere yet; the brief doesn't specify the Onboarding Form's real field schema. The page's Stripe payment step (W1.6) is fully functional. |
| W1.6 | Stripe payment → create Company/Contract/BillingPeriod → Locations Active → Opportunity Won | Webhook (Stripe) | Auto — the brief's own explicit resolution of the billing-stage tension (see below) | **Scaffolded, both sides** — `portal/netlify/functions/create-checkout-session.mts` (creates the real Checkout Session, tier prices from the brief) + `phase-1-mvp/stripe-payment-to-crm.workflow.json` (the webhook/CRM-advance side), both against placeholder Stripe credentials until real ones land. **v2 change:** pulled forward from Phase 5 into Phase 1. **Object model migration (this pass):** this is now where the Opportunity hands off to Company/Contract — creates the Company, creates a Contract mirroring the Opportunity's Locations, sets each Location's `contractStatus`, creates the first Billing/Accounting Period, and renames the Opportunity's terminal stage from an invented "Live Client" to the brief's own "Won." New-logo path only — Contract Amendment (existing Company) is explicitly not built this pass. |
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
| W2.1 | Unified calendar write-through + Missed Follow-up + no-show re-engagement | Any of: dialer, Demo Dashboard, Deals Desk scheduling an event | Auto (internal, reversible) | **Scaffolded** — `phase-2-calendar-nurture-alerts/unified-scheduling.workflow.json` + `missed-follow-up-check.workflow.json` + `no-show-reengagement.workflow.json` |
| W2.2 | Automated nurture cadence | Schedule (cold-opportunity check) | **Human gate** — drafts only, human approves/sends | **Scaffolded** — `phase-2-calendar-nurture-alerts/nurture-cadence.workflow.json` |
| W2.3 | Post-onboarding CX touch cadence | Schedule, keyed off Company status = LiveClient + tenure | Auto to draft/schedule the touch; send policy per W2.2's gate | **Scaffolded** — `phase-2-calendar-nurture-alerts/cx-cadence.workflow.json` |
| W2.4 | Alerts/notifications | Event-driven (high-value lead, no-show, overdue nurture touch, scraper batch ready) | Auto (internal alert, not external send) | **Scaffolded** — `phase-2-calendar-nurture-alerts/alert-dispatcher.workflow.json`. Routes to Google Chat + Command Center in-app (both real) + SMS on critical (still a placeholder — no provider in `02 - Launch Checklist`) — see that folder's README. |
| W2.5 | Communications Hub write-through | Every Call/SMS/Social/Other touchpoint | Auto (internal, reversible logging) | **Scaffolded, Calls only** — new `CommunicationsHubEntry` object + a write-through node in `phase-3-dialer-hopper/post-call-synthesis.workflow.json` |
| W2.6 | DNC enforcement | Permission check at the dialer action layer | **Hard gate** — not just a UI hide, a block requiring logged admin override for an exception call | **Scaffolded** (action-layer block only; the role-based UI hide is a Twenty CRM permissions config, not a workflow) — `phase-2-calendar-nurture-alerts/dnc-check.workflow.json` |
| W2.7 | Compliant hours + off-hours consent gate (new, not in the brief's own numbering) | Permission check at the dialer action layer, alongside W2.6 | **Hard gate** — blocks outside TCPA-floor calling hours unless a system-checked + human-verified ConsentRecord is on file | **Scaffolded** — `phase-2-calendar-nurture-alerts/compliant-hours-consent-gate.workflow.json` |

**W2.1 built this pass**, once the full `05 §3` spec was re-confirmed against source: conflict
detection (checks Google Calendar for overlapping events, returns suggested alternate slots rather
than blocking outright), System/Human-Scheduled tagging (Google Calendar's `extendedProperties.private`,
invisible in the UI, readable by anything that needs to know), and a new `ScheduledTouch` object
(`CRM-OBJECT-MODEL.md`) giving the calendar-agnostic "is this overdue and undispositioned" state
`missed-follow-up-check.workflow.json` (new, hourly) sweeps for — `05 §11`'s named `#missed-follow-ups`
alert trigger. `no-show-reengagement.workflow.json` (new) drafts (never sends — automation risk
boundary) a rebooking outreach message via a real Claude call once a Demo touch is marked `NoShow`.
None of the three are called from anywhere in this repo yet — they're real, callable logic waiting
on their callers (a Deals Desk-style UI to disposition touches, and every other workflow that should
be scheduling through this layer instead of nothing at all today).

**W2.2/W2.3 built this pass.** The message *content* still isn't brief-specified (only CX's timing
is — 7/30/60/90-day then quarterly, `05 §9`, encoded verbatim; nurture's timing is this pass's own
judgment call, flagged as such in the workflow's own notes, not presented as decided) — so both
workflows draft each touch via a real Claude call rather than sending a fixed template, and never
auto-send, per the automation risk boundary. Neither is wired to a real trigger source yet: W2.2
scopes to `postLossTrack: 'Nurture'` opportunities (the one already-decided state with real data to
key off — W4.6's loss-reason-capture sets it), W2.3 to `Company.status: 'LiveClient'`.

**W2.4 — scaffolded in an earlier pass, alert-surface priority fixed this pass (Step 3).** The
dispatch mechanism itself (receive an alert, route to Google Chat and/or SMS by severity) didn't need
the undecided thresholds resolved first — only *what triggers* an alert ("high-value lead," what
counts as "overdue") is still undecided, and any future workflow that decides those can just call
the dispatcher that already exists. Routes to Google Chat rather than Slack (swapped per Jonathan's
request — the brief's own "Slack/SMS" phrasing predates that). **This pass:** fixed the alert-surface
priority inversion `05 §11` calls out — Command Center is now the PRIMARY, actionable surface
(`linkUrl` carried through to a real "Open record →" deep link, plus a new Acknowledge action on
`/messaging`) and Google Chat/SMS are explicitly SECONDARY (both now carry a link back to Command
Center's `/messaging` page instead of being dead-end notifications with no path back to where a rep
actually acts). See `phase-2-calendar-nurture-alerts/README.md` and `command-center/README.md`'s
"Step 3" note: SMS still has no vendor anywhere in `02 - Launch Checklist`.

**W2.5 built this pass** — "Communications Hub — custom object covering Calls/SMS/Social/Other,
polymorphic to Person + Location + Company + Opportunity — every touchpoint in one place regardless
of channel" (`05 §13`). `CommunicationsHubEntry` (`CRM-OBJECT-MODEL.md`) is the object;
`post-call-synthesis.workflow.json` (W3.4) writes one entry per completed call. **Calls only** —
SMS/Social write-through isn't built because neither channel has a real sending/receiving
integration anywhere in this repo yet (no SMS provider; no social integration named in the source
docs at all) — there's nothing real to log from yet, not a schema gap.

**W2.6 (new, from §5/§13) — the action-layer-block half scaffolded this pass.** The DNC list's
source turned out to be identifiable after all: CRM Architecture §13's post-loss routing section
names `restrictionReason` (DNC/Not Interested/Bad Information) as a field on the Opportunity itself
— see `phase-2-calendar-nurture-alerts/dnc-check.workflow.json`. The role-based UI-hiding half is
still a Twenty CRM permissions config, not a workflow, so it's not represented here.

**W2.7 (new — not part of the brief's own W-numbering, added per Jonathan's explicit compliance
request).** Same hard-gate pattern as W2.6, meant to run alongside it: blocks an outbound call
outside TCPA's federal 8am-9pm (called party's local time) floor — narrowed per state where one sets
a tighter window, table currently seeded empty rather than guessed — unless a **ConsentRecord** (new
object, `CRM-OBJECT-MODEL.md`) proves the contact directly asked to be called off-hours, checked by
the system (a real evidence reference — recording ID, email, or SMS message ID) *and* confirmed by a
human. See `phase-2-calendar-nurture-alerts/README.md` for the known server-local-hour limitation
(no real timezone lookup yet).

Two of Phase 2's six brief-numbered automations (W2.4, W2.6) are scaffolded, plus this pass's new
W2.7 compliance gate — the rest remain cataloged here, blocked on undecided specifics rather than
difficulty, so none of the brief's own six are lost.

## Phase 3 — Dialer Hopper/Queue Logic (pre-Telnyx)

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W3.1 | Dialer hopper request (claim next entry) | Agent action (pull from pool) | Auto (internal) | **Scaffolded** — `phase-3-dialer-hopper/hopper-request-next.workflow.json` |
| W3.2 | Load Campaign hopper | Manual/scraper handoff (batch of Opportunities to dial) | Auto (internal) | **Scaffolded** — `phase-3-dialer-hopper/hopper-load-campaign.workflow.json` |
| W3.3 | Attempt/recycling matrix | Post-call, per attempt | Auto (internal scheduling logic) | **Scaffolded**, with the brief's actual numbers hard-coded (not placeholders) — `phase-3-dialer-hopper/attempt-recycling-matrix.workflow.json` |
| W3.4 | Post-call synthesis (strict 4-key JSON, now 5-key) | Call disposition event | Auto (internal — produces structured data, not an external send) | **Scaffolded**, using Claude Structured Outputs for the brief's 4-key contract plus a 5th compliance key added this pass — `phase-3-dialer-hopper/post-call-synthesis.workflow.json` |
| W3.5 | Pacing controller (new, not in the brief's own numbering) | Call outcome event, alongside W3.3/W3.4 | Auto (internal — no manual pacing control by anyone, per Jonathan's explicit choice) | **Scaffolded** — `phase-3-dialer-hopper/pacing-controller.workflow.json` |
| W3.6 | Call wrap-up / required disposition gate (new, not in the brief's own numbering) | Rep action, right after each call | **Hard gate** — dialer can't advance to the next call without it | **Scaffolded** — `phase-3-dialer-hopper/call-wrap-up.workflow.json` |

**Explicit correction already captured in the roadmap itself:** this phase is data/workflow layer
only — no live call placement happens here (that's Phase 5, gated on Telnyx).

**W3.1/W3.2 built this pass, once the hopper's actual model got locked in.** What had been blocking
them wasn't the scraper's output schema after all — it was a design question: is the hopper a shared
pool or per-rep isolated queues? Jonathan's answer (no multi-member campaign restriction; any
available rep pulls from any active Campaign's shared hopper; a Callback disposition personally
locks one record to one rep, every other non-connected disposition — Try-back — returns it to the
shared pool) is now `CRM-OBJECT-MODEL.md`'s Campaign/HopperEntry objects, and both workflows are
built against it: **W3.2** loads a batch of Opportunities into a Campaign as queueable HopperEntry
rows; **W3.1** is the claim action a rep's dialer UI calls to pull the next eligible entry (a due
personal Callback first, else the oldest-wave shared-pool candidate), with an explicitly flagged
read-then-write race-condition risk (two reps could select the same entry before either claim lands)
mitigated but not eliminated by a re-read-and-verify step. See `phase-3-dialer-hopper/README.md`.

**W3.3/W3.4 (from 05 §4 — Dialer & Outreach) — scaffolded three passes ago, extended since.**
Post-call synthesis's exact output contract is given by the brief (a strict 4-key JSON: Disposition,
Summary, Try-Back Time, DM Presence, enforced via Claude's Structured Outputs). **Two passes ago:**
W3.3 gained a real PATCH persisting the resulting HopperEntry state, plus explicit `Callback` →
`CALLBACK_SCHEDULED`/rep-locked handling; W3.4's Disposition enum swapped `Connected-CallbackRequested`
for a plain top-level `Callback` value to match. **Last pass:** W3.4 gained a 5th structured-output
key, `Rebuttal After Decline` — the global no-rebuttal compliance policy's QA signal. **This pass,
two real changes:** (1) W3.3's attempt matrix was rewritten wholesale — the brief's original 6/4/8-
attempts-by-disposition-type, 4-wave, 90-120-day model is replaced by Jonathan's explicit two-wave
cadence (wave 1: 7 attempts / 14 days back-to-back; wave 2, after a 14-day gap: 4 attempts / 3 days
back-to-back; exhausting wave 2 parks the entry in a new `FutureRework` status rather than closing it
out) plus a 2-attempts/day cap enforced at claim time (W3.1) for every non-Preview dialer mode; (2)
the rep's own manually-entered Disposition (`call-wrap-up.workflow.json`, W3.6, new) is now
authoritative — W3.4's AI-inferred Disposition write was renamed `lastCallDispositionAiSuggested` so
it can no longer silently clobber the rep's entry, kept only as a QA cross-reference. All of W3.1/
W3.3/W3.4/W3.6 are wired to the real hopper rather than waiting on it.

**W3.5 (new, not in the brief's own numbering) — added this pass as the compliance layer's pacing
half.** Per Jonathan's explicit choice, dialer pacing (simultaneous calls per agent, dial speed) is
fully automatic — no manual control by agent or Command Center during a live campaign. This workflow
watches a rolling abandonment rate per Campaign (the FTC TSR's 3% ceiling seeded as the default
target, flagged for counsel confirmation) and ratchets `currentAllowedSimultaneousCallsPerAgent`
against it, capped at an admin-set `maxSimultaneousCallsPerAgentCeiling` — the only human lever, set
once per Campaign, not adjusted call-by-call. See `phase-3-dialer-hopper/README.md`.

**W3.6 (new, not in the brief's own numbering) — added this pass as the "required disposition to
advance" gate.** Per Jonathan's explicit instruction, a rep must submit a Call Note and a Disposition
(Callback/Try-back date-time optional) before the dialer moves to the next call, in Preview and every
auto-dialer mode alike. Built as a real gate, not a UI convention: `hopper-request-next.workflow.json`
(W3.1) now refuses to hand out a new HopperEntry to a rep who still holds one un-dispositioned, and
this workflow is the only path that clears that hold — it validates the submission, feeds the rep's
own disposition into W3.3 as the authoritative input, logs the Call Note to the Activity Event
timeline, and fires W3.4 fire-and-forget for AI QA only when a transcript is actually available. See
`phase-3-dialer-hopper/README.md`.

## Phase 4 — Intelligence Layer

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W4.1 | Client health/usage scoring | Schedule or usage-event | Auto (internal scoring) | **Scaffolded** — `phase-4-intelligence-layer/health-scoring.workflow.json` |
| W4.2 | Tier upgrade/upsell signal | Off W4.1's output | Auto to flag/draft; human closes the upsell | **Scaffolded** — `phase-4-intelligence-layer/tier-upgrade-signal.workflow.json` |
| W4.3 | Referral trigger | Off tenure + engagement signal | Auto to flag; **human gate** on the actual outreach (external send) | **Scaffolded**, with named-placeholder thresholds (real numbers undecided) — `phase-4-intelligence-layer/referral-trigger.workflow.json`. **Object model migration:** moved from querying Opportunities (`stage=LiveClient`, a state Opportunities no longer reach) to querying Companies (`status=LiveClient`) — this was a real bug, not a style fix; see the CRM Architecture section below. |
| W4.4 | AI employee (extends AI Activity Summary) | Various | **Human gate** per the brief's AI-employee scope: auto-execute reversible/internal, human gate on external-send/billing/irreversible | **Partially scaffolded** — the human-gate mechanism is Tag-for-Action's (Command Center Step 5), the digest is `phase-4-intelligence-layer/ai-activity-summary.workflow.json` |
| W4.5 | Front Door Audit refresh | Schedule, Stage = Live Client | Auto (internal — produces a retention/upsell proof point, not itself an external send) | Documented only |
| W4.6 | Loss-reason capture | Opportunity marked Lost | Auto (internal capture) | **Scaffolded** — `phase-4-intelligence-layer/loss-reason-capture.workflow.json` |
| W4.7 | Opening-line conversion tracking | Deal outcome, keyed to Deep Dive's recommended opening | Auto (internal analytics) | Documented only |

**W4.1/W4.2 built this pass** — see `phase-4-intelligence-layer/README.md` for the full detail: a
health/usage-scoring formula (a judgment call, not brief-specified — `05 §9` names the heading with
no formula) built honestly from signals this repo's object model actually has, since no telemetry
pipeline exists anywhere here from a deployed client instance back into the CRM. Iridium tier
protection is a hard filter in `tier-upgrade-signal.workflow.json`'s own code, not left as a
convention for a future workflow to remember. **W4.3's `engagementScore` dependency is resolved** —
it now reads real data W4.1 writes daily, not nothing.

**W4.4 partially built this pass** — see `phase-4-intelligence-layer/README.md`: the human-gate half
was already Tag-for-Action's (Command Center Step 5), "chat-invoked... not a new permission" being
exactly why; the daily AI Activity Summary digest is new. Model routing (Claude/Gemini/Grok) is
documented as policy, not built as a router — no second real caller exists yet to route between.

W4.5/W4.7 are each blocked on something
upstream that doesn't exist yet, not on an undecided design: W4.5 needs the Front Door Audit service
itself first (not built — see Phase 1); W4.7 needs Deep Dive Research's opening-line recommendation
to actually be a trackable, ID'd field on the Opportunity, which depends on Deep Dive Research's own
contract (also not built — see Phase 1).

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

## CRM Architecture (05 §13, FINAL v4 / LOCKED) — cross-cutting, not phase-specific

**Superseded by `CRM-OBJECT-MODEL.md` at the repo root, which is now the canonical reference** — the
paragraph below is kept only as a historical note of what changed and why. Brief v3's object model
(a single Opportunity object, no Location) turned out to be provisional, not final: `06 - Recent
Changes Summary` (v4) locked in a real five-level hierarchy — **Lead → Opportunity (spans multiple
Locations) → Location (GBP-driven site; demos/audits attach here) → Company (Contracts attach here)
→ Organization (optional)** — plus two new objects, **Contract** and **Billing/Accounting Period**
(new `05 §15`, Financial Tracking).

This was a real correctness bug, not just a missing feature: this library's earlier "Demo Dashboard
= a single Opportunity stage view" design, and W4.3's original query for `stage=LiveClient`
Opportunities, both assumed Opportunity was the only addressable object. `LiveClient` is a post-sale
state that Opportunities never actually reach once Company/Contract exist (Opportunities now
terminate at `Won`) — so that query would have silently returned nothing forever. **Migrated this
pass** (object model first, per Jonathan's explicit sequencing): `CRM-OBJECT-MODEL.md` defines the
full hierarchy and states which object every workflow's writes anchor to and why; W1.1, W1.2, and
W1.6 were restructured to write to Location/Company/Contract/BillingPeriod where the data is
actually site- or client-level, not just Opportunity; W4.3 moved its whole query from Opportunities
to Companies; W1.4/W2.6/W3.4/W4.6 were reviewed and confirmed correctly Opportunity-anchored as-is
(pre-sale deal-level events, not touched). `command-center/src/messaging/`'s `comment_threads` table
was migrated to a polymorphic `(subjectType, subjectId)` pair, matching Communications Hub's
explicit polymorphism across Person/Location/Company/Opportunity.

Still true and unaffected by the v4 object-model change:
- **Opportunity Card UX principle** — "a status badge + button opening the actual tool in a new tab
  ... no embedded tools or inline live data inside the CRM itself; it references, it doesn't host."
  Binding on every workflow that writes to Twenty CRM, regardless of which object it targets.
- **Activity Event** — an append-only timeline; what the AI Activity Summary automation (W4.4) and
  DNC overrides (W2.6) write into.
- **DNC enforcement** (W2.6) and **post-loss routing** (W4.6) — confirmed still Opportunity-level;
  see each workflow's own notes for why.
- **Communications Hub** (W2.5) — built, Calls only (see above); polymorphic across `person`/
  `opportunity`/`location`/`company`, the exact four `05 §13` names (a distinct enum from
  `comment_threads`'s own `SubjectType`, which also includes `lead`/`organization`).
  **Documents/Files** (W1.7) — still not built.

**Not built this pass, explicitly out of scope per the agreed sequencing:** the Contract Amendment
Flow (superseding an existing Company's Contract, Accounting Audit Event, Deal stage → "Expansion")
and the Location Contract Lock *enforcement* workflow (blocking a new Opportunity on an already-
active Location) — `CRM-OBJECT-MODEL.md` defines the fields both would need (`contractStatus` on
Location, `supersededByContractId` on Contract), and W1.6 sets them correctly, but neither workflow
itself is scaffolded yet. Also not built: the recurring monthly Billing/Accounting Period generation
(W1.6 creates only the first one) and COGS/commission calculation.

## Internal Team Messaging (05 §14) — Command Center Piece 2, built

New in brief v2, explicitly scoped as part of Command Center **Piece 2** (channel-based chat,
@mentions, in-app delivery of the same alerts as W2.4, comment threads attached to CRM records) —
"not a Slack replacement... separate, for team-to-team communication that lives inside the same tool
as everything else" (the brief's own words, written before the switch to Google Chat below). The
external channel W2.4 dispatches system alerts to — Google Chat, per Jonathan's request — keeps
receiving them regardless; this is a distinct, in-app surface on top, and W2.4 now delivers to both
(see `alert-dispatcher.workflow.json`'s "Send to Command Center (in-app)" node).

**Built ahead of the brief's own "not urgent" sequencing** — `command-center/src/messaging/`
(channels/messages/@mentions, comment threads keyed by `(subjectType, subjectId)`, alert ingest +
delivery), backed by a real, already-provisioned Cloudflare D1 database (not a placeholder — same
"actually create it with the live tools available" treatment the `STATUS` KV namespace got in
Piece 1). Real-time delivery is 5-second polling, not a WebSocket/Durable Object — simple, testable,
and enough for a "not urgent" internal tool; noted as a natural v2 upgrade, not built now. **Steps
3-5 (alert-surface priority, the real 11-channel taxonomy, Tag-for-Action) are now all done** — see
`command-center/README.md`'s "Piece 2 — Internal Team Messaging" section for the full detail and
`command-center/DEPLOY.md` step 11 for how to verify each. Tag-for-Action's n8n side is
`phase-2-calendar-nurture-alerts/tag-for-action.workflow.json` (new, not brief-W-numbered).

Pipeline visibility/reporting (the rest of Piece 2, absorbing W6.1) remains not started — no
brief-v2 urgency behind it the way messaging had.

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

**Two more such gaps, found while building Phase 2's alert dispatcher:** `GOOGLE_CHAT_WEBHOOK_URL`
and `SMS_PROVIDER_URL` are referenced by
`phase-2-calendar-nurture-alerts/alert-dispatcher.workflow.json`, and neither is a Secrets Store
entry in `command-center/src/vendors.ts` (a Google Chat webhook URL isn't really a vendor
*credential* the way an API key is — same treatment as `N8N_INSTANCE_URL`). SMS remains the bigger
open item: no provider appears anywhere in `02 - Launch Checklist` at all, not even as a deferred
item. Worth resolving before that workflow matters for real; see that folder's README.

## How this library relates to the rest of the repo

- **`CRM-OBJECT-MODEL.md`** (repo root) — the canonical object-hierarchy reference every other file
  below points back to instead of re-deriving it. Start here for "what object does X anchor to."
- `command-center/` — Piece 1, gathers these credentials in the first place; also now Piece 2's
  Internal Team Messaging (`src/messaging/`). Updated for v2: Stripe added to the vendor checklist,
  Documenso removed. Updated for v4: `comment_threads` migrated to polymorphic subjects.
- `src/server/` — Piece 3, the demo generator W1.2 calls into directly. Unaffected by v2 or v4 —
  none of the changes touch the KB demo generator's own scope.
- `portal/` — the client-facing portal (W1.3-W1.6's real UI + backend). Its two fully functional
  Netlify Functions (`get-opportunity`, `create-checkout-session`) and the e-sign capture flow
  (`proposal.html` + `submit-esign`) are the other end of the W1.4/W1.6 workflows here — see
  `portal/README.md`. Updated for v4: `get-opportunity` now returns an array of Locations (each
  with its own Front Door Audit result) instead of flat fields on the Opportunity.
- `phase-2-calendar-nurture-alerts/`, `phase-3-dialer-hopper/`, `phase-4-intelligence-layer/` — six
  more automations scaffolded this pass (W2.4, W2.6, W3.3, W3.4, W4.3, W4.6), picked because their
  *mechanics* weren't blocked on an undecided business rule even where their inputs — SLA thresholds
  for W4.3, live call-event data for W3.3/W3.4 — still are. Where a number genuinely wasn't decided
  (W4.3's referral thresholds), it's a named placeholder rather than an invented default, same
  pattern as every credential in this repo.
- Everything else here (Deep Dive Research, Front Door Audit, the Demo Dashboard/CRM write targets,
  nurture/CX content, health scoring, Telnyx activation, the dialer hopper itself) is **new scope
  this library surfaces but doesn't build** — cataloged so nothing named in the roadmap gets
  silently lost, with each "Documented only" / "Not started" entry stating exactly what's blocking
  it from being scaffolded for real.
