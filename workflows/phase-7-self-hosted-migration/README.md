# Phase 7 — Twenty CRM: Cloud → Self-Hosted Migration Runbook

W7.1. **A documented runbook, not a workflow** — the roadmap's own gate on this item is "N/A (infra
migration, not a runtime automation)," and it says so for a real reason: a one-time cutover of the
single system every other piece in this repo depends on is exactly the kind of action this whole
engagement's automation risk boundary treats as human-executed, not auto-triggered. **Explicitly
sequenced after everything else is live and stable** — do not run this while Phase 1-6 are still
being verified against a real Twenty CRM Cloud instance for the first time. Nothing here should be
attempted until `TWENTY_CRM_BASE_URL`/`TWENTY_CRM_API_KEY` have been pointed at real Cloud Pro
credentials (Command Center's vendor wizard) and every workflow/function that touches Twenty CRM has
been confirmed working against them.

## Why this exists at all

The brief's own infra split: Twenty CRM starts on **Cloud Pro tier** (fast to stand up, zero infra
to manage while everything else here is still being built and verified) and moves to **self-hosted
on the Oracle box** later — the same VM already running n8n and the scraper
(`command-center/src/vendors.ts`'s `oracle` row: "the persistent VM running n8n, the scraper, and
(later) self-hosted Twenty CRM"). Reasons to actually do this, once stable:

- **Cost** — Cloud Pro is a recurring per-seat/per-workspace charge; self-hosted is marginal compute
  on infrastructure already being paid for.
- **Data control** — CRM data (client PII, contract values, call recordings' metadata) staying on
  infrastructure this org fully controls, not a third party's cloud.
- **No functional urgency** — nothing about Cloud Pro is a blocker for anything built in this repo.
  This migration is an operational/cost decision, not a feature dependency; there's no reason to
  rush it ahead of "everything else is live and stable."

## Why this repo needs almost no code changes to make this work

Confirmed by grep across the whole repo: **zero hardcoded Twenty CRM URLs anywhere.** Every single
workflow, Netlify Function, and Command Center route reads `TWENTY_CRM_BASE_URL`/`TWENTY_CRM_API_KEY`
from environment/credential configuration, never a literal `https://...twenty.com` string. This was a
deliberate discipline followed consistently across every pass of this build specifically so a
migration like this one would be a **credential/URL swap, not a code change**. The runbook below
reflects that — most of the work is data migration and cutover sequencing, not touching this
codebase.

## Pre-migration checklist

1. **Confirm the Oracle box has capacity.** Self-hosted Twenty CRM needs its own Postgres database,
   Redis instance, and the Twenty application containers (per Twenty's own self-hosting
   documentation — Docker Compose is Twenty's own documented deployment path; this repo doesn't
   re-derive that setup, it's Twenty's to specify and keep current). Confirm the box isn't already
   resource-constrained by n8n + the scraper before adding a third service to it.
2. **Freeze non-essential CRM writes** during the cutover window (see "Cutover window" below) —
   coordinate with whoever's using Command Center/the dialer/the portal live at the time. This
   migration is not designed to run against a live-writing system without a freeze.
3. **Confirm this repo's own backup/restore discipline extends to the new instance** (see "Post-
   migration: extend backup coverage" below) before calling the migration done — an un-backed-up
   self-hosted Twenty CRM is a strictly worse position than Cloud Pro's own managed backups.
4. **Take a fresh, verified export from Cloud Pro** (see "Data migration" below) as close to the
   cutover window as practical, so the gap between "last export" and "cutover" is minutes, not days.

## Data migration

Twenty CRM Cloud Pro's own data-export/migration tooling is the authoritative path here — **this
repo assumes Twenty CRM's REST API shape throughout (flagged everywhere as "unconfirmed against a
real instance"), it does not have privileged/direct database access to a Cloud Pro workspace,** so a
raw Postgres-level `pg_dump`-and-restore (the pattern `backup-restore-test.workflow.json` already
uses for the scraper's own DB) isn't available for the Cloud→self-host leg the way it would be for a
self-host→self-host backup. Two realistic paths, in order of preference:

1. **Twenty's own official export/import tooling**, if Cloud Pro offers a full-workspace data export
   (check Twenty's current documentation/support channel before this migration — their own tooling
   evolves independently of this repo and is the authoritative source, not something to guess at
   here).
2. **API-driven re-creation**, as a fallback if no bulk export exists: page through every object type
   this repo actually uses (`Opportunity`, `Location`, `Company`, `Contract`, `BillingPeriod`,
   `AccountingAuditEvent`, `HopperEntry`, `Campaign`, `ConsentRecord`, `SupportTicket`, and Twenty's
   native `Rep`/Workspace Member records — the full list is `CRM-OBJECT-MODEL.md`'s own Objects
   section) via `GET /rest/{object}` against Cloud Pro, and `POST /rest/{object}` the same records
   into the freshly-provisioned self-hosted instance, preserving IDs where Twenty's API allows it
   (**if IDs can't be preserved**, every foreign-key-style reference this repo relies on —
   `opportunityId`, `companyId`, `locationIds`, `hopperEntryId`, etc. — needs a full old-ID→new-ID
   remap pass across every migrated record before cutover, which is real, careful, one-time
   scripting work, not something to do casually by hand).

Either way: **verify record counts per object type match between source and destination** before
proceeding to cutover — a partial migration that "looks done" because the UI loads is the single
most likely way this step goes wrong silently.

## Cutover sequence

1. **Choose a low-traffic window** and freeze writes (see pre-migration checklist).
2. **Take the final export** from Cloud Pro (closest possible to the freeze).
3. **Migrate data** into the self-hosted instance (see above), verify counts.
4. **Point every consumer at the new instance** — this is the entire "code change" surface of this
   migration:
   - **Command Center**: update the `Twenty CRM` vendor entry (`command-center/src/vendors.ts`) via
     its own wizard — write the new `TWENTY_CRM_BASE_URL`/`TWENTY_CRM_API_KEY` to Cloudflare Secrets
     Store, same UI flow used to set them the first time.
   - **n8n**: update the `Twenty CRM API` credential (referenced by name across every workflow in
     `workflows/`) to the new base URL/API key. One credential, not 40+ file edits — this is exactly
     what "reference by credential name, never inline the value" was built to make trivial.
   - **Portal (Netlify)**: update `TWENTY_CRM_BASE_URL`/`TWENTY_CRM_API_KEY` in Netlify's environment
     variables (`portal/netlify/functions/lib/getOpportunity.ts`,
     `create-checkout-session.mts`, `verify-documents-pin.mts`, and every other function reading
     these two env vars) and redeploy.
5. **Smoke-test against the new instance** before lifting the write-freeze — at minimum: fetch one
   real Opportunity through the portal (`GET /api/opportunity?id=...`), post one test alert through a
   real n8n workflow execution, and confirm a Command Center page that reads Twenty CRM data still
   renders correctly.
6. **Lift the write-freeze.**
7. **Keep Cloud Pro live but read-only for a rollback window** (a few days, judgment call — long
   enough to catch a migration gap that only surfaces under real usage, short enough not to keep
   paying for infra this migration is meant to retire) before cancelling the Cloud Pro subscription.

## Rollback plan

If step 5's smoke test fails, or a real problem surfaces during the rollback window: **repoint the
same four consumer locations back to the Cloud Pro `TWENTY_CRM_BASE_URL`/`TWENTY_CRM_API_KEY`** (the
exact reverse of cutover step 4) and lift the freeze against Cloud Pro instead. Because nothing in
this codebase hardcodes an instance, rollback is the same "swap one credential" operation as cutover
itself, in reverse — not a code revert.

## Post-migration: extend backup coverage

Once self-hosted, Twenty CRM's own Postgres database becomes this repo's backup responsibility for
the first time (Cloud Pro's backups were Twenty's problem; a self-hosted instance's aren't anyone
else's). **Extend `nightly-backup.workflow.json` and `backup-restore-test.workflow.json`**
(`workflows/phase-0-infrastructure/`) to also `pg_dump` the new Twenty CRM database alongside the
scraper's — same R2 bucket (`orbit-backups`), same weekly restore-to-scratch verification pattern,
just a second named database rather than a new mechanism. Not built proactively in this pass since
the self-hosted database doesn't exist yet to dump — this is the concrete first thing to do once it
does.

## What this runbook deliberately does not do

- **Does not attempt the migration itself.** No script in this repo performs any part of the data
  migration or cutover — per the roadmap's own gate, this is a human-executed, one-time infra action,
  the same category as "creating the Telnyx account" (Phase 5) or "creating the Stripe account"
  (Phase 1), neither of which this repo automates either.
- **Does not invent Twenty's own self-hosting deployment steps.** Twenty's official Docker
  Compose/self-hosting documentation is the authoritative source for standing up the application
  itself (containers, Postgres/Redis provisioning, environment configuration) — reproducing or
  guessing at that here would drift out of date independently of Twenty's own docs and is exactly
  the kind of "don't invent what a real doc should specify" gap this repo has flagged consistently
  elsewhere (Front Door Audit's categories, the demo-extension voice-AI bridge).
