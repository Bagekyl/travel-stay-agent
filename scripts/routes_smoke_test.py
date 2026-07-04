#!/usr/bin/env python3
"""Minimal Google Routes API smoke test for enriched Place IDs."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
HOTELS_PATH = ROOT / "data" / "mock_hotels_haikou.json"
PLACES_PATH = ROOT / "data" / "haikou_target_places.json"
REPORT_PATH = ROOT / "reports" / "routes_smoke_test_report.md"

COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
COMPUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"


def load_records() -> tuple[list[dict], list[dict]]:
    with HOTELS_PATH.open("r", encoding="utf-8") as f:
        hotels = json.load(f)
    with PLACES_PATH.open("r", encoding="utf-8") as f:
        places = json.load(f)
    return hotels, places


def find_by_name(records: list[dict], name: str) -> dict:
    for record in records:
        if record.get("name") == name:
            return record
    raise KeyError(f"record not found: {name}")


def require_places_ready(hotels: list[dict], places: list[dict]) -> None:
    if len(hotels) != 24 or len(places) != 24:
        raise ValueError(f"expected 24 hotels and 24 places, got {len(hotels)} and {len(places)}")
    for record in hotels + places:
        name = record.get("name", "<unknown>")
        location = record.get("location") or {}
        if not record.get("google_place_id"):
            raise ValueError(f"missing google_place_id: {name}")
        if location.get("latitude") is None or location.get("longitude") is None:
            raise ValueError(f"missing location: {name}")


def post_json(url: str, body: dict, field_mask: str, api_key: str) -> object:
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Routes API HTTP {exc.code}: {detail[:500]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Routes API network error: {exc.reason}") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        elements = []
        for line in raw.splitlines():
            line = line.strip()
            if line:
                elements.append(json.loads(line))
        return elements


def parse_duration_seconds(value: str | None) -> float | None:
    if not value or not value.endswith("s"):
        return None
    return float(value[:-1])


def minutes(value: str | None) -> float | None:
    seconds = parse_duration_seconds(value)
    if seconds is None:
        return None
    return seconds / 60


def waypoint(record: dict) -> dict:
    return {"placeId": record["google_place_id"]}


def compute_single_route(origin: dict, destination: dict, api_key: str) -> dict:
    body = {
        "origin": waypoint(origin),
        "destination": waypoint(destination),
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "languageCode": "zh-CN",
        "units": "METRIC",
    }
    data = post_json(COMPUTE_ROUTES_URL, body, "routes.duration,routes.distanceMeters", api_key)
    routes = data.get("routes", []) if isinstance(data, dict) else []
    if not routes:
        raise RuntimeError("computeRoutes returned no routes")
    route = routes[0]
    return {
        "origin": origin["name"],
        "destination": destination["name"],
        "distanceMeters": route.get("distanceMeters"),
        "duration": route.get("duration"),
    }


def compute_matrix(origins: list[dict], destinations: list[dict], api_key: str) -> list[dict]:
    body = {
        "origins": [{"waypoint": waypoint(record)} for record in origins],
        "destinations": [{"waypoint": waypoint(record)} for record in destinations],
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "languageCode": "zh-CN",
        "units": "METRIC",
    }
    field_mask = "originIndex,destinationIndex,distanceMeters,duration,condition,status"
    data = post_json(COMPUTE_MATRIX_URL, body, field_mask, api_key)
    if isinstance(data, dict) and "error" in data:
        raise RuntimeError(f"computeRouteMatrix error: {data['error']}")
    if not isinstance(data, list):
        raise RuntimeError(f"computeRouteMatrix returned unexpected payload type: {type(data).__name__}")
    return data


def format_status(element: dict) -> str:
    condition = element.get("condition", "")
    status = element.get("status")
    if isinstance(status, dict) and status:
        status_text = status.get("message") or str(status.get("code", ""))
    else:
        status_text = ""
    return condition if not status_text else f"{condition}/{status_text}"


def print_single(result: dict) -> None:
    distance_m = result["distanceMeters"]
    duration = result["duration"]
    print("Single route smoke test")
    print(f"- origin name: {result['origin']}")
    print(f"- destination name: {result['destination']}")
    print(f"- distanceMeters: {distance_m}")
    print(f"- distance_km: {distance_m / 1000:.2f}")
    print(f"- duration: {duration}")
    print(f"- duration_minutes: {minutes(duration):.1f}")


def print_matrix(origins: list[dict], destinations: list[dict], elements: list[dict]) -> list[dict]:
    rows = []
    print("\n3x3 route matrix")
    print("| 酒店 | 目标地点 | 距离 km | 驾车时间 min | condition/status |")
    print("|---|---|---:|---:|---|")
    for element in sorted(elements, key=lambda item: (item.get("originIndex", -1), item.get("destinationIndex", -1))):
        origin = origins[element["originIndex"]]
        destination = destinations[element["destinationIndex"]]
        distance_m = element.get("distanceMeters")
        duration = element.get("duration")
        row = {
            "hotel": origin["name"],
            "place": destination["name"],
            "distance_km": None if distance_m is None else distance_m / 1000,
            "duration_minutes": minutes(duration),
            "status": format_status(element),
        }
        rows.append(row)
        distance_text = "" if row["distance_km"] is None else f"{row['distance_km']:.2f}"
        duration_text = "" if row["duration_minutes"] is None else f"{row['duration_minutes']:.1f}"
        print(f"| {row['hotel']} | {row['place']} | {distance_text} | {duration_text} | {row['status']} |")
    return rows


def write_report(single: dict, matrix_rows: list[dict], matrix_count: int) -> None:
    single_minutes = minutes(single["duration"])
    lines = [
        "# Routes API Smoke Test Report",
        "",
        f"- Execution time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "- API types: `computeRoutes`, `computeRouteMatrix`",
        "- Travel mode: DRIVE",
        "- Routing preference: TRAFFIC_AWARE",
        "- Base data modified: No",
        "",
        "## Single Route",
        "",
        f"- Origin: {single['origin']}",
        f"- Destination: {single['destination']}",
        f"- Distance meters: {single['distanceMeters']}",
        f"- Distance km: {single['distanceMeters'] / 1000:.2f}",
        f"- Duration: {single['duration']}",
        f"- Duration minutes: {single_minutes:.1f}",
        "",
        "## 3x3 Route Matrix",
        "",
        "| 酒店 | 目标地点 | 距离 km | 驾车时间 min | condition/status |",
        "|---|---|---:|---:|---|",
    ]
    for row in matrix_rows:
        distance_text = "" if row["distance_km"] is None else f"{row['distance_km']:.2f}"
        duration_text = "" if row["duration_minutes"] is None else f"{row['duration_minutes']:.1f}"
        lines.append(f"| {row['hotel']} | {row['place']} | {distance_text} | {duration_text} | {row['status']} |")
    lines.extend([
        "",
        "## Result",
        "",
        "- Place ID -> Routes API validation: Success",
        f"- Matrix elements parsed: {matrix_count}",
        "- Valid route elements: 9/9",
        "- Exceptions found: None",
    ])
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_MAPS_API_KEY is not set", file=sys.stderr)
        return 2

    try:
        hotels, places = load_records()
        require_places_ready(hotels, places)

        hilton = find_by_name(hotels, "海口希尔顿酒店")
        qilou = find_by_name(places, "骑楼老街")
        single = compute_single_route(hilton, qilou, api_key)
        print_single(single)

        origins = [
            hilton,
            find_by_name(hotels, "海口东站希尔顿欢朋酒店"),
            find_by_name(hotels, "海口万豪酒店"),
        ]
        destinations = [
            qilou,
            find_by_name(places, "海口东站"),
            find_by_name(places, "海口美兰国际机场"),
        ]
        matrix = compute_matrix(origins, destinations, api_key)
        matrix_rows = print_matrix(origins, destinations, matrix)
        if len(matrix) != 9:
            raise RuntimeError(f"expected 9 route matrix elements, got {len(matrix)}")
        if any(row["distance_km"] is None or row["duration_minutes"] is None for row in matrix_rows):
            raise RuntimeError("one or more route matrix elements are missing distance or duration")
        write_report(single, matrix_rows, len(matrix))
        print(f"\nReport written: {REPORT_PATH.relative_to(ROOT)}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
