# Places Second-pass Review

- Execution time: 2026-07-04 17:30:09 UTC
- Mode: apply
- First-pass report: `reports/places_validation_report.md`
- First-pass summary: 48 total, 17 matched, 31 ambiguous, 0 unmatched, 0 error
- Second-pass processed entities: 31
- Original ambiguous entities: 31
- API query variants executed: 115
- review_matched: 4
- still_ambiguous: 27
- review_error: 0
- Final total matched: 21
- Final hotel completion: 7/24 matched, 17/24 ambiguous
- Final target-place completion: 14/24 matched, 10/24 ambiguous
- Written Place IDs: 4
- Written coordinate pairs: 4
- Backup: `backups/20260705-013009`

## First-pass Ambiguous Classification

- address_conflict: 5 (mock_hk_003, mock_hk_005, mock_hk_006, mock_hk_012, mock_hk_014)
- low_name_score: 8 (mock_hk_004, mock_hk_009, mock_hk_010, mock_hk_013, mock_hk_017, mock_hk_018, mock_hk_022, place_hak_guomao)
- type_mismatch: 5 (mock_hk_008, mock_hk_016, place_hak_meilan_station, place_hak_xinhai_port, place_hak_bay)
- near_tie_or_same_name: 2 (place_hak_convention, place_hak_hainan_university)
- weak_evidence: 8 (place_hak_railway_station, place_hak_clocktower, place_hak_hairui, place_hak_cloud_library, place_hak_baishamen, place_hak_dutyfree, place_hak_missionhills, place_hak_volcano)
- outside_city_candidate: 3 (mock_hk_011, mock_hk_015, mock_hk_023)
- other: 0

## Review Strategies

- address_conflict: require repeated top-ranked evidence, an address-bearing query variant, type consistency, and a clear aggregate gap before writing Place ID or revising address.
- low_name_score: keep the first-pass name threshold intact and add core-name similarity plus brand consistency as supporting evidence.
- type_mismatch: rerun more precise variants and require repeated top-ranked type-correct evidence.
- near_tie_or_same_name: aggregate candidates by Place ID and require clear separation across query variants.
- weak_evidence: require repeated top placement or three-query consistency; weak administrative area evidence remains insufficient by itself.
- outside_city_candidate: require repeated top-ranked Haikou candidate; out-of-city candidates remain rejected.

## Successful Second-pass Matches

### `place_hak_baishamen` 白沙门公园
- Type: place
- First-pass reason: weak_evidence / candidate evidence is not strong enough
- Query variants: 白沙门公园 海口; 白沙门公园 公园 海口; 白沙门公园 美兰区 海口
- Evidence: Place ID `ChIJVVWWalTNUzER_sTHR5L9CLI`, display `白沙门公园`, address `海南省海口市美兰区38CP+F39 邮政编码: 570208`, types `park`, appearances 3, top1 2, top3 3, support 10.22, core-name 0.92
- Decision: multi-query evidence supports a single type-correct Haikou candidate

### `place_hak_dutyfree` 中免海口国际免税城
- Type: place
- First-pass reason: weak_evidence / candidate evidence is not strong enough
- Query variants: 中免海口国际免税城 海口; 中免海口国际免税城 购物中心 海口; 中免海口国际免税城 西海岸 海口; 中免海口国际免税城 商场 海口
- Evidence: Place ID `ChIJ7zi4b6IvUjERcrkvQOyuFAw`, display `海口市国际免税城`, address `海南省海口市秀英区25X7+PXF 邮政编码: 570312`, types `shopping_mall`, appearances 4, top1 4, top3 4, support 13.89, core-name 0.67
- Decision: multi-query evidence supports a single type-correct Haikou candidate

### `place_hak_convention` 海南国际会展中心
- Type: place
- First-pass reason: near_tie_or_same_name / top candidates have the same normalized name and near-tie scores
- Query variants: 海南国际会展中心 海口; 海南国际会展中心 会展中心 海口; 海南国际会展中心 西海岸 海口; 海南国际会展中心 展馆 海口
- Evidence: Place ID `ChIJrVykCkkuUjERAOtTYfodqoo`, display `海南国际会展中心`, address `海南省海口市秀英区滨海大道258号 邮政编码: 570312`, types `convention_center`, appearances 4, top1 4, top3 4, support 14.27, core-name 0.92
- Decision: multi-query evidence supports a single type-correct Haikou candidate

