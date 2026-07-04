# Places Validation Report

- Execution time: 2026-07-04 17:06:47 UTC
- Mode: apply
- Data files: `data/mock_hotels_haikou.json`, `data/haikou_target_places.json`
- Total entities: 48
- Matched: 17
- Ambiguous: 31
- Unmatched: 0
- Error: 0
- Written Place IDs: 17
- Written coordinate pairs: 17
- Hotel success: 7/24
- Target-place success: 10/24
- Backup: `backups/20260705-010647`

## Matching Rule Summary

- Text Search (New) uses each record's `places_query` as `textQuery`.
- Required fields: id, displayName, formattedAddress, location, types, primaryType.
- Name score uses normalized containment or `SequenceMatcher` similarity.
- City evidence requires Haikou in the formatted address.
- Address evidence is tiered: road/door/building evidence is strong, sub-area evidence is medium, administrative district evidence is weak.
- Hotel candidates must expose lodging-like Places types; target places use category-specific type hints.
- Near ties, same-name ties, city mismatches, type mismatches, and weak evidence are kept for manual review.

## Status By File

| File | matched | ambiguous | unmatched | error |
|---|---:|---:|---:|---:|
| hotels | 7 | 17 | 0 | 0 |
| target places | 10 | 14 | 0 | 0 |

## Address Updates

- None.

## Name Updates

- None.

## Address Differences Not Auto-Rewritten

- `mock_hk_002` 海口朗廷酒店: data `海口市龙华区滨海大道77号中环国际广场`; Places `海口市龙华区中环国际广场 滨海大道77号 邮政编码: 570105`
- `mock_hk_019` 海口万豪酒店: data `海口市秀英区滨海大道292号`; Places `中国海口市秀英区 邮政编码: 570312`
- `mock_hk_021` 海口大华西海岸智选假日酒店: data `海口市秀英区滨海大道197号`; Places `中国海口市秀英区 邮政编码: 570314`
- `mock_hk_024` 海口观澜湖度假酒店: data `海口市龙华区观澜湖大道1号海口观澜湖旅游度假区`; Places `中国海口市龙华区 邮政编码: 571155`

## Same-name / Close-candidate Disambiguation Cases

- `mock_hk_001` 海口希尔顿酒店 (matched): 海口希尔顿酒店 / hotel / 1.56 vs 海口鲁能希尔顿酒店 / hotel / 1.265; best candidate passed name, city, type/address, and separation checks
- `mock_hk_016` 美兰机场逸唐飞行酒店 (ambiguous): 美兰机场逸唐飞行酒店－地下停车场 / parking_garage / 1.17 vs 美兰机场逸唐飞行酒店电动汽车充电站 / electric_vehicle_charging_station / 1.06; best candidate type does not match the entity role
- `place_hak_airport` 海口美兰国际机场 (matched): 海口美兰国际机场 / international_airport / 1.34 vs 海口美兰国际机场 / point_of_interest / 0.95; best candidate passed name, city, type/address, and separation checks
- `place_hak_east_station` 海口东站 (matched): 海口东站 / train_station / 1.34 vs 海口东站广场 / point_of_interest / 0.95; best candidate passed name, city, type/address, and separation checks
- `place_hak_railway_station` 海口站 (ambiguous): 海口东站 / train_station / 1.247 vs 海口西站 / train_station / 1.247; candidate evidence is not strong enough
- `place_hak_baishamen` 白沙门公园 (ambiguous): 白沙门 / point_of_interest / 1.37 vs 白沙门公园 / park / 1.37; candidate evidence is not strong enough
- `place_hak_convention` 海南国际会展中心 (ambiguous): 海南国际会展中心 / convention_center / 1.34 vs 海南国际会展中心 / business_center / 1.34; top candidates have the same normalized name and near-tie scores
- `place_hak_hainan_university` 海南大学 (ambiguous): 海南大学 / university / 1.37 vs 海南大学 / university / 1.37; top candidates have the same normalized name and near-tie scores
- `place_hak_zoo` 海南热带野生动植物园 (matched): 海南热带野生动植物园 / botanical_garden / 1.34 vs 海南热带野生动植物园 / scenic_spot / 0.95; best candidate passed name, city, type/address, and separation checks

## Potential Duplicate Place IDs

- None.

## Manual Review Items

