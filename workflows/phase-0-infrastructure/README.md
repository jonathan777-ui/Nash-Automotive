# Phase 0 — Infrastructure Foundation

## W0.1 — Nightly backup (`nightly-backup.workflow.json`)

Schedule Trigger (03:00 daily, instance-default timezone — confirm this is what's wanted before
relying on it) → `pg_dump` the scraper's Postgres DB → `n8n export:workflow --all` (n8n's own CLI
export) → both files uploaded to the Cloudflare R2 bucket `orbit-backups` (already live) via n8n's
S3 node pointed at R2's S3-compatible endpoint.

Failure handling uses n8n's built-in **Error Workflow** setting (`settings.errorWorkflow` in the
JSON) rather than manual exit-code checks after each step — the more idiomatic n8n pattern, and it
means this workflow doesn't need to know anything about how alerts actually get sent (that's W2.4,
not yet built). Set `errorWorkflow` to a real workflow ID once one exists; until then it's the named
placeholder `PLACEHOLDER_ALERT_WORKFLOW_ID`, not a silent gap.

### What's unverified

- **Not imported into a real n8n instance.** Node type strings and `typeVersion`s
  (`scheduleTrigger` 1.2, `executeCommand` 1, `s3` 1) were checked against current n8n
  documentation/community examples via web search from this sandbox, not confirmed against a live
  install — n8n itself doesn't exist yet in this environment (Oracle box not provisioned). Re-check
  each against Jonathan's actual n8n version once it's running; a version mismatch on `typeVersion`
  is the most likely import-time surprise.
- **The S3 node's custom-endpoint support for R2 is the single biggest unknown.** n8n's S3 node
  works against any S3-compatible endpoint in principle, but exactly where that endpoint URL gets
  configured (a field on the node vs. a field on the credential) wasn't confirmed. If the credential
  UI doesn't expose it, the fallback is a raw HTTP Request node doing an AWS SigV4-signed `PUT`
  against `https://<account_id>.r2.cloudflarestorage.com/orbit-backups/<key>` — more work, but
  guaranteed to work against any S3-compatible target.
- **Only the scraper's Postgres DB is dumped.** n8n defaults to SQLite unless explicitly configured
  otherwise; Twenty CRM stays cloud-hosted (not self-hosted, no local DB to dump) until Phase 7. If
  either of those assumptions is wrong by the time this actually runs, add another
  `pg_dump`/`upload` node pair rather than assuming this covers "all Postgres DBs" as the roadmap
  phrases it.
- **DB user/name are named placeholders** (`PLACEHOLDER_SCRAPER_DB_USER`,
  `PLACEHOLDER_SCRAPER_DB_NAME`) — fill in once the scraper's actual Postgres setup exists
  (`04 - Scraper Deployment Scaffold`, a separate in-progress piece not built in this repo).
