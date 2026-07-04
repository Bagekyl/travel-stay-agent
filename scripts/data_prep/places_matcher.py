#!/usr/bin/env python3
"""Deterministic matching helpers for offline Google Places enrichment."""

from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
from enum import Enum
import re
import string
from typing import Any


class MatchStatus(str, Enum):
    MATCHED = "matched"
    AMBIGUOUS = "ambiguous"
    UNMATCHED = "unmatched"
    ERROR = "error"


WEIGHTS = {
    "city": 0.25,
    "address_strong": 0.22,
    "address_medium": 0.11,
    "address_weak": 0.03,
    "type_match": 0.14,
    "type_mismatch": -0.25,
}

THRESHOLDS = {
    "min_name_score": 0.55,
    "clear_gap": 0.10,
    "near_tie_gap": 0.08,
    "strong_name_score": 0.90,
}

LODGING_TYPES = {
    "hotel",
    "lodging",
    "resort_hotel",
    "extended_stay_hotel",
    "bed_and_breakfast",
    "guest_house",
    "hostel",
}

CATEGORY_TYPE_HINTS: dict[str, set[str]] = {
    "airport": {"airport", "international_airport"},
    "railway_hub": {"train_station", "transit_station"},
    "port": {"ferry_terminal", "marina", "transit_station"},
    "historical_site": {
        "historical_landmark",
        "cultural_landmark",
        "tourist_attraction",
        "museum",
    },
    "museum": {"museum", "tourist_attraction"},
    "urban_landmark": {
        "tourist_attraction",
        "cultural_landmark",
        "historical_landmark",
        "library",
    },
    "seaside": {"tourist_attraction", "park", "beach"},
    "park": {"park", "tourist_attraction"},
    "commercial_district": {
        "shopping_mall",
        "market",
        "point_of_interest",
        "establishment",
    },
    "shopping": {"shopping_mall", "store", "department_store"},
    "convention": {"event_venue", "convention_center", "point_of_interest"},
    "campus": {"university", "school"},
    "resort": {"resort_hotel", "hotel", "tourist_attraction", "lodging"},
    "nature": {"national_park", "park", "tourist_attraction"},
    "family_attraction": {
        "tourist_attraction",
        "amusement_park",
        "movie_studio",
        "zoo",
        "park",
    },
}

ADMIN_AREA_RE = re.compile(r"^[\u4e00-\u9fff]{2,8}(区|县|市)$")
STRONG_ADDRESS_RE = re.compile(
    r"[\u4e00-\u9fffA-Za-z0-9·.-]{2,}(?:路|街|大道|巷|一街|二街|三街|四街|五街|六街|七街|八街|九街)[\u4e00-\u9fffA-Za-z0-9·.-]*?(?:\d+[A-Za-z0-9-]*号)"
)
ROAD_RE = re.compile(
    r"[\u4e00-\u9fffA-Za-z0-9·.-]{2,}(?:路|街|大道|巷|一街|二街|三街|四街|五街|六街|七街|八街|九街)"
)


@dataclass(frozen=True)
class MatchEvaluation:
    place_id: str
    display_name: str
    formatted_address: str
    latitude: float | None
    longitude: float | None
    types: list[str]
    primary_type: str
    name_score: float
    city_ok: bool
    address_level: str
    address_conflict: bool
    address_score: float
    type_ok: bool
    type_score: float
    total: float

    def as_report_dict(self) -> dict[str, Any]:
        return {
            "place_id": self.place_id,
            "display_name": self.display_name,
            "formatted_address": self.formatted_address,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "types": self.types,
            "primary_type": self.primary_type,
            "name_score": round(self.name_score, 3),
            "city_ok": self.city_ok,
            "address_level": self.address_level,
            "address_conflict": self.address_conflict,
            "address_score": round(self.address_score, 3),
            "type_ok": self.type_ok,
            "type_score": round(self.type_score, 3),
            "total": round(self.total, 3),
        }


@dataclass(frozen=True)
class MatchDecision:
    status: MatchStatus
    selected: MatchEvaluation | None
    candidates: list[MatchEvaluation]
    reason: str

    def as_report_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "reason": self.reason,
            "selected": self.selected.as_report_dict() if self.selected else None,
            "top_candidates": [candidate.as_report_dict() for candidate in self.candidates[:3]],
        }


def compact(value: Any) -> str:
    text = str(value or "").lower()
    text = text.replace("（", "(").replace("）", ")").replace("·", "")
    remove = set(string.whitespace + string.punctuation + "，。、“”‘’：；【】《》！￥（）")
    return "".join(ch for ch in text if ch not in remove)


def name_score(expected: str, actual: str) -> float:
    expected_norm = compact(expected)
    actual_norm = compact(actual)
    if not expected_norm or not actual_norm:
        return 0.0
    if expected_norm in actual_norm or actual_norm in expected_norm:
        shorter = min(len(expected_norm), len(actual_norm))
        longer = max(len(expected_norm), len(actual_norm))
        if longer and shorter / longer < 0.55:
            return max(0.70, SequenceMatcher(None, expected_norm, actual_norm).ratio())
        return 0.95
    return SequenceMatcher(None, expected_norm, actual_norm).ratio()


