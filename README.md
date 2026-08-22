# Orbit AI — Lead-to-Onboarding Pipeline (this repo)

This repo holds two independently-deployable pieces of Orbit AI's lead-to-onboarding system, per
the project brief's build order:

- **`command-center/`** — Piece 1 (build first): the persistent Operations Command Center,
  starting with a Cloudflare-Access-gated credential wizard. Nothing downstream can proceed
  without credentials being gathered somewhere, so this comes before everything else. See
  `command-center/README.md`.
- **`kb-source/` + `src/kb/`** (this file, below) — Piece 3: the KB-powered demo generator. A
  prospect's Google Business Profile (or a scraped website, or a manual City/State/niche form)
  gets combined with the matching niche KB to produce a Unified KB that powers three demo surfaces
  at once — AI Voice Receptionist, Chatbot preview, Website preview.

Piece 2 (the rest of the Command Center — pipeline visibility, system health) is lower priority
and grows incrementally after Piece 1 ships; not started.

## Piece 3: KB-powered demo generator

## Status: Checkpoint 2 — GBP ingestion

Checkpoint 1 (KB parsing) and checkpoint 2 (GBP ingestion) are both done; checkpoint 3 (the
website-scrape + manual-form fallback cascade) is next.

**Checkpoint 1 — KB parsing/template system:**
- `src/kb/atlasParser.ts` parses `kb-source/niche-atlas.md` (the master breadth map) into
  structured verticals + niches.
- `src/kb/kbDocParser.ts` parses a full generated KB document (a vertical base layer, or a
  finished single-business KB) into its mandatory `kb-template.md` §0–14 sections, and validates
  that the two non-negotiable sections (§5 Compliance, §9 Data schema) are present.
- `npm run kb:summary` prints a parsed summary of the atlas and both worked examples.

**Checkpoint 2 — GBP ingestion** (input cascade step 1: "Google Business Profile link → pull
hours, services, etc. directly"):
- `src/gbp/` resolves a Google Business Profile / Maps URL (including `maps.app.goo.gl` short
  links) into a `CompanyProfile` (`src/company/types.ts`) via Google's Places API (New) — not by
  scraping Maps directly, to avoid duplicating the anti-ban extraction work already scoped
  separately to `04 - Scraper Deployment Scaffold`. See `src/gbp/README.md` for why it falls back
  to a Text Search rather than assuming every Maps URL carries a usable Places `place_id` (most
  don't — a Maps URL's embedded feature ID is a different identifier entirely).
- **Not verified against the live Places API** — there's no Google API key in this environment
  yet. Tested against mocked HTTP responses only (13 tests, all passing); a real smoke test is
  needed once a Places API key exists via the Command Center rollout. Full caveat in
  `src/gbp/README.md`.

`npm test` runs both checkpoints' parsers against real content (`kb-source/`) and mocked GBP
responses — 26 tests, all passing.

Run it:

```
npm install
npm test
npm run kb:summary
```

## `kb-source/` — pulled from the Airlock Google Drive folder

- `niche-atlas.md` — 20 verticals, 120 named niches, each with positioning/register/compliance/
  niche-level intent+intake+urgency, and emergency/handoff triggers.
- `kb-template.md`, `compliance-patterns.md`, `language-dialect-layer.md` — the shared layers every
  KB inherits (never duplicated per niche).
- `verticals/law-firms.md` — the shared **base layer** worked example (practice-area overlays
  stack on top of this).
- `verticals/automotive__performance-tuning__track-dog-racing.md` — a finished **single-business**
  KB (Automotive → Performance/Tuning, for Track Dog Racing), showing the other end of the pattern.

**Non-negotiable rule enforced by this parser's validation, not just documentation:** niche
overlays may only *tighten* compliance from the base layer, never loosen it. `validateKbDoc`
currently checks that §5 and §9 exist; it does not yet diff an overlay's compliance text against
its base layer to catch an accidental loosening — that's a natural extension once overlay
generation (checkpoint 5 of the KB system, not this pipeline's checkpoint list) is in scope.

## Known gap: "318 niches / 38 verticals" vs. what's actually defined

The project brief describes the target scale as 318 niches across 38 verticals. What's actually in
the atlas today is **120 real niches across 20 verticals**, plus 4 "bench" verticals (Funeral &
Memorial, Moving & Storage, Education/Childcare, Logistics & Trucking) named in the atlas footer
but without their own sections yet. A separate Drive tracking sheet (`orbit-kb-niche-tracker`) has
318 rows, but 198 of them are literal placeholders ("New niche 1 (define)") padding each vertical
to a fixed slot count — not real content.

This doesn't block the generator: niches are data, not code, so the parser and downstream pipeline
work against however many verticals/niches actually exist in `niche-atlas.md` and grow
automatically as more are named. It's flagged here so it isn't silently mistaken for 318 finished
niches when someone next looks at this repo.

## Next checkpoint

Per the staged build-out: the website-scrape + manual-form fallback cascade (checkpoint 3) is
next, followed by Unified KB assembly (checkpoint 4), then a first end-to-end demo (checkpoint 5).
The website-scrape step should coordinate with (not duplicate) the scraper being built per
`04 - Scraper Deployment Scaffold` / `SCRAPER_SPEC.md`.
