# 数据内容说明

## 数据职责边界
- 酒店 JSON：酒店实体、Mock 商业字段、预算过滤、用户类型、旅行方式和后续 Mock Hotel API 查询。
- 地点 JSON：关键地点实体、类别、用户和旅行类型匹配、酒店区域关联、路线计算优先级和天气敏感度。
- RAG 知识库：只维护“如何判断和取舍”的规则，不重复维护实时价格、实时路线、房态、天气或完整地点档案。

## 数据来源与性质
- 酒店名称、品牌和地址基于公开可核验信息整理。
- 酒店价格、价格区间、早餐、取消政策和房态均为课程演示 Mock 数据。
- 酒店评分和点评数为展示参考数据。
- 地点信息基于公开地理常识和课程项目需求整理。

## 动态信息处理
- `google_place_id` 和 `location` 由离线 Places enrichment 工具统一校验、消歧和补齐；运行时 Mock API 不调用 Places API。
- Pass 3 交付数据已完成互联网事实核验、自主替换和 Places 补全；如后续离线处理再次出现歧义、未匹配或 API 错误，不得强行写入错误候选，应在报告中记录并继续治理或替换实体。
- 实时路线时间和距离由 Routes API 提供，知识库不写固定路线耗时。
- 实时天气由天气 API 提供，知识库只写天气影响策略。
- 酒店实时房价、房态、取消政策由真实酒店 API 或 Mock API 提供，RAG 不维护这些事实。

## Mock 数据说明
- `mock_price_per_night` 用于预算硬过滤。
- `availability.available` 中有少量 `false` 样本，用于演示房态过滤。
- `cancellation.free_cancellation` 中有少量 `false` 样本，用于演示取消政策过滤。
- 这些字段不得解释为真实实时房态或真实取消政策。

## 当前价格档
- ¥180-400: 6 家
- ¥400-800: 7 家
- ¥800-1500: 6 家
- ¥1500+: 5 家

## 文件结构
- `data/mock_hotels_haikou.json`
- `data/haikou_target_places.json`
- `knowledge_base/*.md`
- `docs/*.md`
- `scripts/validate_data.py`

## 数据核验
- 最后核验时间: 2026 年 7 月
- 数据版本: v1.2
- 制作人: 成员 A
