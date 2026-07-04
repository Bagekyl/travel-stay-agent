#!/usr/bin/env python3
"""Unit tests for second-pass Places review logic."""

from __future__ import annotations

import unittest

from places_reviewer import ReviewStatus, decide_second_pass


def candidate(
    name: str,
    address: str,
    place_id: str,
    types: list[str] | None = None,
    primary_type: str | None = None,
    lat: float = 20.0,
    lon: float = 110.0,
) -> dict:
    place_types = types or ["hotel", "lodging"]
    return {
        "id": place_id,
        "displayName": {"text": name},
        "formattedAddress": address,
        "location": {"latitude": lat, "longitude": lon},
        "types": place_types,
        "primaryType": primary_type or place_types[0],
    }


class PlacesReviewerTest(unittest.TestCase):
    def test_multiple_queries_same_place_id_matches(self) -> None:
        entity = {"place_id": "p1", "name": "海口钟楼", "category": "urban_landmark", "area": "龙华区"}
        results = [
            ("海口钟楼 海口", [candidate("海口钟楼", "海南省海口市龙华区", "right", ["tourist_attraction"], "tourist_attraction")]),
            ("海口钟楼 地标 海口", [candidate("海口钟楼", "海南省海口市龙华区", "right", ["tourist_attraction"], "tourist_attraction")]),
        ]
        decision = decide_second_pass(entity, "candidate evidence is not strong enough", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.REVIEW_MATCHED)

    def test_stable_cross_query_candidate_can_beat_single_query_first(self) -> None:
        entity = {"place_id": "p1", "name": "海口钟楼", "category": "urban_landmark", "area": "龙华区"}
        wrong = candidate("钟楼商店", "海南省海口市龙华区", "wrong", ["store"], "store")
        right = candidate("海口钟楼", "海南省海口市龙华区", "right", ["tourist_attraction"], "tourist_attraction")
        results = [
            ("海口钟楼 海口", [wrong, right]),
            ("海口钟楼 地标 海口", [right]),
            ("海口钟楼 龙华区", [right]),
        ]
        decision = decide_second_pass(entity, "candidate evidence is not strong enough", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.REVIEW_MATCHED)
        self.assertEqual(decision.selected.place_id, "right")

    def test_same_brand_different_branch_does_not_match(self) -> None:
        entity = {
            "hotel_id": "h1",
            "name": "全季酒店海口国贸中心店",
            "brand": "JI Hotel",
            "address": "海口市龙华区龙昆北路51号",
            "area": "龙华区",
            "sub_area": "国贸CBD",
        }
        results = [
            ("全季酒店海口国贸中心店 海口", [candidate("全季酒店", "海南省海口市龙华区海垦南路7号", "branch")]),
            ("全季 国贸CBD 海口", [candidate("全季酒店", "海南省海口市龙华区海垦南路7号", "branch")]),
        ]
        decision = decide_second_pass(entity, "best candidate name score is below threshold", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.STILL_AMBIGUOUS)

    def test_same_admin_area_with_address_conflict_does_not_match(self) -> None:
        entity = {
            "hotel_id": "h1",
            "name": "汉庭酒店海口省政府国兴大道店",
            "brand": "Hanting",
            "address": "海口市美兰区美祥路16号",
            "area": "美兰区",
            "sub_area": "国兴CBD",
        }
        results = [
            ("汉庭酒店海口省政府国兴大道店 海口", [candidate("汉庭酒店", "海南省海口市美兰区国兴大道1号", "hanting")]),
            ("汉庭 国兴CBD 海口", [candidate("汉庭酒店", "海南省海口市美兰区国兴大道1号", "hanting")]),
        ]
        decision = decide_second_pass(entity, "best candidate has an explicit address that conflicts with the data record", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.STILL_AMBIGUOUS)

    def test_type_correct_candidate_beats_same_name_wrong_type(self) -> None:
        entity = {"place_id": "p1", "name": "美兰站", "category": "railway_hub", "area": "美兰机场/江东新区"}
        wrong = candidate("美兰站", "海南省海口市美兰区", "poi", ["point_of_interest"], "point_of_interest")
        right = candidate("美兰站", "海南省海口市美兰区", "station", ["train_station", "transit_station"], "train_station")
        results = [
            ("美兰站 海口", [wrong, right]),
            ("美兰站 火车站 海口", [right, wrong]),
            ("美兰站 铁路车站 海口", [right]),
        ]
        decision = decide_second_pass(entity, "best candidate type does not match the entity role", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.REVIEW_MATCHED)
        self.assertEqual(decision.selected.place_id, "station")

    def test_outside_city_candidate_rejected(self) -> None:
        entity = {"place_id": "p1", "name": "海口站", "category": "railway_hub", "area": "海口站/新海港方向"}
        results = [
            ("海口站 海口", [candidate("海口站", "广东省广州市越秀区", "outside", ["train_station"], "train_station")]),
            ("海口站 火车站 海口", [candidate("海口站", "广东省广州市越秀区", "outside", ["train_station"], "train_station")]),
        ]
        decision = decide_second_pass(entity, "best candidate is outside Haikou", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.STILL_AMBIGUOUS)

    def test_equal_same_name_candidates_remain_ambiguous(self) -> None:
        entity = {"place_id": "p1", "name": "海南大学", "category": "campus", "area": "美兰区"}
        a = candidate("海南大学", "海南省海口市美兰区人民大道58号", "a", ["university"], "university")
        b = candidate("海南大学", "海南省海口市美兰区海甸五西路", "b", ["university"], "university")
        results = [("海南大学 海口", [a, b]), ("海南大学 海甸岛", [b, a])]
        decision = decide_second_pass(entity, "top candidates have the same normalized name and near-tie scores", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.STILL_AMBIGUOUS)

    def test_address_conflict_can_match_when_address_query_confirms_same_candidate(self) -> None:
        entity = {
            "hotel_id": "h1",
            "name": "测试酒店",
            "brand": "Independent",
            "address": "海口市龙华区旧路1号",
            "area": "龙华区",
            "sub_area": "旧路",
            "official_address_evidence": True,
        }
        right = candidate("测试酒店", "海南省海口市龙华区新路2号", "right")
        results = [
            ("测试酒店 海口", [right]),
            ("测试酒店 旧路1号 海口", [right]),
            ("测试酒店 海口市龙华区旧路1号", [right]),
        ]
        decision = decide_second_pass(entity, "best candidate has an explicit address that conflicts with the data record", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.REVIEW_MATCHED)
        self.assertIsNotNone(decision.address_update)

    def test_no_query_results_is_still_ambiguous(self) -> None:
        entity = {"place_id": "p1", "name": "不存在地点", "category": "park", "area": "龙华区"}
        results = [("不存在地点 海口", [])]
        decision = decide_second_pass(entity, "candidate evidence is not strong enough", [q for q, _ in results], results)
        self.assertEqual(decision.status, ReviewStatus.STILL_AMBIGUOUS)

    def test_api_error_without_candidates_is_review_error(self) -> None:
        entity = {"place_id": "p1", "name": "不存在地点", "category": "park", "area": "龙华区"}
        results = [("不存在地点 海口", [])]
        decision = decide_second_pass(entity, "candidate evidence is not strong enough", [q for q, _ in results], results, ["timeout"])
        self.assertEqual(decision.status, ReviewStatus.REVIEW_ERROR)


if __name__ == "__main__":
    unittest.main()
