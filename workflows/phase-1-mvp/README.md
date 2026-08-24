# Phase 1 — MVP: Lead → Onboarding (no Telnyx, no Stripe)

Three scaffolded workflows, in the order a lead actually moves through them. See
`workflows/README.md` for W1.3 and W1.5 (documented-only — blocked on the Proposal document format
and the Onboarding Form's field schema, neither of which is specified yet).

## W1.1 — `lead-intake-to-demo-dashboard.workflow.json`

Webhook (lead intake) → normalize the payload → call Deep Dive Research (**named placeholder URL —
that service isn't built anywhere in this repo**; per the brief's own architecture principle it
should most likely be another standalone Node/TS service like the demo generator, not n8n Code
nodes, but its input/output contract isn't decided) → write the result onto a Twenty CRM Opportunity
with stage `Demo Queue`.

**Two assumptions flagged, not silently made** (both documented inline in the JSON's node `notes`
and in `workflows/README.md`): that "Demo Dashboard" is a view over Twenty CRM Opportunity stages
rather than a separate system, and that the lead-intake caller posts the specific field names this
workflow expects (no source specifies the real lead form schema yet).

## W1.2 — `demo-generation-trigger.workflow.json`

The one workflow in this library that calls a **real, already-built, already-tested** contract:
this repo's own `src/server/` `POST /generate-demo` (checkpoint 5 of the KB demo generator). Webhook
→ call the demo generator → branch on `ok` → advance the Opportunity to `Pending Demos` on success,
or fire an alert on failure (`stage` + `reason` straight from `src/server`'s tagged failure result,
so the alert says exactly what went wrong — bad vertical/niche, couldn't resolve the company, or
Claude rejected the generation — not just "failed").

Set `DEMO_GENERATOR_URL` on the n8n instance's environment to wherever `npm run serve` (or its
production equivalent) actually runs — per the brief's infra split, that's the same Oracle box as
n8n itself.

## W1.4 — `esign-to-onboarding.workflow.json`

Documenso's own completion webhook → check it's actually a `DOCUMENT_COMPLETED` event (Documenso
fires webhooks for other document states too) → advance the Opportunity to `Onboarding` in Twenty
CRM → send the Onboarding Form link via Plunk.

Assumes the Documenso document was created with its `externalId` set to the Twenty CRM Opportunity
ID at send time, so this webhook can find its way back to the right record — that link-up isn't
built anywhere in this repo (it's part of W1.3, Proposal delivery, documented-only). Also doesn't
yet verify Documenso's `X-Documenso-Secret` header — add that check before this goes live with a
real webhook signing secret.

## Shared caveats across all three

- **Twenty CRM's exact REST/GraphQL schema is unconfirmed.** Every write to Twenty CRM here assumes
  a REST endpoint shaped like `PATCH /rest/opportunities/{id}` with a plain `stage` string field —
  reasonable given Twenty CRM's general REST API pattern, but not checked against real API docs or
  a real instance from this sandbox (no live Twenty CRM account exists yet). Confirm field names —
  especially whether `stage` is a literal string or a select-field option ID — before relying on
  these.
- **None of these three have been imported into a real n8n instance.** Same caveat as
  `phase-0-infrastructure/README.md`: node type strings/`typeVersion`s were checked against current
  n8n documentation and community examples via web search, not a live install.
- Every external HTTP call uses a credential referenced **by name** (`Twenty CRM API`, `Plunk API`),
  matching the same name the Command Center wizard writes to Cloudflare Secrets Store — no key is
  embedded in these files.
