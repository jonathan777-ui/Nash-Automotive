# Phase 3 — Dialer Hopper/Queue Logic (all four catalog entries scaffolded)

All four of Phase 3's catalog entries are now built. W3.1/W3.2 (the hopper/queue itself) were
blocked on a design question, not a technical one — resolved this pass by Jonathan's explicit
hopper-semantics call, now locked into `CRM-OBJECT-MODEL.md`'s **Rep**, **Campaign**, and
**HopperEntry** objects. Read that file's object sections before this one; the summary below assumes
them.

## The model, in one paragraph

A **Campaign** is a named, loadable batch of records to dial — no membership restriction, any
available rep can pull from any active Campaign's hopper ("no multi-member campaign"). A
**HopperEntry** is the actual queueable unit, one row per Opportunity currently loaded into a
Campaign, and it's where the shared-pool-vs-personal-hold distinction lives: a **Callback**
disposition (a lead asked for a specific personal follow-up) locks the entry to the rep who took
that call (`status: 'CallbackLocked'`) until the promised time; every other non-connected outcome —
**Try-back**, not a distinct disposition value but the general behavior for `NoAnswer`/`Busy`/
`GatekeeperOnly`/`VoicemailLeft` — returns the entry to the **shared** pool (`status: 'Available'`,
`claimedByRepId: null`) so any agent can pick it up next. Hard stops (`OptOut`, the attempt matrix's
`STOP`) remove the entry from the hopper for good.

## W3.2 — `hopper-load-campaign.workflow.json`

Creates a Campaign and, fire-and-forget relative to the response (same reasoning as W1.6's
Location-status-update branch), creates one `Available`/wave-1 HopperEntry per Opportunity ID in the
request. Input: `{campaignName, source, opportunityIds: string[]}`. No membership/ownership set on
the Campaign — confirmed deliberate.

## W3.1 — `hopper-request-next.workflow.json`

The agent-facing claim action: a rep's dialer UI calls this with `{repId, campaignId?}` to get the
next thing to dial. Priority order: **(1)** this rep's own due Callback entries (personal
commitments win outright), **(2)** the shared pool's oldest-wave, longest-idle `Available` entry not
yet eligible-blocked by a recycling window, optionally narrowed to one Campaign. Claims by PATCHing
`status: 'Claimed'`, `claimedByRepId`, then returns the HopperEntry plus the Opportunity it points
to (kept as two separate objects on purpose — see `CRM-OBJECT-MODEL.md`'s "Dialer hopper claim/queue
state" row).

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

**This pass:** the Disposition enum's `Connected-CallbackRequested` value was replaced with a plain
top-level `Callback`, matching the Callback vs. Try-back distinction above — a callback request isn't
a flavor of "Connected," it's its own routing outcome with different hopper semantics.

**Worth reconsidering:** this uses `claude-opus-5` to stay consistent with every other Claude call in
this repo, but post-call synthesis runs on every single call rather than once per lead the way Deep
Dive Research or the KB generator do — a lighter/faster model might make more sense here given the
volume difference. Not changed unilaterally; flagging it as a real tradeoff worth a decision.

## W3.3 — `attempt-recycling-matrix.workflow.json`

Meant to be called right after W3.4 produces a `Disposition`. The one workflow in this library with
real business logic hard-coded rather than a placeholder — the brief gives the actual numbers: 6
attempts on no-answer, 4 on busy, 8 on gatekeeper-only, a hard stop on opt-out, and 4-wave recycling
with a 90-120 day gap between waves.

**This pass, two real additions, not just documentation:**

- **`Callback` handling** — a disposition of `Callback` now short-circuits straight to
  `action: 'CALLBACK_SCHEDULED'`, `hopperStatus: 'CallbackLocked'`, `claimedByRepId` set to the
  calling rep, `nextOwner: 'rep'` — distinct from the existing `RETRY_NOW`/`RECYCLE_NEXT_WAVE`
  actions, which now also carry `nextOwner: 'pool'` explicitly.
- **An actual write.** Previously this workflow only computed a decision and responded with it —
  correct logic with nowhere to persist to, because HopperEntry didn't exist as an object until this
  pass. It now PATCHes the HopperEntry named in the new `hopperEntryId` input field with the
  resulting `status`/`claimedByRepId`/`wave`/`nextEligibleAt`, skipped only for the `REVIEW` action
  (an unrecognized disposition — nothing safe to write, a human needs to look first, so the entry is
  left exactly as claimed rather than touched).

Input contract, updated this pass: `{hopperEntryId, opportunityId, disposition,
attemptCountThisWave, wave, lastAttemptDate, repId}` — `hopperEntryId` and `repId` are new, needed so
a `Callback` locks to the rep who actually took the call and so there's a real row to write the
decision onto.

**Now wired to something live**, unlike last pass: W3.1/W3.2 give this workflow real HopperEntry
state to read and write instead of a caller with nowhere real to send `attemptCountThisWave`/`wave`/
`lastAttemptDate` from.

## What's still not built

Nothing in Phase 3's own catalog. What Phase 3 depends on and doesn't build itself: real call
placement and live call-event data (Phase 5, Telnyx-gated), the dialer UI/softphone layer that
actually calls W3.1/W3.4/W3.3 in sequence (not part of this repo's n8n workflow library — see
`CRM-OBJECT-MODEL.md`'s Rep object note on `sipExtension`/local-presence dialing being Telnyx-gated
too), and Twenty CRM's real REST response shapes for `hopperEntries`/`campaigns` (same
sandbox-wide caveat as every workflow here — see `workflows/README.md`).
