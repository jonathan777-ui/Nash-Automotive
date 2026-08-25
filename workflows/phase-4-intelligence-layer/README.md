# Phase 4 — Intelligence Layer (partial)

Four of Phase 4's seven catalog entries scaffolded so far — W4.1/W4.2 added this pass.

## W4.1 — `health-scoring.workflow.json` + W4.2 — `tier-upgrade-signal.workflow.json`

`05 §9` names "health/usage scoring" as a heading with no formula given — the reason these stayed
"documented only" since the earliest pass of this library. Built now per `06`'s "left to Claude
Code's judgment" framing: **the scoring formula is this pass's own design, flagged as a judgment
call throughout**, built from signals this repo's object model actually has (tenure, active Location
count, contract tier) rather than a fabricated "usage" number — no telemetry pipeline exists
anywhere in this repo from a deployed client's AI receptionist/chatbot back into the CRM, so faking
that signal would be worse than the honest gap of not having it. `engagementScore`/`currentTier`
write onto Company daily; `tier-upgrade-signal.workflow.json` reads them 30 minutes later and
auto-flags (never contacts the client — per the automation risk boundary, a rep closes the upsell)
any Company scoring ≥75 that isn't already Iridium. **Iridium tier protection is built by
construction here**, not left to convention — `05 §9`'s "untouched by automated pipeline changes"
rule is a hard filter in the code, not a comment reminding a future maintainer to add one.

**Unblocks W4.3 for real:** `referral-trigger.workflow.json` has read `engagementScore` since an
earlier pass but had nothing real to filter on until now — this is what makes that query return
actual rows instead of silently matching nothing.

## W4.6 — `loss-reason-capture.workflow.json`

Fully specified by CRM Architecture §13's post-loss routing section (exact field values:
`restrictionReason` ∈ {DNC, Not Interested, Bad Information}, `postLossTrack` ∈ {Nurture,
Restricted}) — validates the incoming value against those exact sets before writing, since a typo'd
reason here would silently break `dnc-check.workflow.json`, which reads the same field.

**Assumption flagged:** triggered by an explicit call (a rep or a future rule marking an Opportunity
Lost), not by watching Twenty CRM for a generic "record updated, stage=Lost" event — the latter would
need Twenty CRM's own webhook/trigger configuration confirmed against a real instance, which isn't
available from this sandbox.

## W4.3 — `referral-trigger.workflow.json`

**Object model migration (this pass) — this one was a real bug, not a style fix.** Previously queried
Opportunities filtered to `stage=LiveClient` — but `LiveClient` is a post-sale state that
Opportunities no longer reach at all once the object model migration landed (W1.6 now advances
Opportunities to `Won`, and `LiveClient` moved to the Company as a `status` field instead). That
query would have silently returned zero results forever. Fixed to query Companies
(`status=LiveClient`) instead — see `CRM-OBJECT-MODEL.md`'s load-bearing pre-sale/post-sale
distinction for why every post-sale automation (this one, plus W4.1/W4.2/W4.5 once built) belongs on
Company, not Opportunity.

Structurally complete otherwise, but built against **two named-placeholder thresholds**
(`PLACEHOLDER_REFERRAL_TENURE_DAYS`, `PLACEHOLDER_REFERRAL_ENGAGEMENT_THRESHOLD`) rather than real
numbers — the brief says "tenure + engagement signal" but never gives the actual cutoffs, same
treatment as every other undecided-but-not-blocking value throughout this repo (Telnyx/Stripe
credentials, the alert channel routing rule). Set real values once decided; nothing else about this
workflow changes.

**Depends on `engagementScore` existing on the Company**, which is W4.1's job (health/usage scoring —
not built, blocked on the scoring formula itself being undecided; also needs migrating to Company
once built, same reasoning as this workflow). Until W4.1 exists, this workflow has nothing real to
filter on even with the thresholds set — flagged in the node's own `notes`, not just here.

Only auto-flags eligibility and alerts a rep (via the real `alert-dispatcher` webhook, W2.4) — per
the automation risk boundary, actually asking a client for a referral is an external send and stays
human-gated, so this workflow deliberately stops short of drafting or sending anything.

## W4.4 (partial) — `ai-activity-summary.workflow.json`

`05 §10`: "AI Activity Summary, AI employee expansion (auto-execute reversible/internal, human-gate
external-send/billing/irreversible)... Chat-invoked requests (Section 14) are a new trigger type,
not a new permission." **The human-gate half was already built as part of Command Center Step 5** —
`tag-for-action.workflow.json`'s Reversible?/gated split and the `ai_action_requests` approval queue
*are* that gate, generically, not something W4.4 needs its own copy of; "chat-invoked... not a new
permission" is exactly why one mechanism serves both. What was missing: the digest itself. Built this
pass — a daily sweep of the last 24h's AI-related Activity Events (`TagForAction`,
`AiActivityResponse`), summarized via Claude, posted to `#ai-agents`.

**Model routing (Claude/Gemini/Grok), documented as policy, not built as a router:** every real LLM
call in this repo — including this one — uses Claude. `GEMINI_API_KEY`/`GROK_API_KEY` already exist
in Command Center's vendor checklist (`src/vendors.ts`), ready to wire up, but no workflow anywhere
has a genuine reason yet to route to a different model — building an actual routing layer with
nothing real to route between would be speculative infrastructure, untestable against anything. The
policy this pass settles on instead: **Claude stays the default for anything involving CRM data,
compliance-sensitive judgment, or customer-facing content** (matches every real call already in this
repo — post-call synthesis, Tag-for-Action, this digest); **Gemini/Grok are reserved for a
genuinely cost- or latency-sensitive bulk task if one ever appears** (e.g. very-high-volume
classification a slower/pricier model isn't worth using) — not a task type this repo has yet. Revisit
once a second real caller exists to make routing between models a decision with something to test.

## W4.5 — `front-door-audit-refresh.workflow.json` + W4.7 — `opening-line-tracking.workflow.json`

Both real logic waiting on an upstream service, not undecided design:

- **W4.5** re-runs the same named-placeholder Front Door Audit call W1.1 already makes, monthly
  (this pass's own judgment call — no refresh cadence is brief-given), for every Location on every
  `LiveClient` Company's active Contract. Fetches the Location's current score first so it can
  detect a **meaningful change** (≥10 points either direction, also a judgment call) and alert —
  a regression is a retention risk, an improvement is a genuine upsell/testimonial proof point, per
  `05 §9`'s own "produces a retention/upsell proof point" framing. Blocked on the same thing W1.1's
  own call is: the 10 weighted categories still aren't specified anywhere.
- **W4.7** is a rollup object, `OpeningLineStats` (`CRM-OBJECT-MODEL.md`), incremented on every real
  deal outcome — wired into `stripe-payment-to-crm.workflow.json`'s Won path and
  `loss-reason-capture.workflow.json`'s Lost path this pass, both fire-and-forget. Every call is a
  safe no-op today (an `openingLineId` gate short-circuits cleanly) since nothing writes
  `Opportunity.openingLineId` yet — Deep Dive Research, the service that would recommend an opening
  line, isn't built. Tracking activates automatically the moment that dependency lands; no further
  wiring needed.

## Still documented-only

Nothing left in Phase 4's own catalog except W4.4's un-built halves (see above) — every other entry
is at least scaffolded. See `workflows/README.md` for the full Phase 4 catalog.
