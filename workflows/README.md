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

## Phase 1 — MVP: Lead → Onboarding (no Telnyx, no Stripe)

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W1.1 | Lead intake → Deep Dive Research → Demo Dashboard write | Webhook (lead form / scraper handoff) | Auto (enrichment, internal) | **Scaffolded**, with a named placeholder for the not-yet-built Deep Dive Research service — `phase-1-mvp/lead-intake-to-demo-dashboard.workflow.json` |
| W1.2 | Demo generation trigger | Webhook (Demo Dashboard "generate" action) | Auto (internal) | **Partially built** — real logic is `src/server/`'s `POST /generate-demo` (checkpoint 5, code-complete); this workflow is the thin n8n wrapper around it. **Scaffolded** — `phase-1-mvp/demo-generation-trigger.workflow.json` |
| W1.3 | Proposal delivery | Manual (rep sends) or CRM stage change | Auto to generate, human decides when to send | **Documented only** — the brief doesn't specify a "Proposal" document format/template yet; building the send step without one would mean inventing the proposal's actual content. |
| W1.4 | E-sign completed → CRM advance → Onboarding Form | Webhook (Documenso) | Auto (internal stage advance + form email) | **Scaffolded** — `phase-1-mvp/esign-to-onboarding.workflow.json` |
| W1.5 | Onboarding Form submitted → CRM update | Webhook (portal form) | Auto up to Onboarding stage; **stays manual past this** per the brief ("CRM stage advance past onboarding stays manual until Stripe lands") | **Documented only** — the Onboarding Form's field schema isn't specified yet; the portal itself (Netlify-hosted) isn't built in this repo. |

**W1.1 — Lead intake → Deep Dive Research → Demo Dashboard write.** A lead (from the website, a
scrape, or a manual add) hits a webhook → calls a Deep Dive Research service to synthesize
enrichment (Claude, per the brief's model-routing table — PII-adjacent synthesis is explicitly a
Claude job, not Gemini/Grok) → writes the result onto the Opportunity in Twenty CRM and sets its
pipeline stage to **Demo Queue**.

**Assumption flagged, not silently made:** the brief describes "Demo Dashboard stages: Demo Queue →
Pending Demos → No Show → Rescheduled → Demo Completed → Future Follow-up" as if it might be a
separate surface from Twenty CRM, but nothing in the brief specifies a distinct Demo Dashboard
database/schema. This workflow assumes those six stages are values of the Opportunity's pipeline
**stage** field inside Twenty CRM itself — i.e., "Demo Dashboard" is a *view* over Twenty CRM
Opportunities filtered/grouped by stage, not a separate system with its own storage. Worth
confirming; if wrong, every workflow here that "writes to the Demo Dashboard" needs its target
changed from a Twenty CRM stage update to whatever the real Demo Dashboard's write API turns out to
be.

