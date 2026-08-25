# Phase 5 — Telnyx Activation

The one phase the brief itself names a genuine reason to defer ("no verification-queue blocker like
Telnyx has" is explicitly the opposite of what makes Stripe safe to build in Phase 1 — Telnyx's SIP
trunk/number provisioning goes through an account-verification queue that has to clear before
anything here can actually place a call). Built now anyway, against placeholder credentials
(`command-center/src/vendors.ts`'s new `telnyx` vendor entry), same "ready to go the moment real
keys land" treatment as Stripe got in Phase 1 — this is the "entire stack complete except keys"
directive applied to the one phase that previously had nothing built at all.

## W5.2 — `dialer-place-call.workflow.json` + `telnyx-call-events-webhook.workflow.json`

The live-dial engine every compliance gate in this repo has been describing as "not yet built" since
it was written — W2.6 (`dnc-check.workflow.json`), W2.7 (`compliant-hours-consent-gate.workflow.json`),
and W3.5 (`pacing-controller.workflow.json`) all explicitly named this as their real, still-missing
caller. It exists now, in two workflows:

**`dialer-place-call.workflow.json`** — the synchronous call-placement action a Deals Desk-style
dialer UI (not part of this repo — see the tracked Deals Desk task, sequenced last) would invoke right
after a rep claims a HopperEntry (W3.1). In order:

1. Calls `dnc-check.workflow.json` (W2.6) synchronously — blocks on `403` if the Opportunity is DNC
   without a logged override.
2. Calls `compliant-hours-consent-gate.workflow.json` (W2.7) synchronously — blocks outside the
   TCPA-floor calling-hours window without a verified off-hours `ConsentRecord`.
3. **Local presence**: queries the Telnyx account's own number inventory
   (`GET /v2/phone_numbers?filter[phone_number][starts_with]=...`) for a number already matching the
   callee's area code, falling back to a single default number (flagged, not silently degraded — a
   thin number pool is visible in the resulting alert, not hidden). Buying/pooling *new* numbers per
   area code as campaign footprint grows is W5.1's job (see below), not this workflow's.
4. **Dials two legs in parallel** — the customer (with `answering_machine_detection: 'premium'`, the
   AMD half of W5.2) and the rep's own internal SIP extension (`Rep.sipExtension`,
   `CRM-OBJECT-MODEL.md` — one shared Telnyx SIP trunk, not individual DIDs). Both legs carry a
   base64 `client_state` (Telnyx's own documented mechanism) so the events webhook can correlate an
   async event back to `{role, hopperEntryId, opportunityId, repId}` without a second lookup table.
5. Writes both legs' call control IDs onto the **HopperEntry** (`telnyxCustomerCallControlId`/
   `telnyxAgentCallControlId`, new fields this pass) and responds `{ok:true, dialing:true}` —
   fire-and-forget from there; the UI doesn't wait for the call to actually connect.

**`telnyx-call-events-webhook.workflow.json`** — the single webhook endpoint both legs'
`webhook_url` points at, handling Telnyx's async Call Control events:

- `call.answered` (customer leg) → **Speak** the recording disclosure (`06`'s deferred audit-gap
  item, closed here — see below).
- `call.speak.ended` (customer leg) → **Start recording** — only after disclosure has actually
  finished, the compliant ordering the gap required.
- `call.machine.detection.ended` → fetches the HopperEntry (for `telnyxAgentCallControlId` and
  `campaignId`), then branches on Telnyx's AMD result: `human` → **bridge** the two legs together
  and report `callOutcome: 'Connected'` to `pacing-controller.workflow.json` (W3.5's real caller, for
  the first time); anything else (`machine`/`not_sure`/`failure`) → **hang up** the customer leg and
  report `callOutcome: 'Other'`.
- `call.recording.saved` → writes `telnyxRecordingUrl` onto the HopperEntry. Does **not**
  auto-trigger `post-call-synthesis.workflow.json` (W3.4) — that needs a transcript this event
  doesn't carry (Telnyx's real-time transcription, if enabled, is a separate event this workflow
  doesn't subscribe to); W3.4 stays triggered the way `call-wrap-up.workflow.json` (W3.6) already
  does it, only when a transcript was actually supplied.