### `place_hak_hainan_university` 海南大学
- Type: place
- First-pass reason: near_tie_or_same_name / top candidates have the same normalized name and near-tie scores
- Query variants: 海南大学 海口; 海南大学 大学 海口; 海南大学 美兰区 海口; 海南大学 校区 海口
- Evidence: Place ID `ChIJP19dnVQtUjERzMVh6gfXSyQ`, display `海南大学`, address `海口市美兰区第一食堂2楼 邮政编码: 570228`, types `university`, appearances 4, top1 4, top3 4, support 14.37, core-name 0.92
- Decision: multi-query evidence supports a single type-correct Haikou candidate


## Address Updates

- None.

## Still Needs Manual Review

- `mock_hk_003` 全季酒店海口国贸中心店 [hotel, address_conflict]: address conflict requires official-source evidence before automatic address revision
- `mock_hk_004` 海口索菲特酒店 [hotel, low_name_score]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_005` 骑楼老街还客1921精品民宿 [hotel, address_conflict]: address conflict requires official-source evidence before automatic address revision
- `mock_hk_006` 如家酒店·neo海口骑楼老街东湖路店 [hotel, address_conflict]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_008` 海口华彩华邑酒店 [hotel, type_mismatch]: best aggregate lacks city or type consistency
- `mock_hk_009` 全季海口海南大学海甸岛酒店 [hotel, low_name_score]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_010` 海口美兰温德姆花园酒店 [hotel, low_name_score]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_011` 海口雅诗阁服务公寓 [hotel, outside_city_candidate]: best aggregate lacks city or type consistency
- `mock_hk_012` 汉庭酒店海口省政府国兴大道店 [hotel, address_conflict]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_013` 海口高铁东站学院路亚朵酒店 [hotel, low_name_score]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_014` 格林豪泰酒店海口高铁东站凤翔东路店 [hotel, address_conflict]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_015` 格林东方酒店海口高铁东站店 [hotel, outside_city_candidate]: best aggregate lacks city or type consistency
- `mock_hk_016` 美兰机场逸唐飞行酒店 [hotel, type_mismatch]: best aggregate lacks city or type consistency
- `mock_hk_017` 海口美兰国际机场酒店 [hotel, low_name_score]: best aggregate lacks city or type consistency
- `mock_hk_018` 海口美兰星七天酒店 [hotel, low_name_score]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_022` 海口站前旅馆海口站店 [hotel, low_name_score]: best aggregate lacks sufficient core-name or brand identity
- `mock_hk_023` 海口丽思卡尔顿酒店 [hotel, outside_city_candidate]: best aggregate lacks sufficient core-name or brand identity
- `place_hak_meilan_station` 美兰站 [place, type_mismatch]: best aggregate lacks city or type consistency
- `place_hak_railway_station` 海口站 [place, weak_evidence]: best aggregate lacks sufficient core-name or brand identity
- `place_hak_xinhai_port` 新海港 [place, type_mismatch]: best aggregate lacks city or type consistency
- `place_hak_clocktower` 海口钟楼 [place, weak_evidence]: best aggregate lacks sufficient core-name or brand identity
- `place_hak_hairui` 海瑞文化公园 [place, weak_evidence]: best aggregate lacks sufficient core-name or brand identity
- `place_hak_cloud_library` 云洞图书馆 [place, weak_evidence]: best aggregate lacks sufficient core-name or brand identity
- `place_hak_bay` 海口湾 [place, type_mismatch]: best aggregate lacks city or type consistency
- `place_hak_guomao` 国贸商圈 [place, low_name_score]: best aggregate lacks sufficient core-name or brand identity
- `place_hak_missionhills` 观澜湖度假区 [place, weak_evidence]: selected Place ID is already used by first-pass matched entity `mock_hk_024`
- `place_hak_volcano` 雷琼海口火山群世界地质公园 [place, weak_evidence]: best aggregate lacks sufficient core-name or brand identity

## First-pass Possible Issues

- `place_hak_missionhills` selected first-pass Place ID `ChIJZ-rCSsgqUjERBC5b_0dxJP4` already owned by `mock_hk_024`

## API Error Summary

- None.

## Per-entity Results

