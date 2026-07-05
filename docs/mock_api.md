# Mock API

This project exposes two lightweight JSON-backed APIs for Dify or backend workflow calls.

The APIs read the final local JSON files and return deterministic filtered results. They do not call Google Places, Routes, Weather, Dify, an LLM, a database, or any external service.

## Response Format

Success:

```json
{
  "ok": true,
  "count": 3,
  "data": []
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "..."
  }
}
```

## Hotel Search

Endpoint:

```text
POST /api/hotels/search
```

Optional request fields:

Hard filters:

- `budget.min`: number
- `budget.max`: number
- `areas`: string array, matched against hotel `area`
- `sub_areas`: string array, matched against hotel `sub_area`
- `guests`: positive integer, matched against `room_types[].max_guests`
- `availability_only`: boolean, matched against `availability.available`
- `parking_required`: boolean, matched against `parking.available`
- `free_cancellation_required`: boolean, matched against `cancellation.free_cancellation`
- `limit`: positive integer, default `5`, max `24`

Soft preferences:

- `preferred_areas`: string array, scored against hotel `area`
- `preferred_sub_areas`: string array, scored against hotel `sub_area`
- `trip_styles`: string array
- `target_users`: string array
- `tags`: string array

Example request:

```json
{
  "budget": {
    "min": 400,
    "max": 1200
  },
  "preferred_sub_areas": ["观澜湖"],
  "trip_styles": ["商务出差"],
  "target_users": ["商务旅客"],
  "tags": ["交通方便"],
  "limit": 5
}
```

Example response shape:

```json
{
  "ok": true,
  "count": 5,
  "total_candidates": 10,
  "applied_filters": {},
  "applied_preferences": {},
  "data": [
    {
      "hotel_id": "mock_hk_001",
      "name": "海口希尔顿酒店",
      "match_score": 5,
      "match_reasons": ["匹配旅行类型：商务出差"]
    }
  ]
}
```

`areas` and `sub_areas` are hard filters. `preferred_areas` and `preferred_sub_areas` only affect score and ordering; they do not remove hotels from the candidate set.

Hotel sorting is deterministic:

1. `match_score` descending
2. `review.score` descending
3. `mock_price_per_night` ascending
4. `hotel_id` ascending

`match_score` is a lightweight API helper only. Final recommendation should still combine RAG, LLM, Routes, Weather, and user context.

## Target Places Search

Endpoint:

```text
POST /api/places/search
```

Optional request fields:

- `place_ids`: string array, exact lookup by internal `place_id`
- `categories`: string array
- `areas`: string array
- `trip_styles`: string array
- `tags`: string array
- `route_priorities`: string array, values such as `high`, `medium`, `low`
- `limit`: positive integer, default `10`, max `24`

Exact ID example:

```json
{
  "place_ids": [
    "place_hak_airport",
    "place_hak_qilou",
    "place_hak_east_station"
  ]
}
```

Exact ID response includes missing IDs:

```json
{
  "ok": true,
  "count": 3,
  "missing_place_ids": [],
  "data": []
}
```

Filter example:

```json
{
  "categories": ["historical_site"],
  "tags": ["历史文化"],
  "limit": 10
}
```

When `place_ids` is provided, the API performs exact lookup, ignores duplicate IDs, preserves request order, and reports nonexistent IDs in `missing_place_ids`.

When `place_ids` is omitted, places are filtered by the requested fields and sorted by:

1. `route_priority`: `high` > `medium` > `low`
2. `name`
3. `place_id`

## Boundary

- Hotel and place facts come from `data/mock_hotels_haikou.json` and `data/haikou_target_places.json`.
- Place IDs and coordinates are pre-enriched offline.
- This API does not call Places API.
- This API does not call Routes API.
- This API does not call Weather API.
- This API does not decide the final recommendation.
