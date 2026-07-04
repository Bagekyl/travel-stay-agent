# Haikou Stay Agent

Structured data and RAG knowledge base for a Haikou hotel-stay decision agent.

The project keeps the data responsibilities separate:

- `data/mock_hotels_haikou.json` stores the Mock Hotel API hotel records and mock commercial fields.
- `data/haikou_target_places.json` stores key target places used for accommodation decisions.
- `knowledge_base/` stores rule-oriented RAG material about how to judge tradeoffs.
- `scripts/validate_data.py` validates the JSON data.

Hotel and target-place records use a unified Places enrichment boundary. Google Places API (New) is used offline during data preparation to validate entities and fill stable `google_place_id` and coordinate fields. The runtime Mock Hotel API does not call Places API.

Routes API and weather APIs are later runtime sources for live route time, distance, and weather-sensitive decisions. Those dynamic facts are not hard-coded into the RAG files.

For the offline Places enrichment workflow, see `scripts/data_prep/README.md`.
