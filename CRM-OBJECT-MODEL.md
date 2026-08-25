# CRM object model (v4) — canonical reference

Every piece in this repo that reads or writes Twenty CRM objects points back to this file instead
of re-deriving the hierarchy independently. Source: `05 - Exhaustive Workflow & Automation Library`
§13/§15 and `06 - Recent Changes Summary`, both FINAL v4, both LOCKED per Jonathan.

**Twenty CRM doesn't exist as a live instance in this environment.** Every field name and REST
endpoint pattern below is this repo's own consistent, documented assumption — not a verified match
against a real instance, same caveat every Twenty CRM touchpoint in this repo has carried since
checkpoint 4 of the KB generator. Confirm against reality once an instance exists; until then, every
workflow/function referencing these objects is built to fail clearly rather than silently on a
mismatch.

## Product framing (locked, governs every design choice below)

This is being built for a **human sales team, supported by an AI employee, workflows, and
automation** — a sales-first relational CRM, not an AI-first or automation-first product. Twenty CRM
and the human reps working inside it are the system; enrichment services (Deep Dive Research, Front
Door Audit, post-call synthesis) hand reps better information and take reversible/internal busywork
off their plate, but never replace the human on sales (closing) or support (ticket resolution) —
this was already the automation risk boundary's standing rule, just made explicit as the product's
overall identity, not only a per-action gate.