**Call recording disclosure (`06`'s deferred audit-gap item, closed this pass):** the disclosure is
spoken and confirmed complete (`call.speak.ended`) *before* recording starts — never the reverse.
Wording is this pass's own reasonable default, not brief-specified or counsel-reviewed — flag for
legal sign-off before this goes live, same treatment as the compliant-hours 8am–9pm federal floor.

**Explicitly not built — Power/3-Line dialing.** Everything above is Preview-mode, single-line:
one customer leg + one agent leg per call, dialed together, bridged once AMD says human. Real
Power/3-Line dialing (opening several simultaneous customer legs per agent and racing them, dropping
whichever don't connect before an agent frees up) needs a call *orchestrator* tracking N in-flight
legs per rep and making real-time drop/bridge decisions — a materially different architecture this
pass doesn't build. This is also the only place a genuine FTC-style `Abandoned` pacing outcome could
ever be produced; this workflow can only ever report `Connected`/`Other`, never `Abandoned`, flagged
explicitly rather than faked.

## W5.1 — SIP trunk / number provisioning

Stays what the roadmap always said it was: **"Manual (account setup)... N/A (infra, not a runtime
automation)."** Creating the Telnyx account, clearing its verification queue, creating the SIP trunk/
Call Control connection, and buying the *first* batch of numbers are one-time portal actions with no
meaningful API sequence to automate — the same reasoning `phase-7`'s Twenty CRM self-host migration
stays a documented runbook, not a workflow.

What **is** real runtime automation and genuinely belongs here: `dialer-place-call.workflow.json`'s
local-presence number *lookup* (above) queries whatever numbers the account already owns — buying
*new* numbers as the campaign footprint expands into new area codes is a natural follow-up workflow
(Telnyx's Number Search & Ordering API) once real usage data shows which area codes need coverage;
not built speculatively ahead of that data existing.

## W5.3 — `demo-extension-auto-assign.workflow.json` + `demo-extension-inbound-call.workflow.json`

**Assignment** (`demo-extension-auto-assign.workflow.json`): fire-and-forget off
`demo-generation-trigger.workflow.json`'s success path (wired this pass, same pattern as W1.6's
opening-line-tracking branch) — allocates the next sequential extension starting at 1000 via Command
Center's new `POST /api/demo-extensions/allocate` (an atomic compare-and-swap loop over a D1 counter,
`command-center/src/messaging/db.ts`'s `allocateDemoExtension` — chosen over Twenty CRM specifically
because there's no confirmed atomic-increment primitive there, the same gap `hopper-request-next`'s
claim race-condition notes already flag), writes it onto the Location (`demoExtension`), and alerts
`#demos`.

**Inbound lookup** (`demo-extension-inbound-call.workflow.json`): the other half — a prospect calls
the shared `TELNYX_DEMO_LINE_NUMBER` and dials their extension, this workflow resolves the digits
back to a Location. **Honest gap, not guessed at:** it can correctly identify *which* Location's demo
was requested, but actually connecting the caller to a live, real-time conversational voice
experience of that Location's AI receptionist needs a full voice-AI pipeline (real-time
speech-to-text, an LLM turn loop grounded in the generated `unifiedKb`, text-to-speech, bridged onto
the call) that doesn't exist anywhere in this repo — `src/server/`'s `/generate-demo` produces a
knowledge-base object and a web/chat demo, not a phone-callable voice agent. The workflow responds
with a truthful placeholder TeXML message instead of inventing that bridge — same "name what's not
solved, don't guess" treatment as Front Door Audit's unscored 10 categories.

## New credential — `command-center/src/vendors.ts`

Added a `telnyx` vendor entry this pass (manual-paste, no CLI-auth path found): API key, Call Control
connection ID, SIP domain, default outbound number, and the shared demo-line number — five
placeholders every Phase 5 workflow above already references (`PLACEHOLDER_TELNYX_...` fallbacks),
activating the moment real values are saved through the Command Center wizard, same pattern Stripe
got in Phase 1.

## New CRM fields (`CRM-OBJECT-MODEL.md`)

- **HopperEntry**: `telnyxCustomerCallControlId`, `telnyxAgentCallControlId`, `telnyxRecordingUrl`.
- **Location**: `demoExtension`.

## Shared caveats

Same "flagged uncertain against a live account, not exercised against one" treatment as every
Stripe/Twenty CRM integration point in this repo: Telnyx's exact webhook payload shape, the AMD
result values, the `client_state` encoding round-trip, and the local-presence number-search filter
syntax are all real, documented Telnyx Call Control v2 API shapes — not guessed at random — but
unverified against a real account from this sandbox.
