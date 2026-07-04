# Places Data Enrichment

This folder contains offline data-preparation tools for the Haikou stay agent dataset.

The tools use Google Places API (New) to validate hotel and target-place entities, disambiguate candidates, and enrich the final JSON records with:

- `google_place_id`
- `location.latitude`
- `location.longitude`

## Runtime Boundary

This is not runtime code.

The enrichment flow is:

Places API -> offline data-preparation script -> validated JSON data -> Mock Hotel API -> backend/Dify logic -> Routes/Weather runtime APIs -> final LLM/front end.

The scripts in this folder must not be imported by:

- Vercel Functions
- Next.js pages or app routes
- front-end code
- Mock API request handlers
- build scripts

The Mock Hotel API should only consume the already processed JSON files.

## Secret Handling

The API key is read only from:

```bash
GOOGLE_MAPS_API_KEY
```

Do not write the key into source files, JSON, Markdown, logs, `.env` files committed to Git, or command output.

## Usage

Dry run, no JSON writes:

```bash
python3 scripts/data_prep/enrich_places_data.py --dry-run
```

Apply confirmed matches to JSON:

```bash
python3 scripts/data_prep/enrich_places_data.py --apply
```

Both modes call Places API sequentially with a small delay between entities. `--apply` creates a local backup under `backups/` before changing data files.

Second-pass review for first-pass ambiguous records:

```bash
python3 scripts/data_prep/review_places_second_pass.py --dry-run
python3 scripts/data_prep/review_places_second_pass.py --apply
```

The second pass reads `reports/places_validation_report.md`, classifies ambiguous records by failure reason, generates reason-specific query variants, aggregates candidates by Place ID across multiple Text Search calls, and writes only high-confidence review matches. It does not relax the strict first-pass matcher.

## Match Status

- `matched`: a candidate passed name, city, address/type, and separation checks; the script may write Place ID and coordinates.
- `ambiguous`: candidates exist but evidence is insufficient or conflicting; JSON remains empty for Places fields.
- `unmatched`: Places returned no candidate; JSON remains empty for Places fields.
- `error`: a request failed after retry; JSON remains empty for Places fields.

The matching rules are implemented in `places_matcher.py`. Thresholds and scoring weights are centralized there.

Second-pass review rules are implemented in `places_reviewer.py`. They add query-variant generation, multi-query consistency scoring, reason-specific acceptance rules, and protection against reusing a Place ID already assigned by the first pass.
