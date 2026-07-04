#!/usr/bin/env python3
"""Reason-aware second-pass review for ambiguous Google Places matches."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from enum import Enum
import re
from typing import Any

from places_matcher import (
    MatchEvaluation,
    address_conflict,
    address_tokens,
    compact,
    evaluate,
    name_score,
)


class ReviewStatus(str, Enum):
    REVIEW_MATCHED = "review_matched"
    STILL_AMBIGUOUS = "still_ambiguous"
    REVIEW_ERROR = "review_error"


REASON_CATEGORIES = {
    "address_conflict": "address_conflict",
    "explicit address that conflicts": "address_conflict",
    "name score is below threshold": "low_name_score",
    "type does not match": "type_mismatch",
    "same normalized name": "near_tie_or_same_name",
    "near-tie": "near_tie_or_same_name",
    "evidence is not strong enough": "weak_evidence",
    "outside Haikou": "outside_city_candidate",
}

HOTEL_BRAND_ALIASES = {
    "Sofitel": ["索菲特", "Sofitel"],
    "IHG": ["华邑", "HUALUXE", "Holiday Inn", "智选假日"],
    "Wyndham": ["温德姆", "Wyndham"],
    "Ascott": ["雅诗阁", "Ascott"],
    "Atour": ["亚朵", "Atour"],
    "Hanting": ["汉庭", "Hanting"],
    "JI Hotel": ["全季", "Ji Hotel"],
    "GreenTree": ["格林豪泰", "格林东方", "GreenTree"],
    "MGM": ["美高梅", "MGM"],
    "Ritz-Carlton": ["丽思卡尔顿", "Ritz-Carlton"],
    "Marriott": ["万豪", "Marriott"],
    "Sheraton": ["喜来登", "Sheraton"],
    "Westin": ["威斯汀", "Westin"],
    "Langham": ["朗廷", "Langham"],
    "Hilton": ["希尔顿", "Hilton"],
}

GENERIC_NAME_PARTS = [
    "海南",
    "海口",
    "酒店",
    "大酒店",
    "度假酒店",
    "温泉度假酒店",
    "精品民宿",
    "民宿",
    "服务公寓",
    "国际",
    "机场",
    "店",
    "旗舰店",
    "旅游区",
    "景区",
    "公园",
    "广场",
    "中心",
    "图书馆",
    "商圈",
    "度假区",
    "世界地质公园",
    "国家地质公园",
]

GENERIC_CORE_VALUES = {"站", "东站", "西站", "南站", "北站", "图书馆", "酒店", "公园", "广场", "中心"}

CATEGORY_QUERY_TERMS = {
    "airport": ["机场", "航站楼"],
    "railway_hub": ["火车站", "铁路车站", "高铁站"],
    "port": ["客运港", "轮渡码头", "港口"],
    "historical_site": ["景区", "历史文化", "旧址"],
    "museum": ["博物馆"],
    "urban_landmark": ["地标", "景点"],
    "seaside": ["海滩", "海边", "景区"],
    "park": ["公园"],
    "commercial_district": ["商圈", "商业区"],
    "shopping": ["购物中心", "商场"],
    "convention": ["会展中心", "展馆"],
    "campus": ["大学", "校区"],
    "resort": ["度假区", "旅游度假区"],
    "nature": ["地质公园", "景区"],
    "family_attraction": ["景区", "亲子", "主题公园"],
}


@dataclass
class QueryObservation:
    query: str
    rank: int
    evaluation: MatchEvaluation


@dataclass
class CandidateAggregate:
    place_id: str
    observations: list[QueryObservation] = field(default_factory=list)

    @property
    def appearances(self) -> int:
        return len(self.observations)

    @property
    def top1_count(self) -> int:
        return sum(1 for item in self.observations if item.rank == 1)

    @property
    def top3_count(self) -> int:
        return sum(1 for item in self.observations if item.rank <= 3)

    @property
    def best(self) -> MatchEvaluation:
        return max(self.observations, key=lambda item: item.evaluation.total).evaluation

    @property
    def queries(self) -> list[str]:
        seen: list[str] = []
        for item in self.observations:
            if item.query not in seen:
                seen.append(item.query)
        return seen

    @property
    def display_names(self) -> list[str]:
        return sorted({item.evaluation.display_name for item in self.observations if item.evaluation.display_name})

    @property
    def formatted_addresses(self) -> list[str]:
        return sorted({item.evaluation.formatted_address for item in self.observations if item.evaluation.formatted_address})


@dataclass
class SecondPassDecision:
    status: ReviewStatus
    reason_category: str
    reason: str
    selected: CandidateAggregate | None
    candidates: list[CandidateAggregate]
    query_variants: list[str]
    api_errors: list[str] = field(default_factory=list)
    address_update: dict[str, str] | None = None


def classify_reason(reason: str) -> str:
    for marker, category in REASON_CATEGORIES.items():
        if marker in reason:
            return category
    return "other"


def dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = " ".join(str(value or "").split())
        if clean and clean not in seen:
            result.append(clean)
            seen.add(clean)
    return result


def road_terms(value: str) -> list[str]:
    terms: list[str] = []
    for regex in (re.compile(r"[\u4e00-\u9fffA-Za-z0-9·.-]{2,}(?:路|街|大道|巷)[\u4e00-\u9fffA-Za-z0-9·.-]*?(?:\d+[A-Za-z0-9-]*号)"), re.compile(r"[\u4e00-\u9fffA-Za-z0-9·.-]{2,}(?:路|街|大道|巷)")):
        terms.extend(regex.findall(value or ""))
    return dedupe(terms)


def brand_aliases(entity: dict[str, Any]) -> list[str]:
    brand = str(entity.get("brand") or "")
    aliases = HOTEL_BRAND_ALIASES.get(brand, [])
    name = str(entity.get("name") or "")
    for known_aliases in HOTEL_BRAND_ALIASES.values():
        if any(alias and alias in name for alias in known_aliases):
            aliases.extend(known_aliases)
    return dedupe(aliases)


def name_core(value: str) -> str:
    text = compact(value)
    for part in sorted(GENERIC_NAME_PARTS, key=len, reverse=True):
        text = text.replace(compact(part), "")
    return text


def core_name_similarity(expected: str, actual: str) -> float:
    expected_core = name_core(expected)
    actual_core = name_core(actual)
    if not expected_core or not actual_core:
        return name_score(expected, actual)
    if expected_core in actual_core or actual_core in expected_core:
        shorter = min(len(expected_core), len(actual_core))
        longer = max(len(expected_core), len(actual_core))
        shorter_value = expected_core if len(expected_core) <= len(actual_core) else actual_core
        if shorter >= 2 and shorter_value not in GENERIC_CORE_VALUES and longer and shorter / longer >= 0.45:
            return 0.92
    return SequenceMatcher(None, expected_core, actual_core).ratio()


def has_place_name_conflict(entity: dict[str, Any], display_name: str) -> bool:
    expected = compact(str(entity.get("name") or ""))
    actual = compact(display_name)
    if not expected or not actual:
        return True
    if entity.get("category") == "railway_hub":
        if "东站" in actual and "东站" not in expected:
            return True
        if "西站" in actual and "西站" not in expected:
            return True
    if "云洞" in expected and "云洞" not in actual:
        return True
    return False


def brand_consistency(entity: dict[str, Any], display_name: str) -> bool:
    aliases = brand_aliases(entity)
    if not aliases:
        return False
    compact_name = compact(display_name)
    return any(compact(alias) and compact(alias) in compact_name for alias in aliases)


def generate_query_variants(entity: dict[str, Any], reason_category: str) -> list[str]:
    name = str(entity.get("name") or "")
    area = str(entity.get("area") or "")
    sub_area = str(entity.get("sub_area") or "")
    address = str(entity.get("address") or "")
    base = str(entity.get("places_query") or f"{name} 海口")
    variants = [base, f"{name} 海口"]

    if entity.get("hotel_id"):
        roads = road_terms(address)
        if roads:
            variants.append(f"{name} {roads[0]} 海口")
        aliases = brand_aliases(entity)
        if aliases and sub_area:
            variants.append(f"{aliases[0]} {sub_area} 海口")
        elif aliases:
            variants.append(f"{aliases[0]} {name} 海口")
        elif sub_area:
            variants.append(f"{name} {sub_area} 海口")
        if reason_category == "outside_city_candidate" and area:
            variants.append(f"{name} {area} 海口")
    else:
        category = str(entity.get("category") or "")
        terms = CATEGORY_QUERY_TERMS.get(category, [])
        if terms:
            variants.append(f"{name} {terms[0]} 海口")
        if area:
            variants.append(f"{name} {area} 海口")
        if len(terms) > 1:
            variants.append(f"{name} {terms[1]} 海口")

    if reason_category == "near_tie_or_same_name" and area:
        variants.append(f"{name} {area}")
    if reason_category == "weak_evidence" and sub_area:
        variants.append(f"{name} {sub_area} 海口")
    if reason_category == "address_conflict" and address:
        variants.append(f"{name} {address}")

    return dedupe(variants)[:4]


def aggregate_candidates(entity: dict[str, Any], query_results: list[tuple[str, list[dict[str, Any]]]]) -> list[CandidateAggregate]:
    by_place_id: dict[str, CandidateAggregate] = {}
    for query, candidates in query_results:
        for rank, candidate in enumerate(candidates[:5], 1):
            evaluation = evaluate(entity, candidate)
            if not evaluation.place_id:
                continue
            aggregate = by_place_id.setdefault(evaluation.place_id, CandidateAggregate(evaluation.place_id))
            aggregate.observations.append(QueryObservation(query, rank, evaluation))
    return sorted(by_place_id.values(), key=lambda item: candidate_support_score(entity, item), reverse=True)


def query_address_support(entity: dict[str, Any], aggregate: CandidateAggregate) -> bool:
    address = str(entity.get("address") or "")
    if not address:
        return False
    address_norm = compact(address)
    for observation in aggregate.observations:
        if address_norm and address_norm in compact(observation.query):
            return True
    return False


def candidate_support_score(entity: dict[str, Any], aggregate: CandidateAggregate) -> float:
    best = aggregate.best
    core = core_name_similarity(str(entity.get("name") or ""), best.display_name)
    brand_bonus = 0.35 if entity.get("hotel_id") and brand_consistency(entity, best.display_name) else 0.0
    address_bonus = {"strong": 0.8, "medium": 0.45, "weak": 0.1, "none": 0.0}[best.address_level]
    conflict_penalty = -1.0 if best.address_conflict else 0.0
    return (
        aggregate.appearances * 1.0
        + aggregate.top1_count * 1.4
        + aggregate.top3_count * 0.35
        + best.name_score * 1.2
        + core * 0.9
        + (0.8 if best.type_ok else -1.5)
        + (0.5 if best.city_ok else -2.0)
        + address_bonus
        + brand_bonus
        + conflict_penalty
    )


def candidate_has_minimum_identity(entity: dict[str, Any], aggregate: CandidateAggregate) -> bool:
    best = aggregate.best
    if has_place_name_conflict(entity, best.display_name):
        return False
    core = core_name_similarity(str(entity.get("name") or ""), best.display_name)
    if best.name_score >= 0.82 or core >= 0.78:
        return True
    if entity.get("hotel_id") and brand_consistency(entity, best.display_name) and core >= 0.55:
        return True
    return False


def candidate_admin_area(formatted_address: str) -> str:
    match = re.search(r"海口市([\u4e00-\u9fff]{2,8}区)", formatted_address or "")
    return match.group(1) if match else ""


def entity_admin_area(entity: dict[str, Any]) -> str:
    for value in (str(entity.get("address") or ""), str(entity.get("area") or "")):
        match = re.search(r"海口市?([\u4e00-\u9fff]{2,8}区)", value)
        if match:
            return match.group(1)
        if value.endswith("区"):
            return value
    return ""


def competitor_gap(entity: dict[str, Any], aggregates: list[CandidateAggregate]) -> float:
    if len(aggregates) < 2:
        return 99.0
    return candidate_support_score(entity, aggregates[0]) - candidate_support_score(entity, aggregates[1])


def decide_second_pass(
    entity: dict[str, Any],
    reason: str,
    query_variants: list[str],
    query_results: list[tuple[str, list[dict[str, Any]]]],
    api_errors: list[str] | None = None,
) -> SecondPassDecision:
    reason_category = classify_reason(reason)
    api_errors = api_errors or []
    aggregates = aggregate_candidates(entity, query_results)
    if not aggregates:
        status = ReviewStatus.REVIEW_ERROR if api_errors else ReviewStatus.STILL_AMBIGUOUS
        return SecondPassDecision(status, reason_category, "no candidates across query variants", None, [], query_variants, api_errors)

    best = aggregates[0]
    evaluation = best.best
    gap = competitor_gap(entity, aggregates)
    support_ok = best.appearances >= 2 and (best.top1_count >= 1 or best.top3_count >= 2)
    repeated_top_ok = best.top1_count >= 2
    minimum_identity = candidate_has_minimum_identity(entity, best)
    type_city_ok = evaluation.city_ok and evaluation.type_ok
    conflict = evaluation.address_conflict

    if not type_city_ok:
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "best aggregate lacks city or type consistency", None, aggregates, query_variants, api_errors)
    if not minimum_identity:
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "best aggregate lacks sufficient core-name or brand identity", None, aggregates, query_variants, api_errors)
    if gap < 0.75:
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "best aggregate is too close to a competing candidate", None, aggregates, query_variants, api_errors)

    address_update: dict[str, str] | None = None
    if reason_category == "address_conflict" or conflict:
        address_query_ok = query_address_support(entity, best)
        entity_area = entity_admin_area(entity)
        candidate_area = candidate_admin_area(evaluation.formatted_address)
        if not entity.get("official_address_evidence"):
            return SecondPassDecision(
                ReviewStatus.STILL_AMBIGUOUS,
                reason_category,
                "address conflict requires official-source evidence before automatic address revision",
                None,
                aggregates,
                query_variants,
                api_errors,
            )
        if entity_area and candidate_area and entity_area != candidate_area:
            return SecondPassDecision(
                ReviewStatus.STILL_AMBIGUOUS,
                reason_category,
                "address conflict crosses administrative districts and needs manual or official-source verification",
                None,
                aggregates,
                query_variants,
                api_errors,
            )
        if not (repeated_top_ok and best.appearances >= 2 and address_query_ok and gap >= 1.2):
            return SecondPassDecision(
                ReviewStatus.STILL_AMBIGUOUS,
                reason_category,
                "address conflict lacks enough multi-query evidence to revise the data address",
                None,
                aggregates,
                query_variants,
                api_errors,
            )
        address_update = {
            "old": str(entity.get("address") or ""),
            "new": evaluation.formatted_address,
            "evidence": "same Place ID remained dominant even when the JSON address was included in a query variant",
        }

    if reason_category == "type_mismatch" and not repeated_top_ok:
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "type mismatch review requires repeated top-ranked type-correct evidence", None, aggregates, query_variants, api_errors)
    if reason_category == "near_tie_or_same_name" and not (repeated_top_ok and gap >= 1.2):
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "same-name review still has insufficient separation", None, aggregates, query_variants, api_errors)
    if reason_category == "weak_evidence" and not (repeated_top_ok or best.appearances >= 3):
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "weak-evidence review needs repeated top placement or three-query consistency", None, aggregates, query_variants, api_errors)
    if reason_category == "low_name_score" and not (support_ok and (core_name_similarity(str(entity.get("name") or ""), evaluation.display_name) >= 0.72 or repeated_top_ok)):
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "low-name review lacks enough core-name or repeated-query support", None, aggregates, query_variants, api_errors)
    if reason_category == "outside_city_candidate" and not repeated_top_ok:
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "outside-city review requires repeated top-ranked Haikou candidate", None, aggregates, query_variants, api_errors)
    if not (support_ok or repeated_top_ok):
        return SecondPassDecision(ReviewStatus.STILL_AMBIGUOUS, reason_category, "candidate is not stable across enough query variants", None, aggregates, query_variants, api_errors)

    return SecondPassDecision(
        ReviewStatus.REVIEW_MATCHED,
        reason_category,
        "multi-query evidence supports a single type-correct Haikou candidate",
        best,
        aggregates,
        query_variants,
        api_errors,
        address_update,
    )
