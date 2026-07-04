#!/usr/bin/env python3
"""Validate Haikou hotel and target-place data."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
HOTELS_PATH = ROOT / "data" / "mock_hotels_haikou.json"
PLACES_PATH = ROOT / "data" / "haikou_target_places.json"

HOTEL_TAGS = {
    "交通方便",
    "近机场",
    "近铁路",
    "近港口",
    "近海边",
    "城市便利",
    "商务友好",
    "适合情侣",
    "适合亲子",
    "适合中转",
    "适合短途",
    "适合自驾",
    "适合纯度假",
    "预算友好",
    "设施丰富",
    "安静",
    "购物方便",
    "美食方便",
    "会展便利",
}

PLACE_TAGS = {
    "高铁",
    "机场",
    "中转",
    "早班车",
    "轮渡",
    "自驾",
    "美食",
    "历史文化",
    "城市漫游",
    "拍照",
    "海边",
    "日落",
    "公园",
    "轻松散步",
    "购物",
    "免税",
    "商务",
    "会展",
    "亲子",
    "自然",
    "博物馆",
    "访校",
    "学生",
    "度假",
    "温泉",
    "高尔夫",
}

PLACE_CATEGORIES = {
    "airport",
    "railway_hub",
    "port",
    "historical_site",
    "museum",
    "urban_landmark",
    "seaside",
    "park",
    "commercial_district",
    "shopping",
    "convention",
    "campus",
    "resort",
    "nature",
    "family_attraction",
}

WEATHER_LEVELS = {"low", "medium", "high"}
ROUTE_PRIORITIES = {"low", "medium", "high"}
REQUIRED_MOCK_FIELDS = {
    "mock_price_per_night",
    "price_range_cny",
    "breakfast",
    "cancellation",
    "availability",
}

HAIKOU_BOUNDS = {
    "min_latitude": 18.0,
    "max_latitude": 20.6,
    "min_longitude": 108.5,
    "max_longitude": 111.5,
}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def schema_shape(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: schema_shape(child) for key, child in value.items()}
    if isinstance(value, list):
        if not value:
            return []
        return [schema_shape(value[0])]
    return "scalar"


def price_band(price: float) -> str:
    if 180 <= price < 400:
        return "180-400"
    if 400 <= price < 800:
        return "400-800"
    if 800 <= price <= 1500:
        return "800-1500"
    if price > 1500:
        return "1500+"
    return "other"


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_places_fields(entity: dict[str, Any], prefix: str, errors: list[str]) -> None:
    place_id = entity.get("google_place_id")
    location = entity.get("location", {})
    latitude = location.get("latitude")
    longitude = location.get("longitude")

    require(isinstance(place_id, str), prefix + "google_place_id must be a string", errors)
    require(isinstance(location, dict), prefix + "location must be an object", errors)
    require(set(location.keys()) == {"latitude", "longitude"}, prefix + "location must contain latitude and longitude only", errors)

    if place_id:
        require(is_number(latitude), prefix + "latitude must be numeric when google_place_id is populated", errors)
        require(is_number(longitude), prefix + "longitude must be numeric when google_place_id is populated", errors)
        if is_number(latitude) and is_number(longitude):
            require(latitude != 0 and longitude != 0, prefix + "coordinates must not use 0 as a missing value", errors)
            require(
                HAIKOU_BOUNDS["min_latitude"] <= latitude <= HAIKOU_BOUNDS["max_latitude"],
                prefix + f"latitude {latitude} is outside the broad Haikou/Hainan bounds",
                errors,
            )
            require(
                HAIKOU_BOUNDS["min_longitude"] <= longitude <= HAIKOU_BOUNDS["max_longitude"],
                prefix + f"longitude {longitude} is outside the broad Haikou/Hainan bounds",
                errors,
            )
    else:
        require(latitude is None, prefix + "latitude must be null when google_place_id is empty", errors)
        require(longitude is None, prefix + "longitude must be null when google_place_id is empty", errors)


def validate_hotels(hotels: Any, errors: list[str]) -> None:
    require(isinstance(hotels, list), "Hotel JSON must be a list", errors)
    if not isinstance(hotels, list):
        return
    require(len(hotels) == 24, f"Hotel count must be 24, got {len(hotels)}", errors)

    ids = [h.get("hotel_id") for h in hotels if isinstance(h, dict)]
    require(len(ids) == len(set(ids)), "hotel_id values must be unique", errors)

    expected_keys = tuple(hotels[0].keys()) if hotels else ()
    expected_shape = schema_shape(hotels[0]) if hotels else None

    for index, hotel in enumerate(hotels, 1):
        prefix = f"hotel[{index}] {hotel.get('hotel_id', '<missing>')}: "
        require(tuple(hotel.keys()) == expected_keys, prefix + "top-level schema differs", errors)
        require(schema_shape(hotel) == expected_shape, prefix + "nested schema differs", errors)
        require(hotel.get("city") == "海口", prefix + "city must be 海口", errors)
        require(hotel.get("currency") == "CNY", prefix + "currency must be CNY", errors)
        require(bool(hotel.get("places_query")), prefix + "places_query must be non-empty", errors)
        validate_places_fields(hotel, prefix, errors)
        require(isinstance(hotel.get("mock_price_per_night"), (int, float)), prefix + "mock_price_per_night must be numeric", errors)
        require(bool(hotel.get("room_types")), prefix + "room_types must be non-empty", errors)
        for room_index, room in enumerate(hotel.get("room_types", []), 1):
            require(isinstance(room.get("max_guests"), (int, float)), prefix + f"room_types[{room_index}].max_guests must be numeric", errors)
        bad_tags = set(hotel.get("tags", [])) - HOTEL_TAGS
        require(not bad_tags, prefix + f"unknown hotel tags: {sorted(bad_tags)}", errors)
        mock_fields = set(hotel.get("mock_fields", []))
        require(REQUIRED_MOCK_FIELDS <= mock_fields, prefix + f"mock_fields missing {sorted(REQUIRED_MOCK_FIELDS - mock_fields)}", errors)

    distribution = Counter(price_band(h["mock_price_per_night"]) for h in hotels)
    require(distribution == {"180-400": 6, "400-800": 7, "800-1500": 6, "1500+": 5}, f"price distribution mismatch: {dict(distribution)}", errors)


def validate_places(places: Any, hotels: list[dict[str, Any]], errors: list[str]) -> None:
    require(isinstance(places, list), "Place JSON must be a list", errors)
    if not isinstance(places, list):
        return
    require(len(places) == 24, f"Place count must be 24, got {len(places)}", errors)

    ids = [p.get("place_id") for p in places if isinstance(p, dict)]
    require(len(ids) == len(set(ids)), "place_id values must be unique", errors)

    expected_keys = tuple(places[0].keys()) if places else ()
    expected_shape = schema_shape(places[0]) if places else None
    hotel_areas = {h["area"] for h in hotels} | {h["sub_area"] for h in hotels}

    for index, place in enumerate(places, 1):
        prefix = f"place[{index}] {place.get('place_id', '<missing>')}: "
        require(tuple(place.keys()) == expected_keys, prefix + "top-level schema differs", errors)
        require(schema_shape(place) == expected_shape, prefix + "nested schema differs", errors)
        require(place.get("city") == "海口", prefix + "city must be 海口", errors)
        require(place.get("category") in PLACE_CATEGORIES, prefix + f"invalid category {place.get('category')}", errors)
        require(bool(place.get("places_query")), prefix + "places_query must be non-empty", errors)
        validate_places_fields(place, prefix, errors)
        bad_tags = set(place.get("tags", [])) - PLACE_TAGS
        require(not bad_tags, prefix + f"unknown place tags: {sorted(bad_tags)}", errors)
        weather = place.get("weather_sensitivity", {})
        require(weather.get("level") in WEATHER_LEVELS, prefix + f"invalid weather level {weather.get('level')}", errors)
        require(place.get("route_priority") in ROUTE_PRIORITIES, prefix + f"invalid route_priority {place.get('route_priority')}", errors)
        unmatched = [area for area in place.get("preferred_hotel_areas", []) if area not in hotel_areas]
        require(not unmatched, prefix + f"preferred_hotel_areas unmatched: {unmatched}", errors)
        for field in ("suitable_for", "trip_styles", "travel_role", "hotel_decision_value", "preferred_hotel_areas"):
            require(bool(place.get(field)), prefix + f"{field} must be non-empty", errors)


def main() -> int:
    errors: list[str] = []
    hotels = load_json(HOTELS_PATH)
    places = load_json(PLACES_PATH)

    validate_hotels(hotels, errors)
    validate_places(places, hotels if isinstance(hotels, list) else [], errors)
    if isinstance(hotels, list) and isinstance(places, list):
        populated = [
            (item.get("google_place_id"), item.get("hotel_id") or item.get("place_id"))
            for item in hotels + places
            if item.get("google_place_id")
        ]
        duplicate_ids = [place_id for place_id, count in Counter(place_id for place_id, _ in populated).items() if count > 1]
        for duplicate_id in duplicate_ids:
            owners = [owner for place_id, owner in populated if place_id == duplicate_id]
            errors.append(f"google_place_id {duplicate_id} is used by multiple entities: {owners}")

    print("Haikou hotel/place data validation")
    print(f"- Hotels: {len(hotels) if isinstance(hotels, list) else 'invalid'}")
    print(f"- Places: {len(places) if isinstance(places, list) else 'invalid'}")
    if isinstance(hotels, list):
        print(f"- Price distribution: {dict(Counter(price_band(h['mock_price_per_night']) for h in hotels))}")
        print(f"- Hotel area distribution: {dict(Counter(h['area'] for h in hotels))}")
        print(f"- Hotel sub_area distribution: {dict(Counter(h['sub_area'] for h in hotels))}")
    if isinstance(hotels, list) and isinstance(places, list):
        populated_count = sum(1 for item in hotels + places if item.get("google_place_id"))
        print(f"- Populated Google Place IDs: {populated_count}")

    if errors:
        print("\nFAILED")
        for error in errors:
            print(f"- {error}")
        return 1

    print("\nPASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
