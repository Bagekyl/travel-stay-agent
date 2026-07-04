# 酒店数据 Schema 说明

## 字段结构
`data/mock_hotels_haikou.json` 固定包含 24 家酒店，所有酒店使用完全一致的字段结构。

## 必填字段
- `hotel_id`: 项目内部唯一 ID，格式 `mock_hk_XXX`
- `name`: 酒店正式名称
- `brand`: 酒店品牌，独立酒店填 `Independent`
- `city`: 固定为 `海口`
- `area`: 一级区域
- `sub_area`: 片区
- `address`: 已核验到明确地址的文本字段
- `places_query`: 离线 Places enrichment 使用的搜索字符串，必须非空
- `google_place_id`: 离线 Places enrichment 确认匹配后填写；当前交付数据应全部非空
- `location.latitude`: 离线 Places enrichment 确认匹配后填写数字；当前交付数据应全部为数字
- `location.longitude`: 离线 Places enrichment 确认匹配后填写数字；当前交付数据应全部为数字
- `hotel_type`: `经济型` / `舒适型` / `高端型` / `奢华型` / `目的地型度假酒店`
- `star_rating`: 数字
- `review.score`: 展示参考数据
- `review.count`: 展示参考数据
- `review.source_note`: 固定说明
- `mock_price_per_night`: Mock 预算过滤字段，CNY/晚
- `price_range_cny.low`: Mock 价格下限
- `price_range_cny.high`: Mock 价格上限
- `currency`: 固定 `CNY`
- `room_types`: 非空数组，元素含 `type` / `bed_type` / `size_m2` / `max_guests`
- `breakfast`: 含 `included` / `price_cny` / `type`
- `cancellation`: 含 `free_cancellation` / `deadline_note`
- `availability`: 含 `available` / `available_rooms` / `status_note`
- `parking`: 含 `available` / `fee_note`
- `facilities`: 设施列表
- `tags`: 酒店统一标签词表
- `target_users`: 目标用户类型
- `trip_styles`: 旅行方式
- `summary`: 简要说明
- `source`: 固定 `mock_demo_data`
- `mock_fields`: Mock 字段声明
- `mock_note`: Mock 数据边界说明
- `last_verified`: 数据核验月份

## Mock 字段
以下字段为课程演示模拟数据，不代表真实实时可订信息：
- `mock_price_per_night`
- `price_range_cny`
- `breakfast`
- `cancellation`
- `availability`

## Places 字段规范
- 当前 Pass 3 交付数据：所有记录均应有非空 `google_place_id`，`location.latitude` / `location.longitude` 均应为数字
- 中间处理阶段如果出现 ambiguous / unmatched / error，离线脚本不得写入错误候选；应在报告中记录并继续治理或替换实体
- 不使用 `0` 代替空值
- 不手工猜测坐标或 Place ID，只通过离线 Places enrichment 工具写入

## 价格分布
按 `mock_price_per_night` 统计：
- ¥180-400: 6 家
- ¥400-800: 7 家
- ¥800-1500: 6 家
- ¥1500+: 5 家

## 酒店标签词表
- 交通方便
- 近机场
- 近铁路
- 近港口
- 近海边
- 城市便利
- 商务友好
- 适合情侣
- 适合亲子
- 适合中转
- 适合短途
- 适合自驾
- 适合纯度假
- 预算友好
- 设施丰富
- 安静
- 购物方便
- 美食方便
- 会展便利

## 区域分布
- 龙华区: 7 家
- 美兰区: 5 家
- 海口东站周边: 3 家
- 美兰机场/江东新区: 3 家
- 西海岸: 3 家
- 观澜湖: 2 家
- 海口站/新海港方向: 1 家