- `mock_hk_003` 全季酒店海口国贸中心店 [hotel, ambiguous]: best candidate has an explicit address that conflicts with the data record
- `mock_hk_004` 海口索菲特酒店 [hotel, ambiguous]: best candidate name score is below threshold
- `mock_hk_005` 骑楼老街还客1921精品民宿 [hotel, ambiguous]: best candidate has an explicit address that conflicts with the data record
- `mock_hk_006` 如家酒店·neo海口骑楼老街东湖路店 [hotel, ambiguous]: best candidate has an explicit address that conflicts with the data record
- `mock_hk_008` 海口华彩华邑酒店 [hotel, ambiguous]: best candidate type does not match the entity role
- `mock_hk_009` 全季海口海南大学海甸岛酒店 [hotel, ambiguous]: best candidate name score is below threshold
- `mock_hk_010` 海口美兰温德姆花园酒店 [hotel, ambiguous]: best candidate name score is below threshold
- `mock_hk_011` 海口雅诗阁服务公寓 [hotel, ambiguous]: best candidate is outside Haikou
- `mock_hk_012` 汉庭酒店海口省政府国兴大道店 [hotel, ambiguous]: best candidate has an explicit address that conflicts with the data record
- `mock_hk_013` 海口高铁东站学院路亚朵酒店 [hotel, ambiguous]: best candidate name score is below threshold
- `mock_hk_014` 格林豪泰酒店海口高铁东站凤翔东路店 [hotel, ambiguous]: best candidate has an explicit address that conflicts with the data record
- `mock_hk_015` 格林东方酒店海口高铁东站店 [hotel, ambiguous]: best candidate is outside Haikou
- `mock_hk_016` 美兰机场逸唐飞行酒店 [hotel, ambiguous]: best candidate type does not match the entity role
- `mock_hk_017` 海口美兰国际机场酒店 [hotel, ambiguous]: best candidate name score is below threshold
- `mock_hk_018` 海口美兰星七天酒店 [hotel, ambiguous]: best candidate name score is below threshold
- `mock_hk_022` 海口站前旅馆海口站店 [hotel, ambiguous]: best candidate name score is below threshold
- `mock_hk_023` 海口丽思卡尔顿酒店 [hotel, ambiguous]: best candidate is outside Haikou
- `place_hak_meilan_station` 美兰站 [place, ambiguous]: best candidate type does not match the entity role
- `place_hak_railway_station` 海口站 [place, ambiguous]: candidate evidence is not strong enough
- `place_hak_xinhai_port` 新海港 [place, ambiguous]: best candidate type does not match the entity role
- `place_hak_clocktower` 海口钟楼 [place, ambiguous]: candidate evidence is not strong enough
- `place_hak_hairui` 海瑞文化公园 [place, ambiguous]: candidate evidence is not strong enough
- `place_hak_cloud_library` 云洞图书馆 [place, ambiguous]: candidate evidence is not strong enough
- `place_hak_bay` 海口湾 [place, ambiguous]: best candidate type does not match the entity role
- `place_hak_baishamen` 白沙门公园 [place, ambiguous]: candidate evidence is not strong enough
- `place_hak_guomao` 国贸商圈 [place, ambiguous]: best candidate name score is below threshold
- `place_hak_dutyfree` 中免海口国际免税城 [place, ambiguous]: candidate evidence is not strong enough
- `place_hak_convention` 海南国际会展中心 [place, ambiguous]: top candidates have the same normalized name and near-tie scores
- `place_hak_hainan_university` 海南大学 [place, ambiguous]: top candidates have the same normalized name and near-tie scores
- `place_hak_missionhills` 观澜湖度假区 [place, ambiguous]: candidate evidence is not strong enough
- `place_hak_volcano` 雷琼海口火山群世界地质公园 [place, ambiguous]: candidate evidence is not strong enough

## API Call Error Summary

- None.

## Per-entity Results

