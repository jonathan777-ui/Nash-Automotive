# Unified KB assembly — checkpoint 4

"Enrichment: combine whatever the cascade produces with the matching niche KB to populate the
Company Profile" → "a Unified KB powering three simultaneous surfaces — AI Voice Receptionist,
Chatbot preview, Website preview."

## Why this calls Claude, not just a template merge

**Correction (post-checkpoint-4):** an earlier version of this doc claimed only Law Firms had a
full base-layer KB written out. That was wrong — it was true of the initially-installed
`airlock-vertical-kb` skill package, but a fuller export of that skill's reference material (found
in the Airlock Drive folder, `AlyxirKB.zip`) has a complete base layer for **all 20 atlas
verticals**, plus one flagship niche overlay per vertical (20 of 120 named niches — not full
niche-level coverage). See `src/unifiedKb/kbLibrary.ts`.

So this still calls Claude for every generation — there's no vertical/niche combination with a
finished single-*business* KB sitting in `kb-source/` ready to serve as-is, only vertical- and
niche-*level* material that needs adapting to one specific company. But what Claude is given to
work from now varies by vertical:

- **Vertical has a pre-written base layer** (all 20 do): that base layer — not `law-firms.md`, not
  the raw atlas breadth-map entry — is handed to Claude as the authoritative source, with an
  instruction to adapt it to the specific business rather than generate from scratch. If the niche
  also has a pre-written overlay, that's layered on top with an explicit "may only tighten
  compliance, never loosen it" instruction, matching the same rule `kb-source/`'s own overlay files
  state for themselves.
- **Vertical has no pre-written base layer** (the 4 bench verticals — Funeral & Memorial, Moving &
  Storage, Education/Childcare, Logistics & Trucking — and any future vertical added to the atlas
  before its base layer is written): falls back to the original design, generating from the raw
  atlas breadth-map entry with `law-firms.md` as the "match this depth" exemplar per the skill's
  own instructions.

`kbLibrary.ts` holds the lookup: `VERTICAL_BASE_FILES` (vertical name → base-layer filename, all
20) and `NICHE_OVERLAY_FILES` (vertical → niche name → overlay filename, the 20 that exist so far),
both explicit tables rather than a slugify function — the file slugs don't mechanically derive from
the atlas names, and a wrong guess would silently fall back to full generation instead of using the
richer pre-written base. `loadKbGrounding(kbSourceDir, vertical, niche)` reads whatever actually
exists on disk and returns `{}` (not an error) when nothing does.

## How it's built

- `disclaimer.ts` — the fixed bilingual AI-demo disclaimer, deterministic and never
  model-generated, per the brief's standing policy ("injected at the Unified KB assembly step —
  not left to per-niche content"). Kept as a structured field on `UnifiedKb` rather than baked
  into the generated markdown, so nothing depends on the model reproducing exact wording.
- `renderVertical.ts` — turns a parsed `AtlasVertical` back into prompt text, scoped to just that
  vertical rather than sending the full 20-vertical atlas on every call.
- `kbLibrary.ts` — looks up whatever pre-written base layer / niche overlay exists for a given
  vertical + niche (see above).
- `promptBuilder.ts` — two `cache_control: {ephemeral}` breakpoints: one covering everything
  static regardless of vertical (the template structure, shared compliance/dialect layers, and
  `law-firms.md` as the universal fallback "match this depth" exemplar), one covering the
  vertical-specific content — either the pre-written base layer (+ overlay) from `kbLibrary.ts`, or
  the raw atlas entry when no base layer exists yet. Company-specific facts live only in the user
  message, after both breakpoints, so they never invalidate the cached prefix — this is what the
  brief means by "prompt caching is required, not optional... build it in from the start."
- `generateKb.ts` — calls Claude (`claude-opus-5`, adaptive thinking, high effort — per the
  Claude API skill's current defaults, not the possibly-stale ones in training data), passing
  `deps.grounding` through into `buildSystemBlocks`, then **reuses checkpoint 1's `parseKbDoc` /
  `validateKbDoc`** to check what came back actually has all 15 required sections before accepting
  it. A generated KB missing §5 (Compliance) or §9 (Data schema) is rejected outright rather than
  handed back — this is compliance-sensitive content, so "the API returned 200" isn't treated as
  "the KB is valid."
- `assemble.ts` — ties generation + disclaimer injection together into one `UnifiedKb`. Doesn't
  call `loadKbGrounding` itself — like `staticContext`, the caller precomputes `grounding` and
  passes it in via `deps`, keeping `assemble.ts`/`generateKb.ts` free of filesystem reads outside
  the one Anthropic API call.

## What's tested vs. what isn't

27 tests, all against a mocked Anthropic client (using the real `law-firms.md` content as the
"successful generation" fixture, so the validation-acceptance path is exercised against real
content, not an invented stub). Covers: prompt structure and cache placement, the grounding-aware
vs. atlas-only prompt branches, multi-block responses (e.g. a thinking block alongside the text
block), refusal handling, API-error handling, rejection of a generated KB missing required
sections, and `kbLibrary.ts`'s lookup against the real `kb-source/verticals/` files on disk
(every mapped base-layer and overlay file is checked to actually exist and load).

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
