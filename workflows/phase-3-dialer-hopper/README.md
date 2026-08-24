# Phase 3 — Dialer Hopper/Queue Logic (partial)

Two of Phase 3's four catalog entries scaffolded this pass. Unlike W3.1/W3.2 (the hopper itself,
still blocked on the scraper's own output schema — a real external dependency, not a decision this
repo can make alone), W3.3 and W3.4 turned out to be unusually well-specified in `05 - Exhaustive
Workflow & Automation Library` §4 — specific numbers and a strict output contract, not open design
questions — so there was no reason to leave them as prose only.

## W3.4 — `post-call-synthesis.workflow.json`

Calls Claude with the brief's own exact 4-key contract (Disposition, Summary, Try-Back Time, DM
Presence) enforced via Anthropic's Structured Outputs (`output_config.format`, a `json_schema` type)
— not parsed out of free text, and not the deprecated `output_format` parameter some older examples
still show. `cache_control` on the static system instructions, per the brief's prompt-caching rule;
the per-call transcript is the only thing that varies per request.

**Worth reconsidering:** this uses `claude-opus-5` to stay consistent with every other Claude call in
this repo, but post-call synthesis runs on every single call rather than once per lead the way Deep
Dive Research or the KB generator do — a lighter/faster model might make more sense here given the
volume difference. Not changed unilaterally; flagging it as a real tradeoff worth a decision.

## W3.3 — `attempt-recycling-matrix.workflow.json`

The one workflow in this entire library with real business logic hard-coded rather than a
placeholder — because the brief gives the actual numbers: 6 attempts on no-answer, 4 on busy, 8 on
gatekeeper-only, a hard stop on opt-out, and 4-wave recycling with a 90-120 day gap between waves.
Meant to be called right after W3.4 produces a `Disposition`.

**Still not wired to anything live**, despite the logic itself being real: nothing in this repo
tracks `attemptCountThisWave`/`wave`/`lastAttemptDate` as actual state yet — that's the hopper's job
(W3.1/W3.2), and it isn't built. This workflow is correct decision logic waiting on a caller that has
real state to hand it, not blocked on a design question the way most of this library's
"documented only" entries are.

## Still documented-only

W3.1/W3.2 (the hopper/queue itself) — see `workflows/README.md`.
