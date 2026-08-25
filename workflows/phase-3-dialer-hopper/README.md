# Phase 3 — Dialer Hopper/Queue Logic (all four brief-numbered entries scaffolded, plus two new gates)

All four of Phase 3's brief-numbered catalog entries are built, plus two new workflows (W3.5, W3.6)
added across the last two passes as part of the compliance layer. W3.1/W3.2 (the hopper/queue itself)
were blocked on a design question, not a technical one — resolved by Jonathan's explicit
hopper-semantics call, now locked into `CRM-OBJECT-MODEL.md`'s **Rep**, **Campaign**, and
**HopperEntry** objects. Read that file's object sections (plus its **Compliance layer** section for
this pass's additions — the daily attempt cap, the two-wave cadence rewrite, and the required-
disposition gate all live there) before this one; the summary below assumes them.

## W3.6 — `call-wrap-up.workflow.json` (new this pass, not in the brief's own numbering)

Builds the "required disposition to advance" gate Jonathan described: a rep must submit a **Call
Note** and a **Disposition** (Callback/Try-back date-time is optional) before the dialer moves to the
next call — in Preview and every auto-dialer mode alike. Validates both are present (`Validate
submission` rejects a missing/empty Call Note or an unrecognized Disposition with a `400`), then
calls `attempt-recycling-matrix.workflow.json` (W3.3) with the rep's own disposition as the
authoritative input, logs the Call Note to the Activity Event timeline, and — only if a transcript
was actually supplied — fires `post-call-synthesis.workflow.json` (W3.4) fire-and-forget for AI QA
enrichment. The webhook's `ok: true` response *is* the "completion of this sequence triggers moving
to the next call" signal — the dialer UI is expected to treat it as the unlock, not before.

Paired with a change in W3.1: a rep can no longer claim a new HopperEntry while they still hold one
`Claimed` and un-dispositioned (`Fetch open claim` / `Has open claim?`, new this pass) — so the UI
has no path around calling this workflow first.

## The model, in one paragraph

A **Campaign** is a named, loadable batch of records to dial — no membership restriction, any
available rep can pull from any active Campaign's hopper ("no multi-member campaign"). A
**HopperEntry** is the actual queueable unit, one row per Opportunity currently loaded into a
Campaign, and it's where the shared-pool-vs-personal-hold distinction lives: a **Callback**
disposition (a lead asked for a specific personal follow-up) locks the entry to the rep who took
that call (`status: 'CallbackLocked'`) until the promised time; every other non-connected outcome —
**Try-back**, not a distinct disposition value but the general behavior for `NoAnswer`/`Busy`/
`GatekeeperOnly`/`VoicemailLeft` — returns the entry to the **shared** pool (`status: 'Available'`,
`claimedByRepId: null`) so any agent can pick it up next, subject to a per-day attempt cap and a
two-wave cadence (see W3.3 below). Hard stops (`OptOut`) remove the entry from the hopper for good;
exhausting both waves without a hard stop parks it in a distinct `FutureRework` state instead.

## W3.5 — `pacing-controller.workflow.json` (new this pass, not in the brief's own numbering)

