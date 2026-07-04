# Autonomous Data Curation Report

- Execution time: 2026-07-05 02:05 UTC
- Pass: Pass 3, autonomous data curation
- Data files: `data/mock_hotels_haikou.json`, `data/haikou_target_places.json`
- Processed entities: 27 remaining ambiguous records
- Places API Text Search calls in this pass: 34
- Final entity count: 48
- Final populated Place IDs: 48
- Final populated coordinate pairs: 48
- Remaining empty Place IDs: 0
- Remaining null coordinate pairs: 0

## Scope

Pass 3 handled records that remained ambiguous after:

1. strict automatic Places matching;
2. reason-aware second-pass review.

This pass allowed entity correction and replacement where the old record was abstract, low quality, renamed, unverifiable, or unsuitable as a concrete route target. Important infrastructure records were retained and verified rather than replaced.

## Infrastructure Verification

The following infrastructure records were retained:

| ID | Final name | Result | Place ID | Notes |
|---|---|---|---|---|
| `place_hak_meilan_station` | 美兰站 | verified and completed | `ChIJca_4OMPWUzER4HUl40YdHrQ` | Kept as the airport-adjacent rail node. |
| `place_hak_railway_station` | 海口站广场 | corrected route target and completed | `ChIJHRHC2GwvUjERkWAUKArrH9U` | Kept the 海口站 transport role, but used the station plaza as the concrete route endpoint. |
| `place_hak_xinhai_port` | 新海港 | verified and completed | `ChIJWWi36JAvUjERhgfrBfvrV20` | Kept as the ferry/roll-on-roll-off port target. |

Primary source categories used: railway/transport references, port/government/transport references, Google Places Text Search.

## Concrete POI Verification

| ID | Old name | Final name | Result |
|---|---|---|---|
| `place_hak_clocktower` | 海口钟楼 | 海口钟楼 | Completed with historical landmark candidate. |
| `place_hak_hairui` | 海瑞文化公园 | 海瑞墓 | Renamed to the stable official cultural-site target. |
| `place_hak_cloud_library` | 云洞图书馆 | 世纪大桥 | Replaced because Places did not return a stable 云洞图书馆 candidate; 世纪大桥 keeps the Haikou Bay urban-landmark role. |
| `place_hak_volcano` | 雷琼海口火山群世界地质公园 | 海口石山火山群国家地质公园 | Normalized to the stable Places-recognized park name. |

## Abstract Target Replacement

| Old abstract target | New concrete POI | Reason |
|---|---|---|
| 海口湾 | 海口湾公园 | Concrete waterfront park, suitable as a Routes endpoint for seaside walking and sunset trips. |
| 国贸商圈 | 上邦百汇城 | Concrete commercial complex in the Guomao/CBD living circle. |
| 观澜湖度假区 | 观澜湖高尔夫球会·海口 | Independent leisure POI in the Mission Hills area; avoids reusing the hotel Place ID. |

## Hotel Verification Results

- Hotels retained with corrections: 6
- Hotels replaced: 11
- Hotels completed with Place IDs and coordinates: 17

### Retained With Corrections

| ID | Final name | Main correction |
|---|---|---|
| `mock_hk_004` | Sofitel Haikou | Name/query normalized to Places result; existing 滨海大道105号 address retained. |
| `mock_hk_006` | 如家快捷酒店海口骑楼老街东湖路店 | Name and address corrected to the stable 东湖路27号 candidate. |
| `mock_hk_010` | Wyndham Garden Haikou Meilan | Name/query normalized; address-specific Places queries repeatedly returned the same hotel and coordinates. |
| `mock_hk_014` | 格林豪泰酒店海口高铁东站凤翔东路店 | Address corrected to 凤翔东路145号. |
| `mock_hk_017` | Haikou Meilan International Airport Hotel | Name/query normalized to the Places result; airport-hotel role retained. |
| `mock_hk_023` | The Ritz-Carlton, Haikou | Query corrected with Mission Hills/Yangshan Boulevard context to avoid a wrong city-center candidate. |

### Hotel Replacement Mapping

