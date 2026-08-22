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

## Status: Checkpoint 1 — KB parsing/template system

Working, tested, and checked in before moving to checkpoint 2 (GBP ingestion), per the staged
build-out this project asked for.

- `src/kb/atlasParser.ts` parses `kb-source/niche-atlas.md` (the master breadth map) into
  structured verticals + niches.
- `src/kb/kbDocParser.ts` parses a full generated KB document (a vertical base layer, or a
  finished single-business KB) into its mandatory `kb-template.md` §0–14 sections, and validates
  that the two non-negotiable sections (§5 Compliance, §9 Data schema) are present.
- `npm run kb:summary` prints a parsed summary of the atlas and both worked examples.
- `npm test` runs the parser against the real content in `kb-source/` (not fixtures) — 13 tests,
  all passing.

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

Per the staged build-out: GBP ingestion (pull hours/services from a real Google Business Profile
link) is next, followed by the website-scrape and manual-form fallback cascade, then Unified KB
assembly, then a first end-to-end demo.