| Type | ID | Name | Status | Selected display name | Address evidence | Type evidence | Reason |
|---|---|---|---|---|---|---|---|
| hotel | `mock_hk_001` | 海口希尔顿酒店 | matched | 海口希尔顿酒店 | strong | True | best candidate passed name, city, type/address, and separation checks |
| hotel | `mock_hk_002` | 海口朗廷酒店 | matched | 海口朗廷酒店 | strong | True | best candidate passed name, city, type/address, and separation checks |
| hotel | `mock_hk_003` | 全季酒店海口国贸中心店 | ambiguous |  |  |  | best candidate has an explicit address that conflicts with the data record |
| hotel | `mock_hk_004` | 海口索菲特酒店 | ambiguous |  |  |  | best candidate name score is below threshold |
| hotel | `mock_hk_005` | 骑楼老街还客1921精品民宿 | ambiguous |  |  |  | best candidate has an explicit address that conflicts with the data record |
| hotel | `mock_hk_006` | 如家酒店·neo海口骑楼老街东湖路店 | ambiguous |  |  |  | best candidate has an explicit address that conflicts with the data record |
| hotel | `mock_hk_007` | 海口威斯汀酒店 | matched | 海口威斯汀酒店 | strong | True | best candidate passed name, city, type/address, and separation checks |
| hotel | `mock_hk_008` | 海口华彩华邑酒店 | ambiguous |  |  |  | best candidate type does not match the entity role |
| hotel | `mock_hk_009` | 全季海口海南大学海甸岛酒店 | ambiguous |  |  |  | best candidate name score is below threshold |
| hotel | `mock_hk_010` | 海口美兰温德姆花园酒店 | ambiguous |  |  |  | best candidate name score is below threshold |
| hotel | `mock_hk_011` | 海口雅诗阁服务公寓 | ambiguous |  |  |  | best candidate is outside Haikou |
| hotel | `mock_hk_012` | 汉庭酒店海口省政府国兴大道店 | ambiguous |  |  |  | best candidate has an explicit address that conflicts with the data record |
| hotel | `mock_hk_013` | 海口高铁东站学院路亚朵酒店 | ambiguous |  |  |  | best candidate name score is below threshold |
| hotel | `mock_hk_014` | 格林豪泰酒店海口高铁东站凤翔东路店 | ambiguous |  |  |  | best candidate has an explicit address that conflicts with the data record |
| hotel | `mock_hk_015` | 格林东方酒店海口高铁东站店 | ambiguous |  |  |  | best candidate is outside Haikou |
| hotel | `mock_hk_016` | 美兰机场逸唐飞行酒店 | ambiguous |  |  |  | best candidate type does not match the entity role |
| hotel | `mock_hk_017` | 海口美兰国际机场酒店 | ambiguous |  |  |  | best candidate name score is below threshold |
| hotel | `mock_hk_018` | 海口美兰星七天酒店 | ambiguous |  |  |  | best candidate name score is below threshold |
| hotel | `mock_hk_019` | 海口万豪酒店 | matched | 海口万豪酒店 | none | True | best candidate passed name, city, type/address, and separation checks |
| hotel | `mock_hk_020` | 海口喜来登酒店 | matched | 海口喜来登温泉度假酒店 | strong | True | best candidate passed name, city, type/address, and separation checks |
| hotel | `mock_hk_021` | 海口大华西海岸智选假日酒店 | matched | 海口大华西海岸智选假日酒店 | none | True | best candidate passed name, city, type/address, and separation checks |
| hotel | `mock_hk_022` | 海口站前旅馆海口站店 | ambiguous |  |  |  | best candidate name score is below threshold |
| hotel | `mock_hk_023` | 海口丽思卡尔顿酒店 | ambiguous |  |  |  | best candidate is outside Haikou |
| hotel | `mock_hk_024` | 海口观澜湖度假酒店 | matched | 海口观澜湖度假酒店 | none | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_airport` | 海口美兰国际机场 | matched | 海口美兰国际机场 | none | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_meilan_station` | 美兰站 | ambiguous |  |  |  | best candidate type does not match the entity role |
| place | `place_hak_east_station` | 海口东站 | matched | 海口东站 | none | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_railway_station` | 海口站 | ambiguous |  |  |  | candidate evidence is not strong enough |
| place | `place_hak_xinhai_port` | 新海港 | ambiguous |  |  |  | best candidate type does not match the entity role |
| place | `place_hak_qilou` | 骑楼老街 | matched | 海口骑楼老街 | weak | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_museum` | 海南省博物馆 | matched | 海南省博物馆 | none | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_wugongci` | 五公祠 | matched | 五公祠 | none | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_clocktower` | 海口钟楼 | ambiguous |  |  |  | candidate evidence is not strong enough |
| place | `place_hak_hairui` | 海瑞文化公园 | ambiguous |  |  |  | candidate evidence is not strong enough |
| place | `place_hak_cloud_library` | 云洞图书馆 | ambiguous |  |  |  | candidate evidence is not strong enough |
| place | `place_hak_bay` | 海口湾 | ambiguous |  |  |  | best candidate type does not match the entity role |
| place | `place_hak_wanlvyuan` | 万绿园 | matched | 万绿园 | weak | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_baishamen` | 白沙门公园 | ambiguous |  |  |  | candidate evidence is not strong enough |
| place | `place_hak_holiday_beach` | 假日海滩 | matched | 假日海滩旅游区 | none | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_guomao` | 国贸商圈 | ambiguous |  |  |  | best candidate name score is below threshold |
| place | `place_hak_riyue` | 日月广场 | matched | 海航日月广场 | none | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_dutyfree` | 中免海口国际免税城 | ambiguous |  |  |  | candidate evidence is not strong enough |
| place | `place_hak_convention` | 海南国际会展中心 | ambiguous |  |  |  | top candidates have the same normalized name and near-tie scores |
| place | `place_hak_hainan_university` | 海南大学 | ambiguous |  |  |  | top candidates have the same normalized name and near-tie scores |
| place | `place_hak_missionhills` | 观澜湖度假区 | ambiguous |  |  |  | candidate evidence is not strong enough |
| place | `place_hak_fengxiaogang` | 冯小刚电影公社 | matched | 观澜湖华谊冯小刚电影公社 | none | True | best candidate passed name, city, type/address, and separation checks |
| place | `place_hak_volcano` | 雷琼海口火山群世界地质公园 | ambiguous |  |  |  | candidate evidence is not strong enough |
| place | `place_hak_zoo` | 海南热带野生动植物园 | matched | 海南热带野生动植物园 | none | True | best candidate passed name, city, type/address, and separation checks |
