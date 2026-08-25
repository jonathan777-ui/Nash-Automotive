# Phase 2 — Calendar + Nurture/CX Cadence + Alerts (partial)

Two of Phase 2's six brief-numbered catalog entries scaffolded in an earlier pass — the two whose
mechanics didn't depend on an undecided business rule, unlike the rest of Phase 2 (nurture/CX message
content, the calendar's event schema, Communications Hub's object schema). Plus one new, non-brief
gate added this pass (W2.7) as part of the compliance layer. See `workflows/README.md` for the full
Phase 2 catalog.

## W2.7 — `compliant-hours-consent-gate.workflow.json` (new this pass, not in the brief's own numbering)

The same hard-gate pattern as W2.6's DNC check — called synchronously by the dialer before it ever
dials, meant to run alongside DNC, not instead of it. Blocks outbound calls outside TCPA's federal
8am-9pm (called party's local time) floor, narrowed per state where one sets a tighter window (the
override table is seeded empty — no state-specific hour was encoded without a verified source; see
`CRM-OBJECT-MODEL.md`'s Compliance layer section). The only way through outside that window is a
verified **ConsentRecord** (new object this pass): the contact directly asked to be called
outside normal hours, evidenced by a real recording ID, email, or SMS message ID
(`evidenceRef`) — checked by the system — *and* confirmed by a human (`verifiedByRepId`/
`verifiedAt`) — per Jonathan's explicit "system checks existence, human confirms validity"
answer. Either half missing blocks the call.

**Known limitation, flagged rather than silently wrong:** the hour check reads the *server's* local
hour, not the called party's actual time zone — Location only carries a US `state` (added this
pass), not a timezone/UTC offset, and several states span multiple zones or have partial DST
exceptions (AZ, IN). This is an honest placeholder for a real state/zip → timezone lookup, not a
solved calculation — don't treat it as production-correct until that's added.

## W2.4 — `alert-dispatcher.workflow.json`

A generic, reusable sub-workflow: anything else in this library that needs to raise an internal
alert calls its webhook (`POST /webhook/alert-dispatch`, body `{severity, source, message}`) rather
than hitting Google Chat/SMS directly. `demo-generation-trigger.workflow.json` (W1.2) already calls
it — it used to POST to a bare placeholder URL before this existed.

**Routes to Google Chat, not Slack** — swapped per Jonathan's request; the brief's own "Slack/SMS via
n8n" phrasing predates that. Point `GOOGLE_CHAT_WEBHOOK_URL` at a Google Chat space's webhook URL
(space → Apps & integrations → Webhooks → create one, paste the full generated URL including its
key/token query params). Since this system already assumes a Google Workspace domain elsewhere
(Drive API in `02 - Launch Checklist`, and the Command Center's Cloudflare Access policy is "anyone
on the @orbitaiautomation.com Workspace domain"), this is a much smaller gap than the Slack version
was — a Chat space is a few clicks inside a Workspace that already exists, not a separate service to
stand up.

**SMS remains a real, unresolved gap:** no provider (Twilio or otherwise) appears anywhere in
`02 - Launch Checklist`, not even as a deferred item the way Telnyx and Documenso are. Worth a direct
answer before this matters for real: is SMS alerting actually wanted, and if so, which provider?

**Also delivers in-app, to Command Center Piece 2's Internal Team Messaging** (`command-center/
src/messaging/`, built the same pass) — the "Send to Command Center (in-app)" node fires for every
severity (not critical-only, like SMS), `POST`ing to `/api/alerts` with the `ALERTS_INGEST_SECRET`
bearer credential. Unlike Google Chat/SMS, this one's a real, tested, already-provisioned target,
not a named placeholder — see `command-center/README.md`.

**Once imported into a real n8n instance:** note this workflow's assigned ID and update every other
workflow's `settings.errorWorkflow` field (currently `PLACEHOLDER_ALERT_WORKFLOW_ID` throughout this
whole library) to point at it — that's a one-time manual step after import, not something fixable
from this sandbox.

## W2.6 — `dnc-check.workflow.json` (the action-layer-block half only)

The other half of W2.6 — role-based hiding of DNC'd contacts in the dialer UI — is a Twenty CRM
permissions configuration, not a workflow, so it's not represented here. This workflow is the hard
block: called synchronously before a dialer action, it looks up the Opportunity's `restrictionReason`
field (from CRM Architecture §13's post-loss routing) and blocks unless a logged admin override is
provided, writing that override to the Activity Event timeline.

**Scope note:** this checks `restrictionReason === 'DNC'` specifically, not the broader
`postLossTrack === 'Restricted'` state — "Not Interested"/"Bad Information" opportunities are
`Restricted` (no further outreach) without necessarily being a *legal* DNC block, and enforcing that
broader "no outreach" rule belongs more naturally in the nurture-cadence workflow (W2.2, not built)
than in a hard call-blocking gate. Worth revisiting once W2.2 exists.

## Still documented-only (see `workflows/README.md` for why)

W2.1 (calendar — event schema undecided), W2.2/W2.3 (nurture/CX — message content undecided), W2.5
(Communications Hub — needs the custom object built in Twenty CRM first).