| Type | ID | Name | First-pass category | Second-pass status | Query count | Selected | Reason |
|---|---|---|---|---|---:|---|---|
| hotel | `mock_hk_003` | 全季酒店海口国贸中心店 | address_conflict | still_ambiguous | 4 |  | address conflict requires official-source evidence before automatic address revision |
| hotel | `mock_hk_004` | 海口索菲特酒店 | low_name_score | still_ambiguous | 3 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_005` | 骑楼老街还客1921精品民宿 | address_conflict | still_ambiguous | 4 |  | address conflict requires official-source evidence before automatic address revision |
| hotel | `mock_hk_006` | 如家酒店·neo海口骑楼老街东湖路店 | address_conflict | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_008` | 海口华彩华邑酒店 | type_mismatch | still_ambiguous | 3 |  | best aggregate lacks city or type consistency |
| hotel | `mock_hk_009` | 全季海口海南大学海甸岛酒店 | low_name_score | still_ambiguous | 3 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_010` | 海口美兰温德姆花园酒店 | low_name_score | still_ambiguous | 3 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_011` | 海口雅诗阁服务公寓 | outside_city_candidate | still_ambiguous | 4 |  | best aggregate lacks city or type consistency |
| hotel | `mock_hk_012` | 汉庭酒店海口省政府国兴大道店 | address_conflict | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_013` | 海口高铁东站学院路亚朵酒店 | low_name_score | still_ambiguous | 3 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_014` | 格林豪泰酒店海口高铁东站凤翔东路店 | address_conflict | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_015` | 格林东方酒店海口高铁东站店 | outside_city_candidate | still_ambiguous | 4 |  | best aggregate lacks city or type consistency |
| hotel | `mock_hk_016` | 美兰机场逸唐飞行酒店 | type_mismatch | still_ambiguous | 3 |  | best aggregate lacks city or type consistency |
| hotel | `mock_hk_017` | 海口美兰国际机场酒店 | low_name_score | still_ambiguous | 4 |  | best aggregate lacks city or type consistency |
| hotel | `mock_hk_018` | 海口美兰星七天酒店 | low_name_score | still_ambiguous | 3 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_022` | 海口站前旅馆海口站店 | low_name_score | still_ambiguous | 3 |  | best aggregate lacks sufficient core-name or brand identity |
| hotel | `mock_hk_023` | 海口丽思卡尔顿酒店 | outside_city_candidate | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| place | `place_hak_meilan_station` | 美兰站 | type_mismatch | still_ambiguous | 4 |  | best aggregate lacks city or type consistency |
| place | `place_hak_railway_station` | 海口站 | weak_evidence | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| place | `place_hak_xinhai_port` | 新海港 | type_mismatch | still_ambiguous | 4 |  | best aggregate lacks city or type consistency |
| place | `place_hak_clocktower` | 海口钟楼 | weak_evidence | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| place | `place_hak_hairui` | 海瑞文化公园 | weak_evidence | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| place | `place_hak_cloud_library` | 云洞图书馆 | weak_evidence | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| place | `place_hak_bay` | 海口湾 | type_mismatch | still_ambiguous | 4 |  | best aggregate lacks city or type consistency |
| place | `place_hak_baishamen` | 白沙门公园 | weak_evidence | review_matched | 3 | ChIJVVWWalTNUzER_sTHR5L9CLI | multi-query evidence supports a single type-correct Haikou candidate |
| place | `place_hak_guomao` | 国贸商圈 | low_name_score | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
| place | `place_hak_dutyfree` | 中免海口国际免税城 | weak_evidence | review_matched | 4 | ChIJ7zi4b6IvUjERcrkvQOyuFAw | multi-query evidence supports a single type-correct Haikou candidate |
| place | `place_hak_convention` | 海南国际会展中心 | near_tie_or_same_name | review_matched | 4 | ChIJrVykCkkuUjERAOtTYfodqoo | multi-query evidence supports a single type-correct Haikou candidate |
| place | `place_hak_hainan_university` | 海南大学 | near_tie_or_same_name | review_matched | 4 | ChIJP19dnVQtUjERzMVh6gfXSyQ | multi-query evidence supports a single type-correct Haikou candidate |
| place | `place_hak_missionhills` | 观澜湖度假区 | weak_evidence | still_ambiguous | 4 |  | selected Place ID is already used by first-pass matched entity `mock_hk_024` |
| place | `place_hak_volcano` | 雷琼海口火山群世界地质公园 | weak_evidence | still_ambiguous | 4 |  | best aggregate lacks sufficient core-name or brand identity |
