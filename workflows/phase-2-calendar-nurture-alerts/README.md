# Phase 2 — Calendar + Nurture/CX Cadence + Alerts (partial)

Two of Phase 2's six catalog entries scaffolded this pass — the two whose mechanics didn't depend on
an undecided business rule, unlike the rest of Phase 2 (nurture/CX message content, the calendar's
event schema, Communications Hub's object schema). See `workflows/README.md` for the full Phase 2
catalog.

## W2.4 — `alert-dispatcher.workflow.json`

A generic, reusable sub-workflow: anything else in this library that needs to raise an internal
alert calls its webhook (`POST /webhook/alert-dispatch`, body `{severity, source, message}`) rather
than hitting Slack/SMS directly. `demo-generation-trigger.workflow.json` (W1.2) already calls it —
it used to POST to a bare placeholder URL before this existed.

**Real gap worth flagging directly, not just in a code comment:** neither Slack nor an SMS provider
appears anywhere in `02 - Launch Checklist`. The brief mentions "Slack/SMS via n8n" as the alert
channels but never lists an account to create for either — Slack might already exist from other
Orbit AI operations (plausible, common for a solo/small team), but SMS has no vendor named at all,
not even as a deferred item the way Telnyx and Documenso are. Worth a direct answer before this
matters for real: is there an existing Slack workspace/webhook to point `SLACK_WEBHOOK_URL` at, and
is SMS alerting actually wanted (if so, which provider — Twilio is the common default)?

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