**Surface naming (locked):** "Command Center" stays the admin/ops name (credentials, system health,
cross-team messaging — infra-flavored, matches what's actually built there). The rep's own daily
driver is **Deals Desk** (their pipeline, dialer queue, tasks, tagged items) — reusing the brief's
own term (`05 §3`: "dialer + Demo Dashboard + Deals Desk all write through n8n") rather than calling
every role's screen "Command Center." Not built yet; this governs naming once it is.

**Email:** not setting up email *marketing* (bulk/campaign sending) initially. Individual,
per-conversation emailing from inside the CRM — a rep sending/receiving on a Lead/Company record,
logged automatically — **is** in scope, and is Twenty CRM's own native per-user email account
connect feature, not something this repo needs to build. Mostly a configuration step once a real
instance exists (OAuth/IMAP connect per rep) — worth a Launch Checklist line, not new code.

## Compliance layer (locked this pass)

Enhanced compliance logic sits in front of two things: the dialer's pacing (how many
simultaneous calls per agent, how fast the system dials) and the calling action itself (is this
the right window, is this contact's consent status honored). Both are built as real gates this
pass, not left as a policy note — same discipline the DNC gate (W2.6) already set.

**Pacing (locked): fully automatic, no manual control by anyone.** The system watches a rolling
abandonment rate per Campaign and ratchets `currentAllowedSimultaneousCallsPerAgent` up/down
against a `targetAbandonmentRateBp` (default seeded at 300bp / 3%, the FTC TSR's own
abandonment-rate ceiling — **flagged for compliance-owner/counsel confirmation before launch**,
same treatment as every other legally-consequential default in this repo) and a
`maxSimultaneousCallsPerAgentCeiling` hard safety cap an admin sets once per Campaign. Neither
the rep nor Command Center manually nudges pacing during a live campaign — the only human lever
is that ceiling, set before the campaign runs, not adjusted call-by-call. See Campaign's
extended fields below and `phase-3-dialer-hopper/pacing-controller.workflow.json` (new this
pass, not part of the brief's original W-numbering — nothing in `05`/`06` names this).

**Two-party consent states (locked): a seeded reference list, not invented per-call.** Before
any call recording happens (Phase 5, not built), the live-dial layer must check the Location's
state against the commonly-cited all-party-consent state set (CA, CT, DE, FL, IL, MD, MA, MI,
MT, NV, NH, PA, WA — **flagged for counsel confirmation before launch**, same as the
abandonment-rate default, since state consent law changes and this isn't a verified-against-
current-statute source). In a two-party-consent state, recording requires either an explicit
verbal consent announcement at call start or written consent on file — this repo doesn't yet
build the dialer's live-call layer, so this is captured as the *policy* the eventual Phase 5
build must enforce, plus the `state` field Location needed to check it against (added below,
didn't exist before this pass).

**No-rebuttal (locked): a global policy, not state-keyed.** Rather than encode a state-by-state
"no further pitch after a decline" statute list (no confident source for that as a distinct
codified legal category — flagged, not guessed at), this is enforced as a standing script rule
for every call regardless of state: once a lead clearly declines, the call ends, no further
persuasion attempt. W3.4's post-call synthesis now flags a `Rebuttal After Decline` boolean
from the transcript so a violation is visible for QA/compliance review instead of silently
unlogged — see W3.4 below.

**Compliant calling hours (locked): TCPA's federal floor (8am-9pm in the called party's own
local time), narrowed per state where a state sets a tighter window.** Outbound calls outside
that window are blocked outright *unless* the contact directly requested being called outside
those hours — and that request itself must be evidenced, not just claimed. See ConsentRecord
below and `phase-2-calendar-nurture-alerts/compliant-hours-consent-gate.workflow.json` (new
this pass, not part of the brief's original W-numbering).

**Off-hours exception: a dual gate, system + human, not either alone.** The gate first checks
that a ConsentRecord exists with a real `evidenceRef` (a call-recording ID, an email message
ID, or an SMS message ID — never bare text claiming consent), *then* requires a human
(`verifiedByRepId`/`verifiedAt`) to have actually reviewed and confirmed that evidence supports
the exception before the gate opens. Both checks fail closed: missing evidence blocks, and
evidence that exists but hasn't been human-verified also blocks.

**Daily attempt cap + two-wave cadence (locked this pass, supersedes the earlier 05 §4 numbers):**
per Jonathan's explicit compliance-cadence instruction, non-Preview (auto-dialer: Power/multi-line)
modes cap a lead at 2 attempts per calendar day — Preview is exempt since a human reviews and
approves each individual dial, confirmed explicitly. Beyond the daily cap, the wave structure
itself changed: **Wave 1** ("new lead") runs daily for up to 14 days back-to-back from its first
attempt, capped at 7 total attempts, whichever limit hits first. **Wave 2** ("2nd rotation") starts
after a 14-day gap (landing around week 4 from the lead's first attempt), runs for up to 3 days
back-to-back, capped at 4 total attempts. Exhausting wave 2 moves the entry to a new terminal-but-
revivable HopperEntry status, `FutureRework` (see below) — not deleted, not `OptedOut`, just parked.
This replaces the original brief's 6/4/8-attempts-by-disposition-type, 4-wave, 90-120-day model —
`05 §4`'s own text isn't edited to match, this is a deliberate live instruction overriding what that
document stated as of the prior pass. See `phase-3-dialer-hopper/attempt-recycling-matrix.workflow.json`
(W3.3) and `phase-3-dialer-hopper/hopper-request-next.workflow.json` (W3.1, enforces the daily cap
at claim time).

**Required disposition to advance (locked this pass):** per Jonathan's explicit instruction, a rep
must submit a Call Note and a Disposition (Callback/Try-back date-time is optional) before the
dialer will move to the next call — true in Preview and every auto-dialer mode alike. Built as a
real gate, not a UI convention: W3.1 refuses to hand a rep a new HopperEntry while they still hold
one `Claimed` and un-dispositioned, and the rep's own disposition entry (not an AI guess) is now
what `attempt-recycling-matrix.workflow.json` (W3.3) acts on — `post-call-synthesis.workflow.json`
(W3.4)'s AI-inferred disposition is kept only as a QA cross-reference (`lastCallDispositionAiSuggested`)
so it never silently overwrites what the rep entered. See
`phase-3-dialer-hopper/call-wrap-up.workflow.json` (W3.6, new this pass).

**Per-user simultaneous-line scaling by drop rate — already covered, not a new mechanism.** "Scaling
number of lines simultaneously one user can dial based on drop rate" is exactly what
`currentAllowedSimultaneousCallsPerAgent` (Campaign, pacing-controller.workflow.json / W3.5, above)
already governs — no separate per-rep field was needed.

## Hierarchy

```
Lead (unqualified default state — every inbound record starts here)
  -> Opportunity (earned: magic-link click, inbound request, or rep-qualification)
       -> spans one or more Locations directly
Location (single physical site, GBP-driven)
  -> demos and Front Door Audits attach HERE, not on Opportunity or Company
  -> belongs to at most one Company (set once Won; null before)
Company (commercial entity)
  -> Contracts attach here
  -> can hold multiple Locations
  -> optionally belongs to one Organization
Organization (OPTIONAL — multi-company portfolios only)
Contract (Company level)
  -> mirrors the winning Opportunity's Location set
  -> BillingPeriod (monthly, one per Contract per cycle)
Services (child of Opportunity/Contract — one line item per service, own status card)
```

**The load-bearing distinction:** Opportunity is a *pre-sale funnel object*. Once a deal is Won, the
Contract (Company-level) is the object that actually represents the ongoing client relationship —
Opportunity doesn't disappear (it's the historical deal record), but nothing post-sale should keep
reading/writing it as if it were still the live source of truth. Getting this wrong was the concrete
bug in the previous pass: W4.3 (referral trigger) queried Opportunities filtered to a "Live Client"
stage — Live Client is a post-sale state, so it should have been querying Companies with an active
Contract all along.

## Objects

### Location
Single physical site, GBP-driven. Demos and Front Door Audits are inherently per-site, so they
attach here — not on the Opportunity that may span several Locations, and not on the Company that
may hold Locations under completely different Contracts.

- Fields: `id`, `name`, `gbpUrl`, `address`, `state` (2-letter, parsed from `address` — new this
  pass, needed for the compliance layer's two-party-consent and calling-hours lookups),
  `opportunityId` (which Opportunity brought it in), `companyId` (nullable — set on Won),
  `contractStatus` (`None` / `ActiveM2M` / `ActiveTerm`), `contractExpiresAt` (nullable),
  `frontDoorAuditStatus`, `frontDoorAuditScore`, `frontDoorAuditReportUrl`,
  `dueDiligenceReportUrl`, `demoStatus`, `demoStepUsed`.
- Assumed REST: `GET/POST/PATCH /rest/locations`, `/rest/locations/{id}`.
- **Location Contract Lock**: `contractStatus` is the field every lock check reads. A NEW
  Contract-generation attempt on a Location that's already `ActiveM2M`/`ActiveTerm` from an
  *unrelated* Opportunity blocks and routes to human review. A change from the *same* Company
  already holding that Contract is a Contract Amendment (supersede, not block) — see Contract below.
  Both concepts are named in `06`/`05 §13`; only the *field* they key off is built this pass — the
  actual lock-enforcement workflow (blocking a new Opportunity) and the Amendment workflow
  (superseding an existing Contract) are Step 2/3 work, not built yet. This pass makes sure
  `contractStatus` gets set correctly by the Won-conversion workflow (W1.6) so those can be built
  against real data later, not guessed at.

### Company
The commercial entity. Contracts attach here. Every post-sale automation (health/usage scoring,
tier-upgrade signal, referral trigger, churn, Front Door Audit refresh) operates on Company, not
Opportunity — see the load-bearing distinction above.

- Fields: `id`, `name`, `organizationId` (nullable).
- Assumed REST: `/rest/companies`, `/rest/companies/{id}`.

### Organization
Optional, multi-company portfolios only. Not touched by anything built so far — no workflow in this
repo creates or reads one yet, since nothing here handles multi-company clients.

- Fields: `id`, `name`.
- Assumed REST: `/rest/organizations`, `/rest/organizations/{id}`.

### Contract
Company-level. Mirrors the winning Opportunity's Location set at the moment of Won.

- Fields: `id`, `companyId`, `locationIds` (array), `status` (`Active` / `Superseded`),
  `totalValue`, `agreementValue`, `tier`, `startedAt`, `stripeSubscriptionOrPaymentId`,
  `supersededByContractId` (nullable — set on the OLD contract when an Amendment creates a new one).
- Assumed REST: `/rest/contracts`, `/rest/contracts/{id}`.
- Created by W1.6 (Stripe payment success) this pass — see `workflows/phase-1-mvp/README.md`. The
  full Contract Amendment Flow (supersede + Accounting Audit Event + Deal stage → "Expansion") is
  **not built this pass** — Step 2/3 work per the agreed sequencing, not blocking the migration.

### BillingPeriod (Billing/Accounting Period)
New in v4 (`05 §15`). One record per Contract per monthly billing cycle — auto-generated for both
M2M and Term contracts, since commission/COGS get calculated monthly regardless of contract length.

- Fields: `id`, `contractId`, `periodStart`, `periodEnd`, `revenueCents` (Stripe-linked),
  `cogsBreakdown` (voice minutes / STT / TTS / API costs), `commissionOwedCents`, `commissionStatus`
  (`accrued` / `approved` / `paid` / `clawback`), `repId`.
- Assumed REST: `/rest/billingPeriods`, `/rest/billingPeriods/{id}`.
- W1.6 creates the *first* period on Won this pass. The recurring monthly generation (and the
  "Contract Amendment closes the current period, starts a new one" rule) is Step 2/3 work — this
  pass only makes sure period #1 exists so nothing downstream has to special-case "no billing period
  yet" the moment a client goes live.

### Rep (Twenty CRM's native user / Workspace Member — extended, not a new object)
Twenty CRM already has real user accounts for logged-in team members — this isn't a new custom
object, it's that native user record with dialer-specific custom fields added on top. Needed once
DNC overrides, referral alerts, and now the dialer hopper all reference a real rep rather than a
free-text email string.

- Fields (custom additions on top of Twenty's native user): `sipExtension` (the Telnyx SIP extension
  this rep dials from — per Jonathan's request, reps get an internal extension on one shared Telnyx
  SIP trunk/connection, not individual DIDs), `dialerStatus` (`Available` / `Away` / `OnCall` /
  `Offline`).
- Assumed REST: **genuinely uncertain which endpoint Twenty CRM's native user/member object lives
  at** (`/rest/workspaceMembers` vs `/rest/users` vs something else) — flagged more prominently than
  most REST-shape guesses in this file, since getting this specific one wrong means the field
  additions have nowhere real to attach. Confirm against a real instance before building the actual
  hopper-claim workflow's user-facing side.

### Campaign
A named, loadable batch of records to dial — "the hopper" is really "Campaign + its HopperEntry
rows." Lightweight, mostly for grouping/reporting; the actual queue mechanics live on HopperEntry.

- Fields: `id`, `name`, `source` (e.g. a scraper batch ID, a niche selection), `createdAt`,
  `targetAbandonmentRateBp` (basis points, default-seeded 300 = 3%, the FTC TSR ceiling —
  flagged for compliance-owner confirmation, see Compliance layer above),
  `maxSimultaneousCallsPerAgentCeiling` (admin-set once per Campaign — the only manual pacing
  lever; not adjusted mid-campaign by anyone), `currentAllowedSimultaneousCallsPerAgent`
  (computed/ratcheted by the pacing controller, starts at the ceiling),
  `rollingAbandonmentRate` (basis points, computed by the pacing controller from recent call
  outcomes).
- Assumed REST: `/rest/campaigns`, `/rest/campaigns/{id}`.
- **No membership/ownership restriction** — confirmed explicitly: a Campaign is not gated to a
  specific set of reps ("no multi-member campaign"). Any available rep can pull from any active
  Campaign's hopper. The one exception is the Callback lock on an individual HopperEntry, below —
  that's per-record, not per-Campaign.

### HopperEntry
The actual queueable unit — one row per Opportunity currently loaded into a Campaign's dialing
queue. This is where the shared-pool-vs-personal-hold distinction actually lives.

- Fields: `id`, `campaignId`, `opportunityId`, `status` (`Available` / `Claimed` / `CallbackLocked` /
  `Completed` / `OptedOut` / `FutureRework` — the last is new this pass), `claimedByRepId` (nullable
  — set while a rep is actively on the record, or persistently for a `CallbackLocked` entry),
  `disposition` (last call outcome — the rep's own manual entry as of this pass, see the Compliance
  layer's "Required disposition to advance" above, not `Connected-`/etc. inferred by AI),
  `attemptCountThisWave`, `wave` (1-2, was 1-4 before this pass's cadence rewrite), `lastAttemptDate`,
  `firstAttemptDateThisWave` (new this pass — when the current wave's attempt clock started, used to
  check the wave's day-window), `attemptCountToday` (new this pass — resets whenever `lastAttemptDate`
  isn't today, enforces the daily attempt cap), `nextEligibleAt` (when a recycled entry re-enters the
  pool, or a Callback's rep-selected due time).
- Assumed REST: `/rest/hopperEntries`, `/rest/hopperEntries/{id}`.
- **The Callback vs. Try-back distinction, locked:**
  - **Callback** (a lead asked for a specific personal follow-up) → `status: 'CallbackLocked'`,
    `claimedByRepId` stays set to whichever rep took the call. Removed from the shared pool; only
    that rep sees it until the callback happens. The rep's optional date/time selection becomes
    `nextEligibleAt`.
  - **Try-back** (no real distinct disposition value — this is the general *behavior* for every
    non-connected outcome: `NoAnswer`/`Busy`/`GatekeeperOnly`/`VoicemailLeft`) → the attempt-matrix's
    `RETRY_NOW`/`RECYCLE_NEXT_WAVE` actions apply, and the entry goes back to `status: 'Available'`,
    `claimedByRepId: null` — back in the **shared** hopper for any agent, not locked to whoever
    called it last. This is what "try-back are placed back in campaign hopper, keep leads being
    worked" meant.
  - Hard stops (`OptOut`, `WrongNumber`) → `status: 'OptedOut'` or `'Completed'`, removed from the
    hopper entirely, never re-queued.
  - **Wave-2 exhaustion (new this pass)** → `status: 'FutureRework'`, distinct from the hard stops
    above: a revisitable holding state for a lead the current two-wave cadence has fully worked
    without a hard stop, not a permanent one. Reviving `FutureRework` entries into a new
    Campaign/wave 1 isn't built this pass — flagged, not silently assumed solved.

### ConsentRecord (new this pass)
Evidence a contact affirmatively asked for something this system would otherwise block — right
now the only value is an off-hours call request, but the shape generalizes.

- Fields: `id`, `opportunityId`, `type` (`OffHoursCallRequest` — only value so far),
  `evidenceType` (`Recording` / `Email` / `SMS`), `evidenceRef` (the actual recording ID, email
  message ID, or SMS message ID — never free text describing consent), `capturedAt`,
  `verifiedByRepId` (nullable — set once a human confirms the evidence actually supports the
  exception), `verifiedAt` (nullable).
- Assumed REST: `/rest/consentRecords`, `/rest/consentRecords/{id}`.
- **Dual-gate, fails closed on either half missing**: `evidenceRef` existing is necessary but
  not sufficient — `verifiedByRepId`/`verifiedAt` must also be set before
  `compliant-hours-consent-gate.workflow.json` allows an off-hours call. See the Compliance
  layer section above.

## What anchors where — the actual per-workflow decisions this pass made

| Concern | Anchor | Why |
|---|---|---|
| Lead intake, Deep Dive Research | Opportunity | Business-identity-level, not site-level — an Opportunity may not even have resolved its Location(s) yet at intake time. |
| Front Door Audit, demo generation/content | Location | Both are inherently per-GBP/per-site. |
| Demo Dashboard stage (Demo Queue → ... → Won) | Opportunity | The deal being pursued — stays the funnel object through the whole pre-sale flow. |
| e-sign, loss-reason/DNC/post-loss routing | Opportunity | Pre-sale events on the deal itself. |
| Stripe payment success → Contract creation | Company (creates it), Location (sets contractStatus), Opportunity (advances to Won) | This is where the funnel object hands off to the client-relationship object — see W1.6. |
| Referral trigger, health/usage scoring, tier upgrade, churn | Company | Post-sale — see the load-bearing distinction above. |
| Call disposition/post-call synthesis | Opportunity | The call is about advancing a specific deal, pre- or post- doesn't change who's being called. |
| Dialer hopper claim/queue state | HopperEntry (its own object, not Opportunity) | The queue-position/ownership state (`Available`/`Claimed`/`CallbackLocked`, attempt count, wave) isn't a deal fact — it's dialer-mechanics state that would clutter the Opportunity record and doesn't need CRM-wide visibility the way a stage does. |
| Off-hours call consent evidence | ConsentRecord (its own object, not Opportunity) | Needs its own evidence-type/verification lifecycle (system-checked existence + human sign-off) that would clutter the Opportunity record and isn't itself a deal fact. |
| Dialer pacing state (abandonment rate, allowed simultaneous calls) | Campaign | Pacing is a property of the batch being worked, not of any individual record in it — matches HopperEntry already belonging to a Campaign. |

Every row above is implemented in the corresponding workflow this pass, with the reasoning repeated
in that workflow's own `notes` field — see `workflows/README.md` and each phase folder's README for
the full list of what changed.
