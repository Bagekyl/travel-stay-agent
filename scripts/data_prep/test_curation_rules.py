#!/usr/bin/env python3
"""Tests for Pass 3 curation policy helpers."""

from __future__ import annotations

import unittest

from curation_rules import (
    area_coverage_ok,
    can_replace_hotel,
    can_replace_place,
    duplicate_place_ids,
    price_distribution_ok,
    should_write_places_result,
)


class CurationRulesTest(unittest.TestCase):
    def test_infrastructure_cannot_be_replaced(self) -> None:
        original = {"place_id": "place_hak_xinhai_port", "name": "新海港", "category": "port", "area": "海口站/新海港方向"}
        replacement = {"name": "其他港口", "category": "port", "area": "海口站/新海港方向", "google_place_id": "pid"}
        self.assertFalse(can_replace_place(original, replacement))

    def test_hotel_replacement_requires_same_area_and_price_band(self) -> None:
        original = {"area": "美兰机场/江东新区", "mock_price_per_night": 360}
        replacement = {
            "area": "美兰机场/江东新区",
            "mock_price_per_night": 380,
            "google_place_id": "pid",
            "location": {"latitude": 19.9, "longitude": 110.4},
        }
        self.assertTrue(can_replace_hotel(original, replacement))

    def test_hotel_replacement_rejects_different_price_band(self) -> None:
        original = {"area": "美兰机场/江东新区", "mock_price_per_night": 360}
        replacement = {
            "area": "美兰机场/江东新区",
            "mock_price_per_night": 820,
            "google_place_id": "pid",
            "location": {"latitude": 19.9, "longitude": 110.4},
        }
        self.assertFalse(can_replace_hotel(original, replacement))

    def test_ordinary_poi_replacement_requires_same_area_and_category(self) -> None:
        original = {"place_id": "place_hak_old", "name": "旧公园", "category": "park", "area": "龙华区"}
        replacement = {"name": "新公园", "category": "park", "area": "龙华区", "google_place_id": "pid"}
        self.assertTrue(can_replace_place(original, replacement))

    def test_ordinary_poi_replacement_rejects_cross_category(self) -> None:
        original = {"place_id": "place_hak_old", "name": "旧公园", "category": "park", "area": "龙华区"}
        replacement = {"name": "购物中心", "category": "shopping", "area": "龙华区", "google_place_id": "pid"}
        self.assertFalse(can_replace_place(original, replacement))

    def test_abstract_region_can_be_replaced_by_concrete_poi(self) -> None:
        original = {"place_id": "place_hak_bay", "name": "海口湾", "category": "seaside", "area": "龙华区"}
        replacement = {"name": "海口湾公园", "category": "park", "area": "龙华区", "google_place_id": "pid"}
        self.assertTrue(can_replace_place(original, replacement))

    def test_duplicate_place_ids_are_reported(self) -> None:
        duplicates = duplicate_place_ids([
            {"hotel_id": "h1", "google_place_id": "pid"},
            {"place_id": "p1", "google_place_id": "pid"},
            {"place_id": "p2", "google_place_id": "other"},
        ])
        self.assertEqual(duplicates, {"pid": ["h1", "p1"]})

    def test_price_distribution_target(self) -> None:
        prices = [220, 260, 320, 360, 380, 390, 420, 520, 560, 650, 700, 760, 780, 820, 900, 1100, 1200, 1300, 1500, 1550, 1600, 1800, 1900, 2100]
        self.assertTrue(price_distribution_ok([{"mock_price_per_night": price} for price in prices]))

    def test_area_coverage_target(self) -> None:
        areas = ["龙华区", "美兰区", "海口东站周边", "美兰机场/江东新区", "西海岸", "海口站/新海港方向", "观澜湖"]
        self.assertTrue(area_coverage_ok([{"area": area} for area in areas]))

    def test_api_error_result_is_not_written(self) -> None:
        self.assertFalse(should_write_places_result("error", "pid", 20.0, 110.0))
        self.assertFalse(should_write_places_result("curation_matched", "pid", None, 110.0))
        self.assertTrue(should_write_places_result("curation_matched", "pid", 20.0, 110.0))


if __name__ == "__main__":
    unittest.main()