**Deep Dive Research doesn't exist as a service yet** — no design doc specifies exactly what it
enriches beyond "auto-enrichment" and "Claude: ... Deep Dive Research synthesis." The workflow calls
a named placeholder endpoint (`PLACEHOLDER_DEEP_DIVE_RESEARCH_URL`) rather than inventing that
service's contract — same pattern the brief itself uses for Telnyx/Stripe. Building the real service
(most likely another standalone Node/TS app in this repo, per the same "dedicated service, not n8n
Code nodes" architecture principle already applied to the demo generator) is real, well-scoped
follow-up work once its inputs/outputs are decided.

**W1.2 — Demo generation trigger.** Demo Dashboard/CRM fires a webhook when a rep (or an automated
rule) marks a lead ready for a demo → `POST` to this repo's own `src/server/` `/generate-demo`
endpoint with the vertical/niche/cascade-input the lead record already has → on success, writes the
returned `UnifiedKb`'s summary fields back onto the Opportunity and advances its stage to
**Pending Demos**; on failure, an alert (W2.4) rather than a silent drop.

**W1.4 — E-sign completed → CRM advance → Onboarding Form.** Documenso's own signing-completed
webhook → advance the Opportunity's stage (**Contract Signed** → **Onboarding**) in Twenty CRM →
send the Onboarding Form link via Plunk. Fully mechanical and fully specified by the brief (Phase 1
explicitly names this exact chain in the roadmap and Launch Checklist), so this one was safe to
scaffold in full rather than flag as an assumption.

---

## Phase 2 — Calendar + Nurture/CX Cadence + Alerts

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W2.1 | Unified calendar write-through | Any of: dialer, Demo Dashboard, Deals Desk scheduling an event | Auto (internal, reversible) | Documented only |
| W2.2 | Automated nurture cadence | Schedule (cold-opportunity check) | **Human gate** — drafts only, human approves/sends | Documented only |
| W2.3 | Post-onboarding CX touch cadence | Schedule, keyed off Stage = Live Client + tenure | Auto to draft/schedule the touch; send policy per W2.2's gate | Documented only |
| W2.4 | Alerts/notifications | Event-driven (high-value lead, no-show, overdue nurture touch, scraper batch ready) | Auto (internal alert, not external send) | Documented only |

Not scaffolded yet: W2.1 needs the calendar's actual event schema and the System-Scheduled vs.
Human-Scheduled tagging convention decided against a real Google Calendar setup; W2.2/W2.3 need the
nurture/CX message *content* decided (the brief resolves the CX cadence's timing — 7/30/60/90-day
then quarterly — but not what each touch says); W2.4's specific alert thresholds ("high-value
lead," what counts as "overdue") aren't defined yet either. All four are real, buildable automations
once those specifics exist — cataloged here so they aren't lost, not because they're hard.

## Phase 3 — Dialer Hopper/Queue Logic (pre-Telnyx)

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W3.1 | Dialer hopper request | Agent action (pull from pool / request scrape) | Auto (internal) | Documented only |
| W3.2 | Per-user isolated queue assignment | Same as W3.1 | Auto (internal) | Documented only |

**Explicit correction already captured in the roadmap itself:** this phase is data/workflow layer
only — no live call placement happens here (that's Phase 5, gated on Telnyx). Not scaffolded because
the hopper's actual data model (what a "record" looks like, how a batch is defined) isn't specified
independent of the scraper's own output schema (`04 - Scraper Deployment Scaffold`, a separate
in-progress piece).

## Phase 4 — Intelligence Layer

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W4.1 | Client health/usage scoring | Schedule or usage-event | Auto (internal scoring) | Documented only |
| W4.2 | Tier upgrade/upsell signal | Off W4.1's output | Auto to flag/draft; human closes the upsell | Documented only |
| W4.3 | Referral trigger | Off tenure + engagement signal | Auto to flag; **human gate** on the actual outreach (external send) | Documented only |
| W4.4 | AI employee (extends AI Activity Summary) | Various | **Human gate** per the brief's AI-employee scope: auto-execute reversible/internal, human gate on external-send/billing/irreversible | Documented only |

Not scaffolded: W4.1's scoring formula (which usage signals, what weighting) isn't decided —
building it now would mean inventing the formula, not encoding a specified one. W4.4 references "the
existing AI Activity Summary automation," which isn't present in this Drive folder or this repo —
worth locating before extending it.

## Phase 5 — Telnyx + Stripe Activation

| ID | Name | Trigger | Gate | Status |
|---|---|---|---|---|
| W5.1 | Telnyx SIP trunk / number provisioning | Manual (account setup) | N/A (infra, not a runtime automation) | Not started |
| W5.2 | Dialer live call placement (Preview/Power/3-Line) + AMD + local presence | Agent action | **Human gate** — a live outbound call is an external send | Not started |
| W5.3 | Stripe payment link + webhook → CRM auto-advance | Webhook (Stripe) | Auto (billing-adjacent, but this is the one explicit case the brief describes as an automated CRM advance — worth double-checking against the "human gate on anything touching billing/contract stage" rule before building; the two statements read as in tension) | Not started |
| W5.4 | Demo extension auto-assignment (1000+) | Threshold/volume trigger | Auto (internal) | Not started |

Deliberately not started — the brief itself scopes Telnyx/Stripe to Phase 5, explicitly deferred,
same placeholder-strategy rule applied to `src/server/` (`PLACEHOLDER_TELNYX_SIP_TRUNK` etc. where
that infra would eventually plug in).

**Flagged tension worth resolving before W5.3 is built:** the brief's automation risk boundary says
"keep a human gate on: anything touching billing/contract stage" — but the roadmap describes Stripe's
webhook as auto-advancing the CRM through Contract Signed → Onboarding → Live Client, which *is* the
contract stage. These two brief statements aren't obviously reconcilable as written; worth a direct
answer from Jonathan when Phase 5 actually starts, rather than guessing which one wins.

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

## Credential naming — kept consistent with the Command Center

Every workflow that needs a vendor credential references it by the same name the Command Center
wizard writes to Cloudflare Secrets Store (`command-center/src/vendors.ts`), so wiring a real n8n
instance up later is a rename-free copy: `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `GROK_API_KEY`,
`TWENTY_CRM_API_KEY`, `PLUNK_API_KEY`, `DOCUMENSO_API_KEY`, `N8N_INSTANCE_URL`, `N8N_API_KEY`. Where
a workflow needs a credential with no Secrets Store entry yet (e.g. the Places API key — see
`src/server/README.md`), that's flagged the same way there.

## How this library relates to the rest of the repo

- `command-center/` — Piece 1, gathers these credentials in the first place.
- `src/server/` — Piece 3, the demo generator W1.2 calls into directly.
- Everything else here (Deep Dive Research, the Demo Dashboard/CRM write targets, nurture/CX
  content, health scoring, Telnyx/Stripe activation) is **new scope this library surfaces but
  doesn't build** — cataloged so nothing named in the roadmap gets silently lost, with each
  "Documented only" / "Not started" entry stating exactly what's blocking it from being scaffolded
  for real.
