#!/usr/bin/env python3
"""Offline Google Places enrichment for Haikou hotel/place data."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sys
import time
from typing import Any
import urllib.error
import urllib.request

from places_matcher import MatchDecision, MatchEvaluation, MatchStatus, decide


ROOT = Path(__file__).resolve().parents[2]
HOTELS_PATH = ROOT / "data" / "mock_hotels_haikou.json"
PLACES_PATH = ROOT / "data" / "haikou_target_places.json"
REPORT_PATH = ROOT / "reports" / "places_validation_report.md"
BACKUP_ROOT = ROOT / "backups"

ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.types",
        "places.primaryType",
    ]
)
REQUEST_TIMEOUT_SECONDS = 20
DEFAULT_SLEEP_SECONDS = 0.35
MAX_RETRIES = 3
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
VAGUE_ADDRESS_TERMS = ("周边", "附近", "区域", "区域内")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def entity_id(entity: dict[str, Any]) -> str:
    return str(entity.get("hotel_id") or entity.get("place_id") or "<missing>")


def entity_kind(entity: dict[str, Any]) -> str:
    return "hotel" if entity.get("hotel_id") else "place"


def safe_error_summary(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return f"HTTP {exc.code}"
    return type(exc).__name__


def search_text(api_key: str, text_query: str) -> list[dict[str, Any]]:
    body = json.dumps(
        {"textQuery": text_query, "languageCode": "zh-CN", "regionCode": "CN"},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        },
    )

    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                payload = json.loads(response.read().decode("utf-8"))
                return list(payload.get("places") or [])
        except urllib.error.HTTPError as exc:
            if exc.code not in RETRY_STATUS_CODES or attempt >= MAX_RETRIES:
                raise
        except urllib.error.URLError:
            if attempt >= MAX_RETRIES:
                raise

        time.sleep(0.8 * (2**attempt))

    return []


def run_batch(api_key: str, hotels: list[dict[str, Any]], places: list[dict[str, Any]], sleep_seconds: float) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    entities = [("hotel", item) for item in hotels] + [("place", item) for item in places]

    for index, (kind, entity) in enumerate(entities, 1):
        if index > 1:
            time.sleep(sleep_seconds)
        query = str(entity.get("places_query") or "")
        try:
            candidates = search_text(api_key, query)
            decision = decide(entity, candidates)
            records.append({"kind": kind, "entity": entity, "decision": decision, "error": ""})
        except Exception as exc:
            records.append(
                {
                    "kind": kind,
                    "entity": entity,
                    "decision": MatchDecision(MatchStatus.ERROR, None, [], "Places API call failed"),
                    "error": safe_error_summary(exc),
                }
            )

    downgrade_duplicate_matches(records)
    return records


def downgrade_duplicate_matches(records: list[dict[str, Any]]) -> None:
    by_place_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        decision: MatchDecision = record["decision"]
        if decision.status == MatchStatus.MATCHED and decision.selected:
            by_place_id[decision.selected.place_id].append(record)

    for place_id, duplicates in by_place_id.items():
        names = {str(record["entity"].get("name") or "") for record in duplicates}
        if len(duplicates) <= 1 or len(names) <= 1:
            continue
        for record in duplicates:
            old: MatchDecision = record["decision"]
            record["decision"] = MatchDecision(
                MatchStatus.AMBIGUOUS,
                None,
                old.candidates,
                f"selected Place ID {place_id} is shared by multiple different entities",
            )


def should_update_address(entity: dict[str, Any], selected: MatchEvaluation) -> bool:
    current = str(entity.get("address") or "")
    if not current:
        return bool(selected.formatted_address)
    if any(term in current for term in VAGUE_ADDRESS_TERMS):
        return bool(selected.formatted_address)
    return False


def apply_matches(
    records: list[dict[str, Any]],
    hotels: list[dict[str, Any]],
    places: list[dict[str, Any]],
) -> dict[str, list[dict[str, str]] | int]:
    changed_place_ids = 0
    changed_coordinates = 0
    address_updates: list[dict[str, str]] = []
    name_updates: list[dict[str, str]] = []

    for record in records:
        decision: MatchDecision = record["decision"]
        if decision.status != MatchStatus.MATCHED or not decision.selected:
            continue
        entity = record["entity"]
        selected = decision.selected
        before_pid = str(entity.get("google_place_id") or "")
        before_location = dict(entity.get("location") or {})

        entity["google_place_id"] = selected.place_id
        entity["location"] = {
            "latitude": selected.latitude,
            "longitude": selected.longitude,
        }

        if not before_pid and selected.place_id:
            changed_place_ids += 1
        if before_location.get("latitude") is None and before_location.get("longitude") is None:
            if selected.latitude is not None and selected.longitude is not None:
                changed_coordinates += 1

        if "address" in entity and should_update_address(entity, selected):
            old_address = str(entity.get("address") or "")
            entity["address"] = selected.formatted_address
            address_updates.append(
                {
                    "id": entity_id(entity),
                    "name": str(entity.get("name") or ""),
                    "old": old_address,
                    "new": selected.formatted_address,
                }
            )

    return {
        "changed_place_ids": changed_place_ids,
        "changed_coordinates": changed_coordinates,
        "address_updates": address_updates,
        "name_updates": name_updates,
    }


def create_backup() -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = BACKUP_ROOT / stamp
    target.mkdir(parents=True, exist_ok=False)
    shutil.copy2(HOTELS_PATH, target / HOTELS_PATH.name)
    shutil.copy2(PLACES_PATH, target / PLACES_PATH.name)
    return target


def status_counts(records: list[dict[str, Any]]) -> Counter[str]:
    return Counter(record["decision"].status.value for record in records)


def selected_duplicate_summary(records: list[dict[str, Any]]) -> list[tuple[str, list[str]]]:
    by_place_id: dict[str, list[str]] = defaultdict(list)
    for record in records:
        decision: MatchDecision = record["decision"]
        if decision.selected:
            by_place_id[decision.selected.place_id].append(f"{entity_id(record['entity'])} {record['entity'].get('name')}")
    return [(place_id, values) for place_id, values in sorted(by_place_id.items()) if len(values) > 1]


def address_differences(records: list[dict[str, Any]]) -> list[dict[str, str]]:
    differences: list[dict[str, str]] = []
    for record in records:
        entity = record["entity"]
        decision: MatchDecision = record["decision"]
        if decision.status != MatchStatus.MATCHED or not decision.selected or "address" not in entity:
            continue
        current = str(entity.get("address") or "")
        returned = decision.selected.formatted_address
        if current and returned and current not in returned and returned not in current:
            differences.append(
                {
                    "id": entity_id(entity),
                    "name": str(entity.get("name") or ""),
                    "current": current,
                    "places": returned,
                }
            )
    return differences


def manual_review_items(records: list[dict[str, Any]]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for record in records:
        decision: MatchDecision = record["decision"]
        if decision.status == MatchStatus.MATCHED:
            continue
        entity = record["entity"]
        items.append(
            {
                "kind": record["kind"],
                "id": entity_id(entity),
                "name": str(entity.get("name") or ""),
                "status": decision.status.value,
                "reason": decision.reason if not record.get("error") else f"{decision.reason}: {record['error']}",
            }
        )
    return items


def top_disambiguation_cases(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for record in records:
        decision: MatchDecision = record["decision"]
        if len(decision.candidates) < 2:
            continue
        first, second = decision.candidates[0], decision.candidates[1]
        if first.name_score >= 0.75 and second.name_score >= 0.75:
            cases.append(
                {
                    "id": entity_id(record["entity"]),
                    "name": record["entity"].get("name"),
                    "status": decision.status.value,
                    "first": f"{first.display_name} / {first.primary_type or ','.join(first.types[:2])} / {round(first.total, 3)}",
                    "second": f"{second.display_name} / {second.primary_type or ','.join(second.types[:2])} / {round(second.total, 3)}",
                    "reason": decision.reason,
                }
            )
    return cases[:10]


def write_report(records: list[dict[str, Any]], apply_stats: dict[str, Any], mode: str, backup_path: Path | None) -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    counts = status_counts(records)
    hotels = [record for record in records if record["kind"] == "hotel"]
    places = [record for record in records if record["kind"] == "place"]
    hotel_counts = status_counts(hotels)
    place_counts = status_counts(places)
    errors = [record for record in records if record["decision"].status == MatchStatus.ERROR]

    lines = [
        "# Places Validation Report",
        "",
        f"- Execution time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"- Mode: {mode}",
        f"- Data files: `{HOTELS_PATH.relative_to(ROOT)}`, `{PLACES_PATH.relative_to(ROOT)}`",
        f"- Total entities: {len(records)}",
        f"- Matched: {counts.get(MatchStatus.MATCHED.value, 0)}",
        f"- Ambiguous: {counts.get(MatchStatus.AMBIGUOUS.value, 0)}",
        f"- Unmatched: {counts.get(MatchStatus.UNMATCHED.value, 0)}",
        f"- Error: {counts.get(MatchStatus.ERROR.value, 0)}",
        f"- Written Place IDs: {apply_stats.get('changed_place_ids', 0)}",
        f"- Written coordinate pairs: {apply_stats.get('changed_coordinates', 0)}",
        f"- Hotel success: {hotel_counts.get(MatchStatus.MATCHED.value, 0)}/{len(hotels)}",
        f"- Target-place success: {place_counts.get(MatchStatus.MATCHED.value, 0)}/{len(places)}",
        f"- Backup: `{backup_path.relative_to(ROOT)}`" if backup_path else "- Backup: not created in dry-run mode",
        "",
        "## Matching Rule Summary",
        "",
        "- Text Search (New) uses each record's `places_query` as `textQuery`.",
        "- Required fields: id, displayName, formattedAddress, location, types, primaryType.",
        "- Name score uses normalized containment or `SequenceMatcher` similarity.",
        "- City evidence requires Haikou in the formatted address.",
        "- Address evidence is tiered: road/door/building evidence is strong, sub-area evidence is medium, administrative district evidence is weak.",
        "- Hotel candidates must expose lodging-like Places types; target places use category-specific type hints.",
        "- Near ties, same-name ties, city mismatches, type mismatches, and weak evidence are kept for manual review.",
        "",
        "## Status By File",
        "",
        "| File | matched | ambiguous | unmatched | error |",
        "|---|---:|---:|---:|---:|",
        f"| hotels | {hotel_counts.get('matched', 0)} | {hotel_counts.get('ambiguous', 0)} | {hotel_counts.get('unmatched', 0)} | {hotel_counts.get('error', 0)} |",
        f"| target places | {place_counts.get('matched', 0)} | {place_counts.get('ambiguous', 0)} | {place_counts.get('unmatched', 0)} | {place_counts.get('error', 0)} |",
        "",
        "## Address Updates",
        "",
    ]

    address_updates = apply_stats.get("address_updates", [])
    if address_updates:
        for item in address_updates:
            lines.append(f"- `{item['id']}` {item['name']}: `{item['old']}` -> `{item['new']}`")
    else:
        lines.append("- None.")

    lines.extend(["", "## Name Updates", ""])
    name_updates = apply_stats.get("name_updates", [])
    if name_updates:
        for item in name_updates:
            lines.append(f"- `{item['id']}` {item['old']} -> {item['new']}")
    else:
        lines.append("- None.")

    lines.extend(["", "## Address Differences Not Auto-Rewritten", ""])
    differences = address_differences(records)
    if differences:
        for item in differences:
            lines.append(f"- `{item['id']}` {item['name']}: data `{item['current']}`; Places `{item['places']}`")
    else:
        lines.append("- None.")

    lines.extend(["", "## Same-name / Close-candidate Disambiguation Cases", ""])
    cases = top_disambiguation_cases(records)
    if cases:
        for item in cases:
            lines.append(f"- `{item['id']}` {item['name']} ({item['status']}): {item['first']} vs {item['second']}; {item['reason']}")
    else:
        lines.append("- None.")

    lines.extend(["", "## Potential Duplicate Place IDs", ""])
    duplicates = selected_duplicate_summary(records)
    if duplicates:
        for place_id, values in duplicates:
            lines.append(f"- `{place_id}`: {'; '.join(values)}")
    else:
        lines.append("- None.")

    lines.extend(["", "## Manual Review Items", ""])
    manual = manual_review_items(records)
    if manual:
        for item in manual:
            lines.append(f"- `{item['id']}` {item['name']} [{item['kind']}, {item['status']}]: {item['reason']}")
    else:
        lines.append("- None.")

    lines.extend(["", "## API Call Error Summary", ""])
    if errors:
        for record in errors:
            lines.append(f"- `{entity_id(record['entity'])}` {record['entity'].get('name')}: {record.get('error') or 'error'}")
    else:
        lines.append("- None.")

    lines.extend(["", "## Per-entity Results", ""])
    lines.extend(["| Type | ID | Name | Status | Selected display name | Address evidence | Type evidence | Reason |"])
    lines.extend(["|---|---|---|---|---|---|---|---|"])
    for record in records:
        entity = record["entity"]
        decision: MatchDecision = record["decision"]
        selected = decision.selected
        selected_name = selected.display_name if selected else ""
        address_level = selected.address_level if selected else ""
        type_evidence = str(selected.type_ok) if selected else ""
        lines.append(
            f"| {record['kind']} | `{entity_id(entity)}` | {entity.get('name')} | {decision.status.value} | {selected_name} | {address_level} | {type_evidence} | {decision.reason} |"
        )

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Offline Google Places enrichment for Haikou data.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Call Places and report decisions without modifying JSON.")
    mode.add_argument("--apply", action="store_true", help="Call Places, create backups, and write matched Place IDs/coordinates.")
    parser.add_argument("--sleep", type=float, default=DEFAULT_SLEEP_SECONDS, help="Delay between API calls in seconds.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_MAPS_API_KEY is not available in the environment.", file=sys.stderr)
        return 2

    hotels = load_json(HOTELS_PATH)
    places = load_json(PLACES_PATH)
    working_hotels = deepcopy(hotels)
    working_places = deepcopy(places)

    records = run_batch(api_key, working_hotels, working_places, args.sleep)
    counts = status_counts(records)
    print(
        "Places enrichment decisions: "
        f"matched={counts.get('matched', 0)}, "
        f"ambiguous={counts.get('ambiguous', 0)}, "
        f"unmatched={counts.get('unmatched', 0)}, "
        f"error={counts.get('error', 0)}"
    )

    backup_path: Path | None = None
    apply_stats: dict[str, Any] = {
        "changed_place_ids": 0,
        "changed_coordinates": 0,
        "address_updates": [],
        "name_updates": [],
    }
    mode = "dry-run"
    if args.apply:
        backup_path = create_backup()
        apply_stats = apply_matches(records, working_hotels, working_places)
        write_json(HOTELS_PATH, working_hotels)
        write_json(PLACES_PATH, working_places)
        mode = "apply"

    write_report(records, apply_stats, mode, backup_path)
    print(f"Report written to {REPORT_PATH.relative_to(ROOT)}")
    if backup_path:
        print(f"Backup written to {backup_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
