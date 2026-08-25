# Phase 6 — Reporting & Support Ticketing

All three of Phase 6's catalog entries scaffolded this pass — none of them had a real blocker the
way Phase 5's Telnyx items did, just hadn't been reached yet in the build sequence.

## W6.3 — `onboarding-provisioning.workflow.json`

Fire-and-forget off `stripe-payment-to-crm.workflow.json`'s "Advance Opportunity to Won" node (a
fourth parallel branch, alongside the existing response/opening-line-tracking ones) — "Post-payment
event... Auto (internal, reversible provisioning)," per the brief's own gate label. In order:

1. **Creates a per-client Google Drive folder** (raw REST call against Drive API v3, not n8n's
   native Google Drive node — see the node's own notes on why). This closes a real, previously-silent
   gap: W1.7's own description ("PIN-gated, post-payment Drive folder *repurposing*") assumed a
   folder already existed from earlier in the funnel, but nothing anywhere in this repo ever created
   one. It does now.
2. **Generates a 6-digit access PIN**, hashes it (SHA-256), and writes only the hash onto the
   Company (`documentsAccessPinHash`) — the plaintext never touches the CRM's queryable fields.
3. **Deliberately does not email the PIN to the client.** The plaintext is surfaced internally only
   (an Activity Event + an `#onboarding` alert) so a human rep decides how to relay it — sidesteps
   the external-send human-review question this repo has applied to every other client-facing draft
   (nurture, CX, portal-abandonment) without needing to build (or gate) an email flow for a one-time
   operational PIN. See the workflow's own node notes for the full tradeoff this makes (plaintext
   does land in the CRM timeline/alert, which is an acceptable exposure for a low-stakes document
   gate, explicitly flagged as not something to reuse for anything higher-stakes).

**Credential gap, flagged not silently assumed:** needs a `Google Drive OAuth2` n8n credential
distinct from the `google-cloud` CLI-auth row already in `command-center/src/vendors.ts` — that row
covers Application Default Credentials for server-side API calls (Places API, Drive API's own
account-level scopes), not an OAuth2 client n8n's HTTP node can authenticate a REST call with. See
`workflows/README.md`'s credential-gaps section.

## W1.7 — `documents.html` + `verify-documents-pin.mts` (the other half of W6.3)

Previously "documented only, blocked on the folder itself not existing." Unblocked this pass:

- **`portal/public/documents.html`** — a PIN entry form. On a correct PIN, opens the client's Drive
  folder in a new tab (a real link, not an embedded file browser — matches the CRM Architecture's
  "references, doesn't host" principle even though this is a client-facing page, not the CRM itself;
  building a native Drive file-picker/upload UI is real scope this pass doesn't take on).
- **`portal/netlify/functions/verify-documents-pin.mts`** (+ `lib/verifyDocumentsPin.ts`, unit
  tested) — fetches the Opportunity → Company → compares a SHA-256 hash of the submitted PIN against
  `documentsAccessPinHash` (constant-time comparison), and **logs every attempt** (success or
  failure) as an Activity Event — "with an audit log of access," per the brief, satisfied for real.
  Returns a distinct `409` ("not yet provisioned") rather than a bare failure when the Company hasn't
  been provisioned yet at all — a real race exists between Stripe's webhook (async) and a client
  navigating straight to this page right after checkout; this status lets the page say something
  honest instead of "wrong PIN" for a PIN that was never generated.

## W6.2 — `support-ticket-intake.workflow.json` + `support.html`

A client-facing support form (`portal/public/support.html`) → `submit-support-ticket.mts` (+
`lib/submitSupportTicket.ts`, unit tested, synchronous — unlike the fire-and-forget beacons
elsewhere in the portal, a support submitter reasonably wants confirmation before leaving the page)
→ `support-ticket-intake.workflow.json`, which validates a second time server-side (belt and
suspenders, same reasoning `portal-esign-submitted.workflow.json` gives) and creates a new
**SupportTicket** object (`CRM-OBJECT-MODEL.md`) with `status: 'Open'`.

**"Auto to intake/route; human resolves"** — the *routing* half is the `warning`-severity alert to
`#cx-retention` (`alertRouting.ts` extended this pass to match `'support-ticket'`); nothing in this
repo ever auto-resolves a ticket or auto-replies to the client, matching "humans stay on... support"
literally.

## W6.1 — `pipeline-reporting-digest.workflow.json`

Weekly (this pass's own judgment call — no cadence given in the source docs for this item), fetches
Opportunities/LiveClient Companies/recent Billing Periods **sequentially, not in parallel** — a
deliberate simplification (same reasoning `lead-intake-to-demo-dashboard.workflow.json`'s own notes
give for a similar choice) that avoids a 3-input Merge node, whose parameter shape is already
flagged elsewhere in this repo as the single most uncertain node type to import, for a workflow
where latency genuinely doesn't matter. Computes a stage-count breakdown, active-client count, and
trailing-30-day revenue, drafts a narrative digest via Claude (same pattern as
`ai-activity-summary.workflow.json`), and posts to `#accounting` — not a perfect semantic fit for
"pipeline visibility" among the 11 LOCKED channel names (`05 §14`), but the closest one; flagged in
the workflow's own notes rather than inventing a 12th channel outside the brief's fixed taxonomy.

**No real "on-demand" trigger** (a Command Center button) — would need a new Command Center route
calling this workflow's webhook equivalent; not built speculatively without a page to put the
button on.

## New CRM fields/objects (`CRM-OBJECT-MODEL.md`)

- **Company**: `driveFolderId`, `driveFolderUrl`, `documentsAccessPinHash`.
- **SupportTicket** (new object): `id`, `opportunityId` (nullable), `contactName` (nullable),
  `contactEmail`, `subject`, `message`, `status`, `createdAt`.

## New alert routes (`alertRouting.ts`)

- `'pipeline-reporting'` → `#accounting`.
- `'support-ticket'` → `#cx-retention`.
