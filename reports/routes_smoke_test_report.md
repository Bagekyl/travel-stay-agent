# Routes API Smoke Test Report

- Execution time: 2026-07-04 18:17:59 UTC
- API types: `computeRoutes`, `computeRouteMatrix`
- Travel mode: DRIVE
- Routing preference: TRAFFIC_AWARE
- Base data modified: No

## Single Route

- Origin: 海口希尔顿酒店
- Destination: 骑楼老街
- Distance meters: 4623
- Distance km: 4.62
- Duration: 765s
- Duration minutes: 12.8

## 3x3 Route Matrix

| 酒店 | 目标地点 | 距离 km | 驾车时间 min | condition/status |
|---|---|---:|---:|---|
| 海口希尔顿酒店 | 骑楼老街 | 4.62 | 12.8 | ROUTE_EXISTS |
| 海口希尔顿酒店 | 海口东站 | 8.70 | 17.1 | ROUTE_EXISTS |
| 海口希尔顿酒店 | 海口美兰国际机场 | 26.03 | 33.4 | ROUTE_EXISTS |
| 海口东站希尔顿欢朋酒店 | 骑楼老街 | 7.64 | 16.3 | ROUTE_EXISTS |
| 海口东站希尔顿欢朋酒店 | 海口东站 | 6.67 | 13.8 | ROUTE_EXISTS |
| 海口东站希尔顿欢朋酒店 | 海口美兰国际机场 | 19.37 | 20.1 | ROUTE_EXISTS |
| 海口万豪酒店 | 骑楼老街 | 24.77 | 40.4 | ROUTE_EXISTS |
| 海口万豪酒店 | 海口东站 | 23.87 | 35.4 | ROUTE_EXISTS |
| 海口万豪酒店 | 海口美兰国际机场 | 41.60 | 53.0 | ROUTE_EXISTS |

## Result

- Place ID -> Routes API validation: Success
- Matrix elements parsed: 9
- Valid route elements: 9/9
- Exceptions found: None
