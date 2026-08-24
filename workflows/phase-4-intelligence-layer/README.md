# Phase 4 — Intelligence Layer (partial)

Two of Phase 4's seven catalog entries scaffolded this pass.

## W4.6 — `loss-reason-capture.workflow.json`

Fully specified by CRM Architecture §13's post-loss routing section (exact field values:
`restrictionReason` ∈ {DNC, Not Interested, Bad Information}, `postLossTrack` ∈ {Nurture,
Restricted}) — validates the incoming value against those exact sets before writing, since a typo'd
reason here would silently break `dnc-check.workflow.json`, which reads the same field.

**Assumption flagged:** triggered by an explicit call (a rep or a future rule marking an Opportunity
Lost), not by watching Twenty CRM for a generic "record updated, stage=Lost" event — the latter would
need Twenty CRM's own webhook/trigger configuration confirmed against a real instance, which isn't
available from this sandbox.

## W4.3 — `referral-trigger.workflow.json`

Structurally complete, but built against **two named-placeholder thresholds**
(`PLACEHOLDER_REFERRAL_TENURE_DAYS`, `PLACEHOLDER_REFERRAL_ENGAGEMENT_THRESHOLD`) rather than real
numbers — the brief says "tenure + engagement signal" but never gives the actual cutoffs, same
treatment as every other undecided-but-not-blocking value throughout this repo (Telnyx/Stripe
credentials, the alert channel routing rule). Set real values once decided; nothing else about this
workflow changes.

**Depends on `engagementScore` existing on the Opportunity**, which is W4.1's job (health/usage
scoring — not built, blocked on the scoring formula itself being undecided). Until W4.1 exists, this
workflow has nothing real to filter on even with the thresholds set — flagged in the node's own
`notes`, not just here.

Only auto-flags eligibility and alerts a rep (via the real `alert-dispatcher` webhook, W2.4) — per
the automation risk boundary, actually asking a client for a referral is an external send and stays
human-gated, so this workflow deliberately stops short of drafting or sending anything.

## Still documented-only

W4.1 (health scoring — formula undecided), W4.2 (depends on W4.1), W4.4 (AI employee — broad,
references an automation not present in this repo), W4.5 (Front Door Audit refresh — depends on that
service existing, not built), W4.7 (opening-line tracking — depends on Deep Dive Research's contract,
not built). See `workflows/README.md` for the full Phase 4 catalog including the Iridium
tier-protection policy note.