| Slot | Old entity | New entity | Reason |
|---|---|---|---|
| `mock_hk_003` | 全季酒店海口国贸中心店 | 海口国贸希尔顿欢朋酒店 | Old record had address conflict; replacement keeps Guomao business role and 400-800 band. |
| `mock_hk_005` | 骑楼老街还客1921精品民宿 | 锦江之星品尚海口骑楼老街滨海大道酒店 | Old boutique lodging could not be confirmed reliably; replacement keeps old-town short-trip role. |
| `mock_hk_008` | 海口华彩华邑酒店 | 海口鲁能希尔顿酒店 | Old record returned inconsistent/non-hotel candidates; replacement keeps Meilan high-end leisure coverage. |
| `mock_hk_009` | 全季海口海南大学海甸岛酒店 | 千岛海景酒店 | Old record not stable; replacement keeps Haidian/Hainan University budget role. |
| `mock_hk_011` | 海口雅诗阁服务公寓 | Fairfield by Marriott Haikou Meilan | Old record matched out-of-city candidates; replacement keeps Meilan/Guoxing business role. |
| `mock_hk_012` | 汉庭酒店海口省政府国兴大道店 | 汉庭酒店海口明珠广场店 | Old address evidence was weak; replacement keeps city-center budget role. |
| `mock_hk_013` | 海口高铁东站学院路亚朵酒店 | 海口东站希尔顿欢朋酒店 | Old record not stable; replacement keeps East Station comfort/business role. |
| `mock_hk_015` | 格林东方酒店海口高铁东站店 | 佳捷连锁酒店海口高铁东站精品店 | Old record matched outside-city candidates; replacement keeps East Station mid-budget role. |
| `mock_hk_016` | 美兰机场逸唐飞行酒店 | 海口希辰智享酒店（海口美兰国际机场T1T2航站楼店） | Old record matched non-hotel airport facilities; replacement keeps airport transfer role. |
| `mock_hk_018` | 海口美兰星七天酒店 | 七星假日商务客房 | Old record not stable; replacement keeps airport budget role. |
| `mock_hk_022` | 海口站前旅馆海口站店 | Holiday Inn Express Haikou Intl Duty Free City by IHG | Old station inn could not be verified; replacement keeps New Port/duty-free transfer role and budget-demo band. |

## Name, Address, Area, and Query Changes

- Name changes: 23
- Hotel address changes: 15
- Area changes: 0
- Hotel sub-area changes: 5
- Places query changes: 24
- Category changes: 2

The category changes were:

- `place_hak_bay`: `seaside` -> `park`
- `place_hak_guomao`: `commercial_district` -> `shopping`

## New Places Data

- Newly written Place IDs: 27
- Newly written coordinate pairs: 27
- Duplicate Place IDs after curation: none
- Hotel/place cross-entity Place ID reuse: none

## Final Completion

- Hotels: 24/24 populated
- Target places: 24/24 populated
- Remaining unresolved entities: none
- Empty Place IDs: none
- Null coordinates: none

## Final Price Distribution

- ¥180-400: 6
- ¥400-800: 7
- ¥800-1500: 6
- ¥1500+: 5

## Final Area Distribution

- 龙华区: 7
- 美兰区: 5
- 海口东站周边: 3
- 美兰机场/江东新区: 3
- 西海岸: 3
- 海口站/新海港方向: 1
- 观澜湖: 2

## Evidence and Safety Notes

- Place IDs and coordinates come from Google Places API (New) Text Search.
- Internet fact checking was used to confirm infrastructure identities, formal or stable POI names, and replacement suitability.
- Full raw API responses were not persisted.
- The API key was read only from `GOOGLE_MAPS_API_KEY` and was not written to data, reports, source, logs, or tests.
- The Ritz-Carlton slot required address/context-specific queries because a generic English query also returned a misleading city-center candidate. The final selected record is the Yangshan Boulevard/Mission Hills hotel candidate.
- Wyndham Garden Haikou Meilan was retained because repeated name and address-specific Places queries returned the same hotel candidate. Its coordinates are within the broad validation bounds, though the point is farther south than the central address text might suggest; this should be rechecked in any future manual map audit.

## Pass 3 Logic Summary

- Important infrastructure: retain, verify, and complete rather than replace.
- Clear concrete POIs: rename to stable formal POI names when needed, then complete from Places.
- Abstract areas: replace with concrete representative POIs suitable for Routes.
- Hotels: retain only when name/address/type evidence is sufficient; otherwise replace with same-area, same-role, same-price-band verified hotels.
- Write back only when a concrete Places candidate has a non-empty Place ID, numeric coordinates, city/area consistency, and no duplicate Place ID conflict.