def address_tokens(entity: dict[str, Any]) -> dict[str, set[str]]:
    """Extract address evidence and keep administrative areas as weak evidence."""
    strong: set[str] = set()
    medium: set[str] = set()
    weak: set[str] = set()

    address = str(entity.get("address") or "")
    for token in STRONG_ADDRESS_RE.findall(address):
        compacted = compact(token)
        strong.add(compacted)
        for marker in ("区", "市"):
            if marker in token:
                strong.add(compact(token.split(marker)[-1]))
    if address:
        for token in ROAD_RE.findall(address):
            medium.add(compact(token))

    sub_area = str(entity.get("sub_area") or "")
    if sub_area:
        if ADMIN_AREA_RE.match(sub_area):
            weak.add(compact(sub_area))
        else:
            medium.add(compact(sub_area))

    area = str(entity.get("area") or "")
    if area:
        if ADMIN_AREA_RE.match(area):
            weak.add(compact(area))
        else:
            medium.add(compact(area))

    return {
        "strong": {token for token in strong if token},
        "medium": {token for token in medium if token},
        "weak": {token for token in weak if token},
    }


def address_evidence_level(entity: dict[str, Any], formatted_address: str) -> str:
    address_norm = compact(formatted_address)
    tokens = address_tokens(entity)
    if any(token in address_norm for token in tokens["strong"]):
        return "strong"
    if any(token in address_norm for token in tokens["medium"]):
        return "medium"
    if any(token in address_norm for token in tokens["weak"]):
        return "weak"
    return "none"


def has_explicit_address(value: str) -> bool:
    return bool(STRONG_ADDRESS_RE.search(value) or ROAD_RE.search(value))


def address_conflict(entity: dict[str, Any], formatted_address: str, address_level: str) -> bool:
    tokens = address_tokens(entity)
    if not tokens["strong"] or address_level == "strong":
        return False
    return has_explicit_address(formatted_address)


def type_ok(entity: dict[str, Any], place: dict[str, Any]) -> bool:
    found = set(place.get("types") or [])
    primary = place.get("primaryType")
    if primary:
        found.add(primary)

    if entity.get("hotel_id"):
        return bool(found & LODGING_TYPES)

    category = entity.get("category")
    hints = CATEGORY_TYPE_HINTS.get(str(category or ""))
    if not hints:
        return True
    return bool(found & hints)


def display_name(place: dict[str, Any]) -> str:
    value = place.get("displayName") or {}
    if isinstance(value, dict):
        return str(value.get("text") or "")
    return str(value or "")


def evaluate(entity: dict[str, Any], place: dict[str, Any]) -> MatchEvaluation:
    actual_name = display_name(place)
    formatted_address = str(place.get("formattedAddress") or "")
    location = place.get("location") or {}
    score_name = name_score(str(entity.get("name") or ""), actual_name)
    formatted_norm = compact(formatted_address)
    city_ok = "海口" in formatted_address or "haikou" in formatted_norm
    level = address_evidence_level(entity, formatted_address)
    conflict = address_conflict(entity, formatted_address, level)
    address_score = {
        "strong": WEIGHTS["address_strong"],
        "medium": WEIGHTS["address_medium"],
        "weak": WEIGHTS["address_weak"],
        "none": 0.0,
    }[level]
    type_match = type_ok(entity, place)
    type_score = WEIGHTS["type_match"] if type_match else WEIGHTS["type_mismatch"]
    total = score_name + (WEIGHTS["city"] if city_ok else 0.0) + address_score + type_score

    return MatchEvaluation(
        place_id=str(place.get("id") or ""),
        display_name=actual_name,
        formatted_address=formatted_address,
        latitude=location.get("latitude"),
        longitude=location.get("longitude"),
        types=list(place.get("types") or []),
        primary_type=str(place.get("primaryType") or ""),
        name_score=score_name,
        city_ok=city_ok,
        address_level=level,
        address_conflict=conflict,
        address_score=address_score,
        type_ok=type_match,
        type_score=type_score,
        total=total,
    )


def decide(entity: dict[str, Any], candidates: list[dict[str, Any]]) -> MatchDecision:
    if not candidates:
        return MatchDecision(MatchStatus.UNMATCHED, None, [], "no Places candidates returned")

    ranked = sorted((evaluate(entity, candidate) for candidate in candidates), key=lambda item: item.total, reverse=True)
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    gap = best.total - (second.total if second else 0.0)
    exact_tie = bool(
        second
        and gap < THRESHOLDS["near_tie_gap"]
        and compact(best.display_name) == compact(second.display_name)
    )
    has_effective_disambiguator = best.address_level in {"strong", "medium"} or best.type_ok
    if best.address_level == "strong":
        strong_evidence = True
    elif best.address_level == "medium":
        strong_evidence = best.name_score >= 0.75 and gap >= THRESHOLDS["clear_gap"]
    else:
        strong_evidence = best.name_score >= THRESHOLDS["strong_name_score"] and gap >= THRESHOLDS["clear_gap"]

    if not best.city_ok:
        return MatchDecision(MatchStatus.AMBIGUOUS, None, ranked, "best candidate is outside Haikou")
    if best.name_score < THRESHOLDS["min_name_score"]:
        return MatchDecision(MatchStatus.AMBIGUOUS, None, ranked, "best candidate name score is below threshold")
    if not best.type_ok:
        return MatchDecision(MatchStatus.AMBIGUOUS, None, ranked, "best candidate type does not match the entity role")
    if best.address_conflict:
        return MatchDecision(MatchStatus.AMBIGUOUS, None, ranked, "best candidate has an explicit address that conflicts with the data record")
    if exact_tie:
        return MatchDecision(MatchStatus.AMBIGUOUS, None, ranked, "top candidates have the same normalized name and near-tie scores")
    if not has_effective_disambiguator:
        return MatchDecision(MatchStatus.AMBIGUOUS, None, ranked, "candidate lacks effective address or type disambiguation")
    if not strong_evidence:
        return MatchDecision(MatchStatus.AMBIGUOUS, None, ranked, "candidate evidence is not strong enough")

    return MatchDecision(MatchStatus.MATCHED, best, ranked, "best candidate passed name, city, type/address, and separation checks")