Enforces the "keep the abandonment/drop rate in check" half of the compliance ask — per Jonathan's
explicit choice, this is **fully automatic, no manual pacing control by anyone** (not the agent, not
Command Center) during a live campaign. Called on every call outcome (`Connected`/`Abandoned`/
`Other` — `Other` isn't pacing-relevant and is a no-op), it maintains an exponential-moving-average
`rollingAbandonmentRate` on the Campaign and ratchets `currentAllowedSimultaneousCallsPerAgent`
down on any breach of `targetAbandonmentRateBp` (seeded at 300bp/3%, the FTC TSR's own ceiling —
flagged for compliance-owner/counsel confirmation) and up only once the rate is comfortably under
target, capped at `maxSimultaneousCallsPerAgentCeiling` — the one value a human (an admin) actually
sets, once per Campaign, before it runs. Errs toward compliance safety over throughput on purpose:
throttles down on any breach, ramps up conservatively.

**Not wired to anything live yet**, same status W3.3/W3.4 had before W3.1/W3.2 existed: it needs the
live-dial engine (Phase 5, Telnyx-gated, not built) to actually tag call outcomes as `Connected`/
`Abandoned` (specifically, "connected but no agent greeted within the compliance threshold" is a
live-dialer concept this repo's disposition schema doesn't produce) and to read
`currentAllowedSimultaneousCallsPerAgent` back off the Campaign before opening lines. The decision
and persistence logic itself is real and ready.

## W3.2 — `hopper-load-campaign.workflow.json`

Creates a Campaign and, fire-and-forget relative to the response (same reasoning as W1.6's
Location-status-update branch), creates one `Available`/wave-1 HopperEntry per Opportunity ID in the
request. Input: `{campaignName, source, opportunityIds: string[]}`. No membership/ownership set on
the Campaign — confirmed deliberate.

## W3.1 — `hopper-request-next.workflow.json`

The agent-facing claim action: a rep's dialer UI calls this with `{repId, campaignId?, dialerMode}`
to get the next thing to dial. **Two new gates this pass, both ahead of the existing selection
logic:** **(1)** refuses to hand out a new entry while the rep still holds one `Claimed` and
un-dispositioned (`Fetch open claim` / `Check open claim` / `Has open claim?`, `409` response) —
pairs with `call-wrap-up.workflow.json` (W3.6) being what clears that hold. **(2)** in `Select
candidate`, pool candidates already attempted `DAILY_ATTEMPT_CAP` (2, the more conservative end of
Jonathan's "2 or 3/day") times today are filtered out — but only when `dialerMode` isn't `'Preview'`;
Preview (a human reviews each dial) is exempt, and a missing/unrecognized `dialerMode` is treated as
an auto-dialer mode (cap applies) rather than silently exempted, erring toward compliance safety.

Priority order once past those gates: **(1)** this rep's own due Callback entries (personal
commitments win outright, and aren't subject to the daily cap — invited contact, not a repeated
unsolicited dial), **(2)** the shared pool's oldest-wave, longest-idle `Available` entry not yet
eligible-blocked by a recycling window or the daily cap, optionally narrowed to one Campaign. Claims
by PATCHing `status: 'Claimed'`, `claimedByRepId`, then returns the HopperEntry plus the Opportunity
it points to (kept as two separate objects on purpose — see `CRM-OBJECT-MODEL.md`'s "Dialer hopper
claim/queue state" row).

**Flagged, not silently ignored: a real race-condition risk.** Selecting a candidate and claiming it
are a read-then-write pair over a plain REST API with no confirmed optimistic-concurrency support
(no `If-Match`/conditional-PATCH on Twenty CRM's API). Two reps requesting at nearly the same moment
could both select the same `Available` entry before either PATCH lands. This workflow re-reads the
entry after claiming it and rejects the claim (`409`, "lost race") if another rep's ID won in the
meantime — that narrows the window a losing request can act on stale data, it does not close it.
Closing it for real needs either a confirmed atomic claim primitive on Twenty CRM's API or a
dedicated claim mutation outside plain REST semantics — neither exists to build against yet. The
caller's contract on a `409` is simple: just call this webhook again.

## W3.4 — `post-call-synthesis.workflow.json`

Calls Claude with the brief's own exact 4-key contract (Disposition, Summary, Try-Back Time, DM
Presence) enforced via Anthropic's Structured Outputs (`output_config.format`, a `json_schema` type)
— not parsed out of free text, and not the deprecated `output_format` parameter some older examples
still show. `cache_control` on the static system instructions, per the brief's prompt-caching rule;
the per-call transcript is the only thing that varies per request.

**Two passes ago:** the Disposition enum's `Connected-CallbackRequested` value was replaced with a
plain top-level `Callback`, matching the Callback vs. Try-back distinction above — a callback request
isn't a flavor of "Connected," it's its own routing outcome with different hopper semantics.

**Last pass:** added a 5th structured-output key, `Rebuttal After Decline` (boolean) — the global
no-rebuttal compliance policy's QA signal (see `CRM-OBJECT-MODEL.md`'s Compliance layer: enforced as
a standing script rule for every call regardless of state, not a state-keyed legal list). Written
onto the Opportunity, and when true, fires a `warning`-severity internal alert through the real
alert-dispatcher (W2.4) so a compliance reviewer sees it — fire-and-forget relative to the webhook's
response, same pattern as W1.6's Location-status-update branch. This doesn't take any disciplinary or
external action itself, per the automation risk boundary — it only surfaces a possible violation for
a human to review.

**This pass — an important correctness change:** `call-wrap-up.workflow.json` (W3.6, new) makes the
rep's own manually-entered Disposition authoritative, per Jonathan's explicit "user is required to
enter Disposition type" instruction. This workflow's AI-inferred Disposition would otherwise silently
clobber that whenever it ran after the rep's submission, so its Opportunity write was renamed from
`lastCallDisposition` to `lastCallDispositionAiSuggested` — kept only as a QA cross-reference a future
workflow could diff against the rep's entry to spot mismatches, not itself acted on. `Summary`/
`Try-Back Time`/`DM Presence`/`Rebuttal After Decline` are unaffected, still written as before.

**Worth reconsidering:** this uses `claude-opus-5` to stay consistent with every other Claude call in
this repo, but post-call synthesis runs on every single call rather than once per lead the way Deep
Dive Research or the KB generator do — a lighter/faster model might make more sense here given the
volume difference. Not changed unilaterally; flagging it as a real tradeoff worth a decision.

## W3.3 — `attempt-recycling-matrix.workflow.json`

Meant to be called by `call-wrap-up.workflow.json` (W3.6) right after a rep submits their required
Disposition. The one workflow in this library with real cadence logic hard-coded rather than a
placeholder — but the numbers changed this pass: see below.

**Two passes ago:**

- **`Callback` handling** — a disposition of `Callback` short-circuits straight to
  `action: 'CALLBACK_SCHEDULED'`, `hopperStatus: 'CallbackLocked'`, `claimedByRepId` set to the
  calling rep, `nextOwner: 'rep'` — distinct from `RETRY_NOW`/`RECYCLE_NEXT_WAVE`, which carry
  `nextOwner: 'pool'`.
- **An actual write.** PATCHes the HopperEntry named by `hopperEntryId` with the resulting state,
  skipped only for the `REVIEW` action (an unrecognized disposition — a human needs to look first).

**This pass — the cadence itself rewritten, superseding the original brief numbers:** per Jonathan's
explicit compliance-cadence instruction, this no longer uses the earlier 6/4/8-attempts-by-
disposition-type, 4-wave, 90-120-day model. It's now a two-wave structure: **wave 1** ("new lead")
allows up to 7 total attempts over up to 14 days back-to-back from its first attempt; **wave 2**
("2nd rotation") starts after a 14-day gap and allows up to 4 total attempts over up to 3 days
back-to-back. Whichever limit (attempt count or day window) hits first ends a wave. Exhausting wave 2
moves the entry to a new terminal-but-revivable status, `FutureRework` (`action: 'STOP_TO_REWORK'`) —
distinct from the hard stops (`OptOut` → `OptedOut`, `Connected-*` → `Completed`). Also new:
`scheduledAt` (the rep's optional Callback date/time, per "select time date optional") becomes the
Callback's `nextEligibleAt` when given, and every branch now also computes/persists `attemptCountToday`
and `firstAttemptDateThisWave` — the two fields the daily cap and the wave day-window need,
maintained here since this workflow already runs once per attempt.

Input contract, updated this pass: `{hopperEntryId, opportunityId, disposition,
attemptCountThisWave, wave (1-2, was 1-4), lastAttemptDate, firstAttemptDateThisWave,
attemptCountToday, repId, scheduledAt}`.

**Now wired to something live**, unlike before W3.1/W3.2 existed: they give this workflow real
HopperEntry state to read and write instead of a caller with nowhere real to send it from — and
`call-wrap-up.workflow.json` (W3.6) is now the one caller, making the rep's own disposition, not an
AI guess, the thing this workflow acts on.

## What's still not built

Nothing in Phase 3's own brief-numbered catalog. What Phase 3 depends on and doesn't build itself:
real call placement and live call-event data (Phase 5, Telnyx-gated), the dialer UI/softphone layer
that actually calls W3.1/W3.6/W3.3/W3.4/W3.5 (and W2.6/W2.7's gates) in sequence (not part of this
repo's n8n workflow library — see `CRM-OBJECT-MODEL.md`'s Rep object note on `sipExtension`/
local-presence dialing being Telnyx-gated too), a real state/zip → timezone lookup for W2.7's
calling-hours check (currently server-local-hour, flagged as a known limitation in that workflow's
own notes), reviving `FutureRework` HopperEntries into a new Campaign/wave 1 (parked, not automated —
CRM-OBJECT-MODEL.md flags this explicitly), and Twenty CRM's real REST response shapes for
`hopperEntries`/`campaigns`/`consentRecords` (same sandbox-wide caveat as every workflow here — see
`workflows/README.md`).
