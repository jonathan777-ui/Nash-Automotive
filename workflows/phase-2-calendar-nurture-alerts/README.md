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
alert calls its webhook (`POST /webhook/alert-dispatch`, body `{severity, source, message, linkUrl?}`)
rather than hitting Google Chat/SMS directly. `demo-generation-trigger.workflow.json` (W1.2) already
calls it — it used to POST to a bare placeholder URL before this existed.

**Alert-surface priority fixed this pass (Step 3, per `05 §11`'s explicit primary/secondary split):**
Command Center is now the actionable PRIMARY surface — `linkUrl` (new field) flows through to
`/api/alerts` and renders as a real "Open record →" deep link on `/messaging`, which also gained an
Acknowledge action (`POST /messaging/alerts/acknowledge`, first-to-acknowledge wins). Google Chat and
SMS are explicitly SECONDARY now — both messages append a link back to `{COMMAND_CENTER_URL}/messaging`
instead of being self-contained dead ends with no path to where a rep actually acts. Before this pass
all three targets fired as roughly parallel, undifferentiated destinations.

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
src/messaging/`) — the "Send to Command Center (in-app)" node fires for every severity (not
critical-only, like SMS), `POST`ing to `/api/alerts` with the `ALERTS_INGEST_SECRET` bearer
credential. Unlike Google Chat/SMS, this one's a real, tested, already-provisioned target, not a
named placeholder — see `command-center/README.md`'s "Step 3" note for the full alerts-table/UI
change list.

**Once imported into a real n8n instance:** note this workflow's assigned ID and update every other
workflow's `settings.errorWorkflow` field (currently `PLACEHOLDER_ALERT_WORKFLOW_ID` throughout this
whole library) to point at it — that's a one-time manual step after import, not something fixable
from this sandbox.

## W2.1 — `unified-scheduling.workflow.json` + `missed-follow-up-check.workflow.json` + `no-show-reengagement.workflow.json`

`05 §3`'s "shared advanced-logic layer used by every component" — the single place any workflow
should go through to put something on a calendar, instead of each one talking to Google Calendar
independently. `unified-scheduling.workflow.json` checks for overlapping events first (returns
suggested alternate slots on conflict rather than silently double-booking or hard-blocking), tags
the event System- vs Human-Scheduled via Google Calendar's own `extendedProperties.private`, and
writes a new `ScheduledTouch` row (`CRM-OBJECT-MODEL.md`) so there's calendar-agnostic state to check
disposition against. `missed-follow-up-check.workflow.json` (hourly) is that check — "any scheduled
touch overdue without disposition fires an alert," the named `#missed-follow-ups` trigger.
`no-show-reengagement.workflow.json` drafts (via a real Claude call, never auto-sends) a rebooking
message once a Demo touch is marked `NoShow`. **Flagged, not silently assumed:** the Google Calendar
call uses a raw REST shape (this library's usual one-HTTP-node-type convention) rather than n8n's
dedicated Google Calendar node/credential type — reconsider once this actually gets imported, since
the dedicated node's guided OAuth setup may just be less work. `GOOGLE_CALENDAR_ID` is a new
credential gap, same treatment as `SMS_PROVIDER_URL` — not yet in the Command Center vendor
checklist.

## `tag-for-action.workflow.json` (new, not brief-W-numbered — Command Center Step 5)

`05 §14`'s Tag-for-Action mechanism, the n8n side: logs a `TagForAction` Activity Event on Twenty
CRM regardless of target, then branches. A **human** target gets a personal notification via
Command Center's `/api/notifications` (the actionable delivery — see `command-center/README.md`'s
Step 5 note). An **AI-employee** target gets classified against a small reversible-action set
(summarize/research/draft-only, anything unrecognized defaults to gated) — **reversible** calls
Claude for real and delivers the answer back as a notification immediately; **gated** creates a
pending `ai_action_requests` row instead of calling Claude at all, requiring a human's
Approve/Reject on `/messaging` before anything happens — "external-send/billing/irreversible = same
human-approval gate regardless of trigger," per spec. Not built: actually executing an *approved*
gated action (Approve/Reject today only changes status), and AI-to-AI channel posting (needs a
running AI-agent loop this repo doesn't have).

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
