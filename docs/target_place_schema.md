# 关键地点数据 Schema 说明

## 字段结构
`data/haikou_target_places.json` 固定包含 24 个关键地点，所有地点使用完全一致的字段结构。

## 必填字段
- `place_id`: 项目内部唯一地点 ID，格式 `place_hak_XXX`
- `name`: 正式地点名称
- `city`: 固定为 `海口`
- `category`: 地点类别枚举
- `area`: 所属区域
- `places_query`: 离线 Places enrichment 使用的搜索字符串，必须非空
- `google_place_id`: 离线 Places enrichment 确认匹配后填写；当前交付数据应全部非空
- `location.latitude`: 离线 Places enrichment 确认匹配后填写数字；当前交付数据应全部为数字
- `location.longitude`: 离线 Places enrichment 确认匹配后填写数字；当前交付数据应全部为数字
- `tags`: 地点统一标签词表
- `suitable_for`: 适合旅客类型
- `trip_styles`: 适合旅行方式
- `travel_role`: 地点在行程中的角色
- `recommended_time`: 推荐安排时段
- `estimated_visit_duration`: 稳定的游览时长描述，不用于路线计算
- `weather_sensitivity.level`: `low` / `medium` / `high`
- `weather_sensitivity.note`: 天气影响说明
- `hotel_decision_value`: 该地点如何影响酒店选择
- `preferred_hotel_areas`: 推荐住宿区域，必须可匹配酒店 `area` 或 `sub_area`
- `route_priority`: `low` / `medium` / `high`
- `source_note`: 数据说明
- `last_verified`: 数据核验月份

## 类别枚举
- `airport`
- `railway_hub`
- `port`
- `historical_site`
- `museum`
- `urban_landmark`
- `seaside`
- `park`
- `commercial_district`
- `shopping`
- `convention`
- `campus`
- `resort`
- `nature`
- `family_attraction`

## 地点标签词表
- 高铁
- 机场
- 中转
- 早班车
- 轮渡
- 自驾
- 美食
- 历史文化
- 城市漫游
- 拍照
- 海边
- 日落
- 公园
- 轻松散步
- 购物
- 免税
- 商务
- 会展
- 亲子
- 自然
- 博物馆
- 访校
- 学生
- 度假
- 温泉
- 高尔夫

## Places 字段规范
- 当前 Pass 3 交付数据：所有记录均应有非空 `google_place_id`，`location.latitude` / `location.longitude` 均应为数字
- 中间处理阶段如果出现 ambiguous / unmatched / error，离线脚本不得写入错误候选；应在报告中记录并继续治理或替换实体
- 不使用 `0` 代替空值
- 不手工猜测坐标或 Place ID，只通过离线 Places enrichment 工具写入

## 地点清单
- 交通枢纽 5 个: 美兰国际机场、美兰站、海口东站、海口站广场、新海港
- 历史文化与城市体验 5 个: 骑楼老街、海南省博物馆、五公祠、海口钟楼、海瑞墓
- 海滨公园与休闲 5 个: 世纪大桥、海口湾公园、万绿园、白沙门公园、假日海滩
- 商业购物与会展 4 个: 上邦百汇城、日月广场、中免海口国际免税城、海南国际会展中心
- 特殊目的地 5 个: 海南大学、观澜湖高尔夫球会·海口、冯小刚电影公社、海口石山火山群国家地质公园、海南热带野生动植物园
