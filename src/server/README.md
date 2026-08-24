# Demo generator HTTP service — checkpoint 5

"A first full demo generated end to end." Per the brief's architecture decision, this is a
standalone Node/TS app called via HTTP/webhook from n8n — not n8n workflow JSON + Code nodes.
n8n handles trigger timing and Demo Dashboard/CRM updates on the result; this process only does
generation.

## How it's built

- `generateDemo.ts` — the actual orchestration, transport-agnostic: validates the vertical/niche
  against the real parsed atlas (checkpoint 1), runs the input cascade (checkpoint 3), loads
  whatever pre-written base-layer/overlay grounding exists (checkpoint 4's correction), and calls
  `assembleUnifiedKb` (checkpoint 4). Returns a tagged result (`stage: 'validation' | 'cascade' |
  'generation'`) so a caller — an HTTP adapter, a test, or eventually an n8n error-handling branch —
  can react differently to "bad request" vs. "couldn't find this business" vs. "Claude rejected the
  generation," rather than one flat error string.
- `handleGenerateDemo.ts` — the HTTP-shape seam: validates the raw request body's shape, calls
  `generateDemo`, and maps its tagged result to a status code (400 validation, 422 cascade failure,
  502 generation failure, 200 success). Kept separate from `index.ts` so the mapping itself is
  tested without needing a real `node:http` server (see `test/server/`).
- `index.ts` — the actual `node:http` server. `POST /generate-demo`, `GET /health` (reports
  whether the real API keys are configured or still the named placeholder — see below). Loads the
  atlas and static KB context once at startup, not per-request, since neither changes between
  calls. Deliberately no framework dependency (Express/Fastify/etc.) — the request/response shape
  here is small enough that Node's built-in `http` module covers it without adding a dependency
  the brief never asked for.

## Request/response contract

```
POST /generate-demo
{
  "vertical": "Automotive",           // must match a real niche-atlas.md vertical
  "niche": "Auto repair / mechanic",  // must match a real niche under that vertical
  "gbpUrl": "...",                    // cascade step 1 (optional)
  "websiteUrl": "...",                // cascade step 2 (optional)
  "manualForm": {                     // cascade step 3 (optional)
    "companyName": "...", "city": "...", "state": "..."
  }
}
```

At least one of `gbpUrl` / `websiteUrl` / `manualForm` is required — same priority order as the
input cascade (checkpoint 3). On success: `200 {ok: true, unifiedKb: UnifiedKb, stepUsed: ...}`.

## Environment variables

- `CLAUDE_API_KEY` — same name as the Command Center wizard's Secrets Store key for this vendor
  (`command-center/src/vendors.ts`), so a deploy that wires the wizard's output straight into this
  process's environment needs no renaming.
- `GOOGLE_PLACES_API_KEY` — **no Secrets Store entry exists for this yet.** The Command Center's
  `google-cloud` vendor row covers `gcloud auth application-default login` only, not minting or
  storing this specific restricted Places API key. Worth adding an explicit field for it (or
  scripting the `gcloud services api-keys create` step) once this service actually gets deployed
  alongside the Command Center.
- `KB_SOURCE_DIR` — defaults to the repo's `kb-source/`.
- `PORT` — defaults to `8787`.

Neither key crashes the process if missing — per the brief's placeholder-strategy rule ("nothing
should fail silently or produce a misleading working result"), the server still starts and
`/health` reports which keys are still the named placeholder (`PLACEHOLDER_CLAUDE_API_KEY` /
`PLACEHOLDER_GOOGLE_PLACES_API_KEY`), and `/generate-demo` returns a clear `503` naming exactly
what's missing rather than attempting a call that would fail deep inside the cascade or the
Anthropic client with a much less obvious error.

## Running it

```
npm run serve
```

Smoke-tested manually against a placeholder-keys boot (`/health` and the `503` path both verified
working over real HTTP, not just the pure-function tests) — **not yet verified against the live
Anthropic or Places APIs**, for the same reason as checkpoints 2 and 4: no usable API key exists in
this environment. Once the Command Center wizard has written real keys, the concrete things worth
checking: a real GBP-link request end to end, a real generation for at least one bench vertical
(atlas-only path) and one vertical with a pre-written base layer (grounded path), and confirming
`usage.cache_read_input_tokens` shows non-zero on a second request for the same vertical.

## What's tested vs. what isn't

13 tests (`test/server/`) against a mocked Anthropic client, covering: vertical/niche validation,
missing-input validation, the manual-form path through to a real generated `UnifiedKb` (using real
`kb-source/` grounding, not a stub), cascade-failure propagation, generation-failure propagation,
and the HTTP status-code mapping for each failure stage. `index.ts` itself (the real `node:http`
wiring) has no automated test — it was manually smoke-tested (`/health`, the `503` placeholder-key
path, and a `404`) rather than covered by an automated HTTP-level test, since `handleGenerateDemo.ts`
already carries the logic worth unit-testing and stands up a real listener just to re-test the same
status-code mapping would be low-value duplication.

## Not yet handled

- No auth/rate-limiting on this endpoint — it's meant to be called from n8n on the same private
  network (Oracle box), not exposed publicly. Worth reconsidering if that assumption changes.
- No retry/backoff on a transient Claude API error — a `502` surfaces immediately; n8n's own retry
  policy on the HTTP Request node calling this endpoint is expected to handle that, not this
  service itself.
