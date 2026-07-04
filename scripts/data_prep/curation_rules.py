#!/usr/bin/env python3
"""Policy helpers for Pass 3 autonomous data curation.

These helpers do not call Google Places. They encode the final data-governance
rules used after official/source review and Places verification.
"""

from __future__ import annotations

from collections import Counter
from typing import Any


NON_REPLACEABLE_INFRASTRUCTURE_IDS = {
    "place_hak_meilan_station",
    "place_hak_railway_station",
    "place_hak_xinhai_port",
}

ABSTRACT_TARGET_NAMES = {
    "海口湾",
    "国贸商圈",
    "观澜湖度假区",
}

TARGET_PRICE_DISTRIBUTION = {
    "180-400": 6,
    "400-800": 7,
    "800-1500": 6,
    "1500+": 5,
}

REQUIRED_HOTEL_AREAS = {
    "龙华区",
    "美兰区",
    "海口东站周边",
    "美兰机场/江东新区",
    "西海岸",
    "海口站/新海港方向",
    "观澜湖",
}


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


def price_distribution(records: list[dict[str, Any]]) -> dict[str, int]:
    return dict(Counter(price_band(item["mock_price_per_night"]) for item in records))


def price_distribution_ok(records: list[dict[str, Any]]) -> bool:
    return price_distribution(records) == TARGET_PRICE_DISTRIBUTION


def area_coverage_ok(records: list[dict[str, Any]]) -> bool:
    areas = {item.get("area") for item in records}
    return REQUIRED_HOTEL_AREAS <= areas


def duplicate_place_ids(records: list[dict[str, Any]]) -> dict[str, list[str]]:
    owners_by_id: dict[str, list[str]] = {}
    for item in records:
        place_id = item.get("google_place_id")
        if not place_id:
            continue
        owner = item.get("hotel_id") or item.get("place_id") or item.get("name", "<unknown>")
        owners_by_id.setdefault(place_id, []).append(owner)
    return {place_id: owners for place_id, owners in owners_by_id.items() if len(owners) > 1}


def is_abstract_target(record: dict[str, Any]) -> bool:
    return record.get("name") in ABSTRACT_TARGET_NAMES


def can_replace_place(original: dict[str, Any], replacement: dict[str, Any]) -> bool:
    if original.get("place_id") in NON_REPLACEABLE_INFRASTRUCTURE_IDS:
        return False
    if is_abstract_target(original):
        return bool(replacement.get("google_place_id")) and replacement.get("name") not in ABSTRACT_TARGET_NAMES
    return (
        original.get("category") == replacement.get("category")
        and original.get("area") == replacement.get("area")
        and bool(replacement.get("google_place_id"))
    )


def can_replace_hotel(original: dict[str, Any], replacement: dict[str, Any]) -> bool:
    return (
        original.get("area") == replacement.get("area")
        and price_band(original["mock_price_per_night"]) == price_band(replacement["mock_price_per_night"])
        and bool(replacement.get("google_place_id"))
        and bool(replacement.get("location", {}).get("latitude"))
        and bool(replacement.get("location", {}).get("longitude"))
    )


def should_write_places_result(status: str, place_id: str | None, latitude: Any, longitude: Any) -> bool:
    return (
        status in {"matched", "review_matched", "curation_matched"}
        and bool(place_id)
        and isinstance(latitude, (int, float))
        and isinstance(longitude, (int, float))
        and latitude != 0
        and longitude != 0
    )
