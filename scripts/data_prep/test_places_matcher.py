#!/usr/bin/env python3
"""Unit tests for deterministic Places matching rules."""

from __future__ import annotations

import unittest

from places_matcher import MatchStatus, decide


def candidate(
    name: str,
    address: str,
    place_id: str = "pid",
    types: list[str] | None = None,
    primary_type: str = "",
) -> dict:
    return {
        "id": place_id,
        "displayName": {"text": name},
        "formattedAddress": address,
        "location": {"latitude": 20.0, "longitude": 110.0},
        "types": types or ["hotel", "lodging"],
        "primaryType": primary_type or (types or ["hotel"])[0],
    }


class PlacesMatcherTest(unittest.TestCase):
    def test_single_clear_hotel_candidate_matches(self) -> None:
        entity = {
            "hotel_id": "h1",
            "name": "海口希尔顿酒店",
            "address": "海口市龙华区滨海大道109-9号",
            "area": "龙华区",
            "sub_area": "滨海大道",
        }
        decision = decide(entity, [candidate("海口希尔顿酒店", "海南省海口市龙华区滨海大道109-9号")])
        self.assertEqual(decision.status, MatchStatus.MATCHED)

    def test_same_name_different_type_uses_type_to_disambiguate(self) -> None:
        entity = {"place_id": "p1", "name": "海口美兰国际机场", "category": "airport", "area": "美兰机场/江东新区"}
        decision = decide(
            entity,
            [
                candidate("海口美兰国际机场", "海南省海口市美兰区WFQ6+CV6", "airport", ["airport", "international_airport"], "international_airport"),
                candidate("海口美兰国际机场", "海南省海口市美兰区田野兔乡", "poi", ["point_of_interest"], "point_of_interest"),
            ],
        )
        self.assertEqual(decision.status, MatchStatus.MATCHED)
        self.assertEqual(decision.selected.place_id, "airport")

    def test_same_name_near_tie_stays_ambiguous(self) -> None:
        entity = {"place_id": "p1", "name": "测试公园", "category": "park", "area": "龙华区"}
        decision = decide(
            entity,
            [
                candidate("测试公园", "海南省海口市龙华区A", "a", ["park"], "park"),
                candidate("测试公园", "海南省海口市龙华区B", "b", ["park"], "park"),
            ],
        )
        self.assertEqual(decision.status, MatchStatus.AMBIGUOUS)

    def test_city_mismatch_stays_ambiguous(self) -> None:
        entity = {"place_id": "p1", "name": "骑楼老街", "category": "historical_site", "area": "龙华区"}
        decision = decide(entity, [candidate("骑楼老街", "海南省三亚市吉阳区", "wrong", ["tourist_attraction"], "tourist_attraction")])
        self.assertEqual(decision.status, MatchStatus.AMBIGUOUS)

    def test_no_candidates_is_unmatched(self) -> None:
        decision = decide({"place_id": "p1", "name": "不存在地点", "category": "park"}, [])
        self.assertEqual(decision.status, MatchStatus.UNMATCHED)

    def test_hotel_wrong_type_stays_ambiguous(self) -> None:
        entity = {
            "hotel_id": "h1",
            "name": "海口希尔顿酒店",
            "address": "海口市龙华区滨海大道109-9号",
            "area": "龙华区",
            "sub_area": "滨海大道",
        }
        decision = decide(
            entity,
            [candidate("海口希尔顿酒店", "海南省海口市龙华区滨海大道109-9号", "bad", ["restaurant"], "restaurant")],
        )
        self.assertEqual(decision.status, MatchStatus.AMBIGUOUS)

    def test_short_generic_branch_name_stays_ambiguous_without_address(self) -> None:
        entity = {
            "hotel_id": "h1",
            "name": "全季酒店海口国贸中心店",
            "address": "海口市龙华区龙昆北路51号",
            "area": "龙华区",
            "sub_area": "国贸CBD",
        }
        decision = decide(
            entity,
            [candidate("全季酒店", "海南省海口市龙华区海垦南路7号", "generic")],
        )
        self.assertEqual(decision.status, MatchStatus.AMBIGUOUS)

    def test_explicit_address_conflict_stays_ambiguous(self) -> None:
        entity = {
            "hotel_id": "h1",
            "name": "骑楼老街还客1921精品民宿",
            "address": "海口市龙华区中山路21号",
            "area": "龙华区",
            "sub_area": "骑楼老街",
        }
        decision = decide(
            entity,
            [candidate("骑楼还客1921精品民宿", "海南省海口市琼山区中山南路21号", "conflict")],
        )
        self.assertEqual(decision.status, MatchStatus.AMBIGUOUS)

    def test_strong_address_disambiguates_similar_hotel_names(self) -> None:
        entity = {
            "hotel_id": "h1",
            "name": "海口希尔顿酒店",
            "address": "海口市龙华区滨海大道109-9号",
            "area": "龙华区",
            "sub_area": "滨海大道",
        }
        decision = decide(
            entity,
            [
                candidate("海口希尔顿酒店", "海南省海口市龙华区滨海大道109-9号", "right"),
                candidate("海口鲁能希尔顿酒店", "海南省海口市美兰区琼山大道2号", "wrong"),
            ],
        )
        self.assertEqual(decision.status, MatchStatus.MATCHED)
        self.assertEqual(decision.selected.place_id, "right")


if __name__ == "__main__":
    unittest.main()
