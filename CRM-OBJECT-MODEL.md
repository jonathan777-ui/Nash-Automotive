# CRM object model (v4) — canonical reference

Every piece in this repo that reads or writes Twenty CRM objects points back to this file instead
of re-deriving the hierarchy independently. Source: `05 - Exhaustive Workflow & Automation Library`
§13/§15 and `06 - Recent Changes Summary`, both FINAL v4, both LOCKED per Jonathan.

**Twenty CRM doesn't exist as a live instance in this environment.** Every field name and REST
endpoint pattern below is this repo's own consistent, documented assumption — not a verified match
against a real instance, same caveat every Twenty CRM touchpoint in this repo has carried since
checkpoint 4 of the KB generator. Confirm against reality once an instance exists; until then, every
workflow/function referencing these objects is built to fail clearly rather than silently on a
mismatch.

## Hierarchy

```
Lead (unqualified default state — every inbound record starts here)
  -> Opportunity (earned: magic-link click, inbound request, or rep-qualification)
       -> spans one or more Locations directly
Location (single physical site, GBP-driven)
  -> demos and Front Door Audits attach HERE, not on Opportunity or Company
  -> belongs to at most one Company (set once Won; null before)
Company (commercial entity)
  -> Contracts attach here
  -> can hold multiple Locations
  -> optionally belongs to one Organization
Organization (OPTIONAL — multi-company portfolios only)
Contract (Company level)
  -> mirrors the winning Opportunity's Location set
  -> BillingPeriod (monthly, one per Contract per cycle)
Services (child of Opportunity/Contract — one line item per service, own status card)
```

**The load-bearing distinction:** Opportunity is a *pre-sale funnel object*. Once a deal is Won, the
Contract (Company-level) is the object that actually represents the ongoing client relationship —
Opportunity doesn't disappear (it's the historical deal record), but nothing post-sale should keep
reading/writing it as if it were still the live source of truth. Getting this wrong was the concrete
bug in the previous pass: W4.3 (referral trigger) queried Opportunities filtered to a "Live Client"
stage — Live Client is a post-sale state, so it should have been querying Companies with an active
Contract all along.

## Objects

### Location
Single physical site, GBP-driven. Demos and Front Door Audits are inherently per-site, so they
attach here — not on the Opportunity that may span several Locations, and not on the Company that
may hold Locations under completely different Contracts.

- Fields: `id`, `name`, `gbpUrl`, `address`, `opportunityId` (which Opportunity brought it in),
  `companyId` (nullable — set on Won), `contractStatus` (`None` / `ActiveM2M` / `ActiveTerm`),
  `contractExpiresAt` (nullable), `frontDoorAuditStatus`, `frontDoorAuditScore`,
  `frontDoorAuditReportUrl`, `dueDiligenceReportUrl`, `demoStatus`, `demoStepUsed`.
- Assumed REST: `GET/POST/PATCH /rest/locations`, `/rest/locations/{id}`.
- **Location Contract Lock**: `contractStatus` is the field every lock check reads. A NEW
  Contract-generation attempt on a Location that's already `ActiveM2M`/`ActiveTerm` from an
  *unrelated* Opportunity blocks and routes to human review. A change from the *same* Company
  already holding that Contract is a Contract Amendment (supersede, not block) — see Contract below.
  Both concepts are named in `06`/`05 §13`; only the *field* they key off is built this pass — the
  actual lock-enforcement workflow (blocking a new Opportunity) and the Amendment workflow
  (superseding an existing Contract) are Step 2/3 work, not built yet. This pass makes sure
  `contractStatus` gets set correctly by the Won-conversion workflow (W1.6) so those can be built
  against real data later, not guessed at.

### Company
The commercial entity. Contracts attach here. Every post-sale automation (health/usage scoring,
tier-upgrade signal, referral trigger, churn, Front Door Audit refresh) operates on Company, not
Opportunity — see the load-bearing distinction above.

- Fields: `id`, `name`, `organizationId` (nullable).
- Assumed REST: `/rest/companies`, `/rest/companies/{id}`.

### Organization
Optional, multi-company portfolios only. Not touched by anything built so far — no workflow in this
repo creates or reads one yet, since nothing here handles multi-company clients.

- Fields: `id`, `name`.
- Assumed REST: `/rest/organizations`, `/rest/organizations/{id}`.

### Contract
Company-level. Mirrors the winning Opportunity's Location set at the moment of Won.

- Fields: `id`, `companyId`, `locationIds` (array), `status` (`Active` / `Superseded`),
  `totalValue`, `agreementValue`, `tier`, `startedAt`, `stripeSubscriptionOrPaymentId`,
  `supersededByContractId` (nullable — set on the OLD contract when an Amendment creates a new one).
- Assumed REST: `/rest/contracts`, `/rest/contracts/{id}`.
- Created by W1.6 (Stripe payment success) this pass — see `workflows/phase-1-mvp/README.md`. The
  full Contract Amendment Flow (supersede + Accounting Audit Event + Deal stage → "Expansion") is
  **not built this pass** — Step 2/3 work per the agreed sequencing, not blocking the migration.

### BillingPeriod (Billing/Accounting Period)
New in v4 (`05 §15`). One record per Contract per monthly billing cycle — auto-generated for both
M2M and Term contracts, since commission/COGS get calculated monthly regardless of contract length.

- Fields: `id`, `contractId`, `periodStart`, `periodEnd`, `revenueCents` (Stripe-linked),
  `cogsBreakdown` (voice minutes / STT / TTS / API costs), `commissionOwedCents`, `commissionStatus`
  (`accrued` / `approved` / `paid` / `clawback`), `repId`.
- Assumed REST: `/rest/billingPeriods`, `/rest/billingPeriods/{id}`.
- W1.6 creates the *first* period on Won this pass. The recurring monthly generation (and the
  "Contract Amendment closes the current period, starts a new one" rule) is Step 2/3 work — this
  pass only makes sure period #1 exists so nothing downstream has to special-case "no billing period
  yet" the moment a client goes live.

## What anchors where — the actual per-workflow decisions this pass made

| Concern | Anchor | Why |
|---|---|---|
| Lead intake, Deep Dive Research | Opportunity | Business-identity-level, not site-level — an Opportunity may not even have resolved its Location(s) yet at intake time. |
| Front Door Audit, demo generation/content | Location | Both are inherently per-GBP/per-site. |
| Demo Dashboard stage (Demo Queue → ... → Won) | Opportunity | The deal being pursued — stays the funnel object through the whole pre-sale flow. |
| e-sign, loss-reason/DNC/post-loss routing | Opportunity | Pre-sale events on the deal itself. |
| Stripe payment success → Contract creation | Company (creates it), Location (sets contractStatus), Opportunity (advances to Won) | This is where the funnel object hands off to the client-relationship object — see W1.6. |
| Referral trigger, health/usage scoring, tier upgrade, churn | Company | Post-sale — see the load-bearing distinction above. |
| Call disposition/post-call synthesis | Opportunity | The call is about advancing a specific deal, pre- or post- doesn't change who's being called. |

Every row above is implemented in the corresponding workflow this pass, with the reasoning repeated
in that workflow's own `notes` field — see `workflows/README.md` and each phase folder's README for
the full list of what changed.
