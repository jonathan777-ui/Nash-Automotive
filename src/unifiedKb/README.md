# Unified KB assembly — checkpoint 4

"Enrichment: combine whatever the cascade produces with the matching niche KB to populate the
Company Profile" → "a Unified KB powering three simultaneous surfaces — AI Voice Receptionist,
Chatbot preview, Website preview."

## Why this calls Claude, not just a template merge

Only Law Firms has a full base-layer KB actually written out (`kb-source/verticals/law-firms.md`)
— the other 19 verticals in `niche-atlas.md` have breadth-map entries (positioning, register,
compliance flags, niche list) but not the full bilingual §0–14 document the template requires.
The atlas's own closing line says as much: "Expand any niche into a full Law-base-depth KB via
the generator." So assembly for any vertical besides Law Firms means generating that KB, not
merging pre-written pieces — this is the same job the `airlock-vertical-kb` skill does, made
callable from code instead of run by hand.

## How it's built

- `disclaimer.ts` — the fixed bilingual AI-demo disclaimer, deterministic and never
  model-generated, per the brief's standing policy ("injected at the Unified KB assembly step —
  not left to per-niche content"). Kept as a structured field on `UnifiedKb` rather than baked
  into the generated markdown, so nothing depends on the model reproducing exact wording.
- `renderVertical.ts` — turns a parsed `AtlasVertical` back into prompt text, scoped to just that
  vertical rather than sending the full 20-vertical atlas on every call.
- `promptBuilder.ts` — two `cache_control: {ephemeral}` breakpoints: one covering everything
  static regardless of vertical (the template structure, shared compliance/dialect layers, and
  `law-firms.md` as the explicit "match this depth" exemplar per the skill's own instructions),
  one covering the vertical-specific atlas entry. Company-specific facts live only in the user
  message, after both breakpoints, so they never invalidate the cached prefix — this is what the
  brief means by "prompt caching is required, not optional... build it in from the start."
- `generateKb.ts` — calls Claude (`claude-opus-5`, adaptive thinking, high effort — per the
  Claude API skill's current defaults, not the possibly-stale ones in training data), then
  **reuses checkpoint 1's `parseKbDoc` / `validateKbDoc`** to check what came back actually has
  all 15 required sections before accepting it. A generated KB missing §5 (Compliance) or §9
  (Data schema) is rejected outright rather than handed back — this is compliance-sensitive
  content, so "the API returned 200" isn't treated as "the KB is valid."
- `assemble.ts` — ties generation + disclaimer injection together into one `UnifiedKb`.

## What's tested vs. what isn't

18 tests, all against a mocked Anthropic client (using the real `law-firms.md` content as the
"successful generation" fixture, so the validation-acceptance path is exercised against real
content, not an invented stub). Covers: prompt structure and cache placement, multi-block
responses (e.g. a thinking block alongside the text block), refusal handling, API-error handling,
and rejection of a generated KB missing required sections.

**Not verified against the live Claude API.** There's no Anthropic API key usable from this
environment — this session's own Claude access isn't exposed as an API key to code it runs, and
none has been provisioned yet via the Command Center (that's the `CLAUDE_API_KEY` row in its
vendor checklist). Once one exists, the real things worth checking: does the model actually
respect the "don't write the disclaimer yourself" instruction, does output consistently land under
the 16,000-token `max_tokens` ceiling for a full bilingual 15-section KB (the two existing worked
examples are ~5-6K tokens each, so there's headroom, but worth confirming on a generated one), and
does `usage.cache_read_input_tokens` actually show non-zero on the second call for the same
vertical (confirms caching is working, not just configured).

## Not yet handled

- No retry on a rejected generation (missing sections) — right now it just fails; worth deciding
  whether to auto-retry once with a corrective follow-up message before surfacing the failure.
- Single-shot generation only — no support yet for regenerating just one section if only that
  part needs a fix, which will matter once this is driven by a human reviewing output rather than
  purely automated.
