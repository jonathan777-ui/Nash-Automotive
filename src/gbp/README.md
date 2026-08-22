# GBP ingestion — input cascade step 1

Checkpoint 2 of the KB generator's staged build: "GBP ingestion working (pull hours/services
from a real GBP link)."

## What this does

Given a Google Business Profile / Maps URL, produces a `CompanyProfile` (`src/company/types.ts`)
— the same shape the website-scrape fallback (step 2) and manual form (step 3) will also produce,
so Enrichment (checkpoint 4) can consume any of the three without caring which cascade step ran.

## Design decision: Places API (New), not scraping Maps directly

The brief is explicit that the website-scrape fallback should "reuse the existing scraper
engine's patterns if useful — don't rebuild anti-ban/extraction logic from scratch." The same
logic applies here: scraping Google Maps/Search pages directly would mean rebuilding exactly the
anti-ban extraction work already scoped separately (`04 - Scraper Deployment Scaffold` —
`SCRAPER_SPEC.md`), just against a different Google surface. Google's Places API (New) is the
sanctioned, ToS-compliant way to pull a business's public details (hours, phone, website, rating,
category) given a Maps link — so that's what this uses, at the cost of needing a Google Cloud API
key (added to the Command Center's credential checklist as part of the `google-cloud` CLI-auth
row).

## Why there's a Text Search fallback instead of just Place Details

A Maps URL's embedded feature ID (the `0x...:0x...` pair you see in `!1s...` segments) is a
**different identifier** than the Places API's `place_id` (a `ChIJ...`-style opaque string).
Treating them as interchangeable would either fail outright or, worse, silently resolve to the
wrong business. Most GBP links people actually copy/paste don't carry a real `place_id` at all.

So `src/gbp/urlParser.ts` only extracts what's safe to read literally — a business name, map
coordinates, or (on the rarer URLs that do carry one) an explicit `place_id:` query value — and
`src/gbp/ingest.ts` uses whichever it finds: a direct Place Details lookup if there's a real
`place_id`, otherwise a Places API Text Search biased toward the URL's coordinates. This also
means only one API call is needed per ingestion in the common case, not a resolve-then-fetch pair.

## What's tested vs. what isn't

13 tests (`test/gbp/*.test.ts`) cover URL parsing across the shapes above, short-link redirect
following, and the mapping from a Places API response into `CompanyProfile` — all against mocked
`fetch` responses, all passing.

**Not verified: an actual live call to Places API (New).** The endpoint shapes and field names in
`src/gbp/placesClient.ts` are based on documented public knowledge of a stable, well-established
Google API, not freshly fetched or tested against a real key in this session — there's no Google
API key in this environment yet (it's part of the Command Center rollout you're doing separately).
Worth one real smoke test — a real GBP link through `ingestFromGbpUrl` with a live key — once that
key exists, before trusting this beyond the mocked tests. If field names have shifted or the Text
Search relevance for a given name/coordinate pair picks the wrong result, that's the first place
to look.

## Not yet handled

- Multiple plausible Text Search matches (e.g., two nearby businesses with similar names) — right
  now this silently takes the top result. Worth revisiting once real-world GBP links start
  surfacing ambiguous cases.
- Rate limiting / retry — Places API has its own quotas; no backoff logic here yet, unlike the
  separate scraper service which the brief explicitly calls out as needing it.
