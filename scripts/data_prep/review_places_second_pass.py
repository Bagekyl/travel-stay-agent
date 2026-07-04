#!/usr/bin/env python3
"""Run reason-aware second-pass Places review for first-pass ambiguous records."""

from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time
from typing import Any

from enrich_places_data import (
    BACKUP_ROOT,
    HOTELS_PATH,
    PLACES_PATH,
    ROOT,
    create_backup,
    load_json,
    safe_error_summary,
    search_text,
    write_json,
)
from places_reviewer import (
    ReviewStatus,
    SecondPassDecision,
    classify_reason,
    decide_second_pass,
    generate_query_variants,
    candidate_support_score,
    core_name_similarity,
)


FIRST_PASS_REPORT = ROOT / "reports" / "places_validation_report.md"
SECOND_PASS_REPORT = ROOT / "reports" / "places_second_pass_review.md"
DEFAULT_SLEEP_SECONDS = 0.35


def entity_id(entity: dict[str, Any]) -> str:
    return str(entity.get("hotel_id") or entity.get("place_id") or "<missing>")


def load_first_pass_ambiguous() -> dict[str, dict[str, str]]:
    text = FIRST_PASS_REPORT.read_text(encoding="utf-8")
    pattern = re.compile(r"- `([^`]+)` ([^\[]+) \[([^,]+), ambiguous\]: (.+)")
    items: dict[str, dict[str, str]] = {}
    in_manual = False
    for line in text.splitlines():
        if line == "## Manual Review Items":
            in_manual = True
            continue
        if in_manual and line.startswith("## "):
            break
        if not in_manual:
            continue
        match = pattern.match(line.strip())
        if match:
            item_id, name, kind, reason = match.groups()
            category = classify_reason(reason)
            items[item_id] = {
                "id": item_id,
                "name": name.strip(),
                "kind": kind.strip(),
                "reason": reason.strip(),
                "reason_category": category,
            }
    return items


def current_entities_by_id(hotels: list[dict[str, Any]], places: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {entity_id(item): item for item in hotels + places}


def matched_counts(hotels: list[dict[str, Any]], places: list[dict[str, Any]]) -> dict[str, int]:
    hotel_matched = sum(1 for item in hotels if item.get("google_place_id"))
    place_matched = sum(1 for item in places if item.get("google_place_id"))
    return {
        "hotel_matched": hotel_matched,
        "hotel_ambiguous": len(hotels) - hotel_matched,
        "place_matched": place_matched,
        "place_ambiguous": len(places) - place_matched,
        "total_matched": hotel_matched + place_matched,
        "total_ambiguous": len(hotels) + len(places) - hotel_matched - place_matched,
    }


def first_pass_possible_issues(hotels: list[dict[str, Any]], places: list[dict[str, Any]]) -> list[str]:
    issues: list[str] = []
    populated = [(item.get("google_place_id"), entity_id(item), item.get("name")) for item in hotels + places if item.get("google_place_id")]
    for place_id, count in Counter(place_id for place_id, _, _ in populated).items():
        if count > 1:
            owners = [f"{owner} {name}" for pid, owner, name in populated if pid == place_id]
            issues.append(f"Place ID `{place_id}` is used by multiple entities: {'; '.join(owners)}")
    for item in hotels + places:
        if not item.get("google_place_id"):
            continue
        loc = item.get("location") or {}
        lat = loc.get("latitude")
        lon = loc.get("longitude")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            issues.append(f"`{entity_id(item)}` has populated Place ID but incomplete coordinates")
        elif not (18.0 <= lat <= 20.6 and 108.5 <= lon <= 111.5):
            issues.append(f"`{entity_id(item)}` coordinates are outside broad Haikou/Hainan bounds")
    return issues


def populated_place_id_owners(hotels: list[dict[str, Any]], places: list[dict[str, Any]]) -> dict[str, str]:
    return {
        str(item.get("google_place_id")): entity_id(item)
        for item in hotels + places
        if item.get("google_place_id")
    }


def downgrade_existing_place_id_reuse(records: list[dict[str, Any]], existing_owners: dict[str, str]) -> list[str]:
    issues: list[str] = []
    for record in records:
        decision = record["decision"]
        if decision.status != ReviewStatus.REVIEW_MATCHED or not decision.selected:
            continue
        selected_place_id = decision.selected.place_id
        owner = existing_owners.get(selected_place_id)
        if not owner or owner == record["id"]:
            continue
        issues.append(f"`{record['id']}` selected first-pass Place ID `{selected_place_id}` already owned by `{owner}`")
        record["decision"] = SecondPassDecision(
            ReviewStatus.STILL_AMBIGUOUS,
            decision.reason_category,
            f"selected Place ID is already used by first-pass matched entity `{owner}`",
            None,
            decision.candidates,
            decision.query_variants,
            decision.api_errors,
            None,
        )
    return issues


def run_second_pass(api_key: str, entities: list[dict[str, Any]], reasons: dict[str, dict[str, str]], sleep_seconds: float) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, entity in enumerate(entities, 1):
        if index > 1:
            time.sleep(sleep_seconds)
        item_id = entity_id(entity)
        reason = reasons[item_id]["reason"]
        query_variants = generate_query_variants(entity, reasons[item_id]["reason_category"])
        query_results: list[tuple[str, list[dict[str, Any]]]] = []
        errors: list[str] = []
        for query_index, query in enumerate(query_variants):
            if index > 1 or query_index > 0:
                time.sleep(sleep_seconds)
            try:
                query_results.append((query, search_text(api_key, query)))
            except Exception as exc:
                errors.append(f"{query}: {safe_error_summary(exc)}")
                query_results.append((query, []))
        decision = decide_second_pass(entity, reason, query_variants, query_results, errors)
        records.append(
            {
                "id": item_id,
                "kind": "hotel" if entity.get("hotel_id") else "place",
                "entity": entity,
                "first_pass": reasons[item_id],
                "decision": decision,
            }
        )
    return records


def apply_second_pass(records: list[dict[str, Any]]) -> dict[str, Any]:
    changed_place_ids = 0
    changed_coordinates = 0
    address_updates: list[dict[str, str]] = []
    for record in records:
        decision = record["decision"]
        if decision.status != ReviewStatus.REVIEW_MATCHED or not decision.selected:
            continue
        entity = record["entity"]
        selected = decision.selected.best
        if not entity.get("google_place_id"):
            changed_place_ids += 1
        if (entity.get("location") or {}).get("latitude") is None and selected.latitude is not None:
            changed_coordinates += 1
        entity["google_place_id"] = selected.place_id
        entity["location"] = {"latitude": selected.latitude, "longitude": selected.longitude}
        if decision.address_update and "address" in entity:
            update = {
                "id": entity_id(entity),
                "name": str(entity.get("name") or ""),
                "old": decision.address_update["old"],
                "new": decision.address_update["new"],
                "evidence": decision.address_update["evidence"],
            }
            entity["address"] = decision.address_update["new"]
            address_updates.append(update)
    return {
        "changed_place_ids": changed_place_ids,
        "changed_coordinates": changed_coordinates,
        "address_updates": address_updates,
    }


def aggregate_summary_line(record: dict[str, Any]) -> str:
    decision = record["decision"]
    if not decision.selected:
        return ""
    selected = decision.selected
    best = selected.best
    score = candidate_support_score(record["entity"], selected)
    core = core_name_similarity(str(record["entity"].get("name") or ""), best.display_name)
    return (
        f"Place ID `{selected.place_id}`, display `{best.display_name}`, address `{best.formatted_address}`, "
        f"types `{best.primary_type or ','.join(best.types[:3])}`, appearances {selected.appearances}, "
        f"top1 {selected.top1_count}, top3 {selected.top3_count}, support {score:.2f}, core-name {core:.2f}"
    )


def write_second_pass_report(
    records: list[dict[str, Any]],
    mode: str,
    before_counts: dict[str, int],
    after_counts: dict[str, int],
    first_pass_items: dict[str, dict[str, str]],
    apply_stats: dict[str, Any],
    backup_path: Path | None,
    possible_issues: list[str],
) -> None:
    SECOND_PASS_REPORT.parent.mkdir(parents=True, exist_ok=True)
    status_counts = Counter(record["decision"].status.value for record in records)
    reason_counts = Counter(item["reason_category"] for item in first_pass_items.values())
    query_count = sum(len(record["decision"].query_variants) for record in records)
    api_errors = [record for record in records if record["decision"].api_errors]

    lines = [
        "# Places Second-pass Review",
        "",
        f"- Execution time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"- Mode: {mode}",
        f"- First-pass report: `{FIRST_PASS_REPORT.relative_to(ROOT)}`",
        "- First-pass summary: 48 total, 17 matched, 31 ambiguous, 0 unmatched, 0 error",
        f"- Second-pass processed entities: {len(records)}",
        f"- Original ambiguous entities: {len(first_pass_items)}",
        f"- API query variants executed: {query_count}",
        f"- review_matched: {status_counts.get(ReviewStatus.REVIEW_MATCHED.value, 0)}",
        f"- still_ambiguous: {status_counts.get(ReviewStatus.STILL_AMBIGUOUS.value, 0)}",
        f"- review_error: {status_counts.get(ReviewStatus.REVIEW_ERROR.value, 0)}",
        f"- Final total matched: {after_counts['total_matched']}",
        f"- Final hotel completion: {after_counts['hotel_matched']}/24 matched, {after_counts['hotel_ambiguous']}/24 ambiguous",
        f"- Final target-place completion: {after_counts['place_matched']}/24 matched, {after_counts['place_ambiguous']}/24 ambiguous",
        f"- Written Place IDs: {apply_stats.get('changed_place_ids', 0)}",
        f"- Written coordinate pairs: {apply_stats.get('changed_coordinates', 0)}",
        f"- Backup: `{backup_path.relative_to(ROOT)}`" if backup_path else "- Backup: not created in dry-run mode",
        "",
        "## First-pass Ambiguous Classification",
        "",
    ]
    for category in ("address_conflict", "low_name_score", "type_mismatch", "near_tie_or_same_name", "weak_evidence", "outside_city_candidate", "other"):
        ids = [item["id"] for item in first_pass_items.values() if item["reason_category"] == category]
        lines.append(f"- {category}: {reason_counts.get(category, 0)}" + (f" ({', '.join(ids)})" if ids else ""))

    lines.extend(
        [
            "",
            "## Review Strategies",
            "",
            "- address_conflict: require repeated top-ranked evidence, an address-bearing query variant, type consistency, and a clear aggregate gap before writing Place ID or revising address.",
            "- low_name_score: keep the first-pass name threshold intact and add core-name similarity plus brand consistency as supporting evidence.",
            "- type_mismatch: rerun more precise variants and require repeated top-ranked type-correct evidence.",
            "- near_tie_or_same_name: aggregate candidates by Place ID and require clear separation across query variants.",
            "- weak_evidence: require repeated top placement or three-query consistency; weak administrative area evidence remains insufficient by itself.",
            "- outside_city_candidate: require repeated top-ranked Haikou candidate; out-of-city candidates remain rejected.",
            "",
            "## Successful Second-pass Matches",
            "",
        ]
    )
    matched = [record for record in records if record["decision"].status == ReviewStatus.REVIEW_MATCHED]
    if matched:
        for record in matched:
            entity = record["entity"]
            decision = record["decision"]
            lines.append(f"### `{record['id']}` {entity.get('name')}")
            lines.append(f"- Type: {record['kind']}")
            lines.append(f"- First-pass reason: {record['first_pass']['reason_category']} / {record['first_pass']['reason']}")
            lines.append(f"- Query variants: {'; '.join(decision.query_variants)}")
            lines.append(f"- Evidence: {aggregate_summary_line(record)}")
            lines.append(f"- Decision: {decision.reason}")
            if decision.address_update:
                lines.append(f"- Address update: `{decision.address_update['old']}` -> `{decision.address_update['new']}`")
            lines.append("")
    else:
        lines.append("- None.")

    lines.extend(["", "## Address Updates", ""])
    if apply_stats.get("address_updates"):
        for item in apply_stats["address_updates"]:
            lines.append(f"- `{item['id']}` {item['name']}: `{item['old']}` -> `{item['new']}`; {item['evidence']}")
    else:
        lines.append("- None.")

    lines.extend(["", "## Still Needs Manual Review", ""])
    still = [record for record in records if record["decision"].status == ReviewStatus.STILL_AMBIGUOUS]
    if still:
        for record in still:
            decision = record["decision"]
            lines.append(f"- `{record['id']}` {record['entity'].get('name')} [{record['kind']}, {decision.reason_category}]: {decision.reason}")
    else:
        lines.append("- None.")

    lines.extend(["", "## First-pass Possible Issues", ""])
    if possible_issues:
        for issue in possible_issues:
            lines.append(f"- {issue}")
    else:
        lines.append("- None.")

    lines.extend(["", "## API Error Summary", ""])
    if api_errors:
        for record in api_errors:
            lines.append(f"- `{record['id']}` {record['entity'].get('name')}: {'; '.join(record['decision'].api_errors)}")
    else:
        lines.append("- None.")

    lines.extend(["", "## Per-entity Results", ""])
    lines.append("| Type | ID | Name | First-pass category | Second-pass status | Query count | Selected | Reason |")
    lines.append("|---|---|---|---|---|---:|---|---|")
    for record in records:
        decision = record["decision"]
        selected = decision.selected.place_id if decision.selected else ""
        lines.append(
            f"| {record['kind']} | `{record['id']}` | {record['entity'].get('name')} | {decision.reason_category} | {decision.status.value} | {len(decision.query_variants)} | {selected} | {decision.reason} |"
        )

    SECOND_PASS_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Second-pass review for first-pass ambiguous Places records.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Review ambiguous records without writing JSON.")
    mode.add_argument("--apply", action="store_true", help="Review ambiguous records and write high-confidence matches.")
    parser.add_argument("--sleep", type=float, default=DEFAULT_SLEEP_SECONDS, help="Delay between Places API calls.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_MAPS_API_KEY is not available in the environment.", file=sys.stderr)
        return 2

    hotels = load_json(HOTELS_PATH)
    places = load_json(PLACES_PATH)
    first_pass_items = load_first_pass_ambiguous()
    before_counts = matched_counts(hotels, places)

    working_hotels = deepcopy(hotels)
    working_places = deepcopy(places)
    entities = current_entities_by_id(working_hotels, working_places)
    review_entities = [
        entities[item_id]
        for item_id in first_pass_items
        if item_id in entities and not entities[item_id].get("google_place_id")
    ]

    records = run_second_pass(api_key, review_entities, first_pass_items, args.sleep)
    possible_issues = first_pass_possible_issues(working_hotels, working_places)
    possible_issues.extend(downgrade_existing_place_id_reuse(records, populated_place_id_owners(working_hotels, working_places)))
    status_counts = Counter(record["decision"].status.value for record in records)
    print(
        "Second-pass decisions: "
        f"review_matched={status_counts.get('review_matched', 0)}, "
        f"still_ambiguous={status_counts.get('still_ambiguous', 0)}, "
        f"review_error={status_counts.get('review_error', 0)}"
    )

    backup_path: Path | None = None
    apply_stats: dict[str, Any] = {"changed_place_ids": 0, "changed_coordinates": 0, "address_updates": []}
    mode = "dry-run"
    if args.apply:
        backup_path = create_backup()
        apply_stats = apply_second_pass(records)
        write_json(HOTELS_PATH, working_hotels)
        write_json(PLACES_PATH, working_places)
        mode = "apply"

    after_counts = matched_counts(working_hotels, working_places)
    write_second_pass_report(records, mode, before_counts, after_counts, first_pass_items, apply_stats, backup_path, possible_issues)
    print(f"Report written to {SECOND_PASS_REPORT.relative_to(ROOT)}")
    if backup_path:
        print(f"Backup written to {backup_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
