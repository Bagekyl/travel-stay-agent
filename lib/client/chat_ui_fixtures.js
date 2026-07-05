function normalFixtureEvents() {
  return [
    {
      type: 'fact_frame',
      payload: {
        schema_version: '1.0',
        scope: 'normal_recommendation',
        hotel_data_mode: 'mock_demo',
        route_data_mode: 'google_routes',
        candidate_count: 3,
        selected_place_count: 2,
        hotels: [
          {
            hotel_id: 'mock_hk_024',
            name: '海口观澜湖度假酒店',
            brand: 'Mission Hills',
            area: '龙华区',
            sub_area: '观澜湖',
            address: '海口观澜湖旅游度假区',
            hotel_type: '度假型',
            star_rating: 5,
            price: { amount_cny: 1080, currency: 'CNY', basis: 'per_night', data_mode: 'mock_demo' },
            breakfast: { included: true, price_cny: 0, type: '自助早餐' },
            parking: { available: true, fee_note: '住客免费停车' },
            cancellation: { free_cancellation: true, deadline_note: '课程演示模拟政策' },
            availability: { available: true, status_note: '课程演示模拟房态' },
            facilities: ['高尔夫', '泳池', '温泉'],
            tags: ['适合纯度假', '适合自驾'],
            trip_styles: ['纯度假', '自驾'],
            review: { score: 4.7, count: 3200, source_note: '展示参考数据' },
            match_score: 12,
            match_reasons: ['匹配偏好片区：观澜湖', '匹配旅行类型：纯度假'],
          },
          {
            hotel_id: 'mock_hk_013',
            name: '海口东站亚朵酒店',
            brand: 'Atour',
            area: '龙华区',
            sub_area: '海口东站',
            address: '海口东站周边',
            hotel_type: '舒适型',
            star_rating: 4,
            price: { amount_cny: 520, currency: 'CNY', basis: 'per_night', data_mode: 'mock_demo' },
            breakfast: { included: false, price_cny: 48, type: '自助早餐' },
            parking: { available: true, fee_note: '停车位有限' },
            cancellation: { free_cancellation: true, deadline_note: '课程演示模拟政策' },
            availability: { available: true, status_note: '课程演示模拟房态' },
            facilities: ['健身房', '洗衣房'],
            tags: ['交通方便', '近铁路'],
            trip_styles: ['商务出差', '中转'],
            review: { score: 4.6, count: 2100, source_note: '展示参考数据' },
            match_score: 9,
            match_reasons: ['靠近海口东站'],
          },
        ],
        target_places: [
          { place_id: 'place_hak_golf', name: '观澜湖高尔夫球会', category: 'golf', area: '龙华区', sub_area: '观澜湖', priority: 'high' },
          { place_id: 'place_hak_east_station', name: '海口东站', category: 'railway_station', area: '龙华区', sub_area: '海口东站', priority: 'high' },
        ],
        route_matrix: {
          valid: true,
          hotel_route_stats: [
            {
              hotel_id: 'mock_hk_024',
              hotel_name: '海口观澜湖度假酒店',
              route_count: 2,
              average_duration_minutes: 24,
              average_distance_km: 13.6,
              high_priority_average_duration_minutes: 24,
              fastest_route: { place_id: 'place_hak_golf', place_name: '观澜湖高尔夫球会', distance_km: 2.4, duration_minutes: 8 },
              slowest_route: { place_id: 'place_hak_east_station', place_name: '海口东站', distance_km: 24.8, duration_minutes: 40 },
              routes: [
                { place_id: 'place_hak_golf', place_name: '观澜湖高尔夫球会', route_priority: 'high', distance_km: 2.4, duration_minutes: 8 },
                { place_id: 'place_hak_east_station', place_name: '海口东站', route_priority: 'high', distance_km: 24.8, duration_minutes: 40 },
              ],
              route_rank: 2,
            },
            {
              hotel_id: 'mock_hk_013',
              hotel_name: '海口东站亚朵酒店',
              route_count: 2,
              average_duration_minutes: 28,
              average_distance_km: 18.1,
              high_priority_average_duration_minutes: 28,
              fastest_route: { place_id: 'place_hak_east_station', place_name: '海口东站', distance_km: 1.8, duration_minutes: 7 },
              slowest_route: { place_id: 'place_hak_golf', place_name: '观澜湖高尔夫球会', distance_km: 34.4, duration_minutes: 49 },
              routes: [
                { place_id: 'place_hak_east_station', place_name: '海口东站', route_priority: 'high', distance_km: 1.8, duration_minutes: 7 },
                { place_id: 'place_hak_golf', place_name: '观澜湖高尔夫球会', route_priority: 'high', distance_km: 34.4, duration_minutes: 49 },
              ],
              route_rank: 3,
            },
          ],
        },
        weather: {
          available: true,
          coverage_mode: 'full',
          context: '天气数据可用，适合结合户外活动安排弹性行程。',
          source: 'open_meteo',
        },
      },
    },
    {
      type: 'primary_recommendation',
      payload: {
        hotel_id: 'mock_hk_024',
        summary: '更适合把观澜湖活动体验作为主轴，同时通过自驾接受前往东站的交通成本。',
        tradeoff: '到海口东站的路线时间会高于东站周边酒店，但换来更完整的度假和高尔夫体验。',
      },
    },
    {
      type: 'recommendation_reason',
      payload: {
        dimension: 'style',
        title: '度假体验匹配',
        content: '酒店类型、设施和片区都更贴合高尔夫与度假需求。',
        related_hotel_ids: ['mock_hk_024'],
        related_place_ids: ['place_hak_golf'],
      },
    },
    {
      type: 'recommendation_reason',
      payload: {
        dimension: 'route',
        title: '路线取舍清晰',
        content: '前往观澜湖活动点更有优势，去东站则建议预留更充足时间。',
        related_hotel_ids: ['mock_hk_024'],
        related_place_ids: ['place_hak_east_station'],
      },
    },
    {
      type: 'alternative_recommendation',
      payload: {
        hotel_id: 'mock_hk_013',
        label: '交通优先备选',
        fit_for: '更看重离站便利、预算更稳的用户',
        reason: '靠近海口东站，离站当天更省心。',
        tradeoff: '观澜湖活动体验不如度假区酒店完整。',
      },
    },
    {
      type: 'route_advice',
      payload: {
        content: '如果选择观澜湖片区，建议离站当天提前出发；如果行李较多或赶早班车，可改选东站周边备选。',
        related_hotel_ids: ['mock_hk_024', 'mock_hk_013'],
        related_place_ids: ['place_hak_east_station'],
      },
    },
    {
      type: 'weather_advice',
      payload: {
        content: '户外高尔夫和度假活动受降雨影响较大，建议保留半天可调整时间。',
        related_place_ids: ['place_hak_golf'],
      },
    },
    {
      type: 'data_notice',
      payload: {
        content: '当前酒店价格、房态和部分酒店政策属于课程演示数据，实际预订前仍需通过正式预订渠道确认。',
      },
    },
    { type: 'done', payload: {} },
  ];
}

function noCandidateFixtureEvents() {
  return [
    {
      type: 'no_candidate',
      payload: {
        summary: '当前条件下没有找到足够合适的酒店。',
        detail: '预算、片区和房态要求同时较严格，候选池被过滤为空。',
        active_constraints: { budget: '每晚 300 元以内', area: '观澜湖', guests: 4 },
        suggestions: [
          { field: 'budget', label: '预算范围', content: '适当提高每晚预算，或接受舒适型酒店。' },
          { field: 'area', label: '住宿区域', content: '扩大到海口东站或国贸 CBD 周边。' },
        ],
      },
    },
    {
      type: 'data_notice',
      payload: { content: '当前结果基于课程演示 Mock 数据。' },
    },
    { type: 'done', payload: {} },
  ];
}

function unsupportedCityFixtureEvents() {
  return [
    {
      type: 'unsupported_city',
      payload: {
        city: '上海',
        supported_cities: ['海口'],
        message: '当前住宿决策数据集暂时只覆盖海口。',
      },
    },
    { type: 'done', payload: {} },
  ];
}

function invalidTripDateFixtureEvents() {
  return [
    {
      type: 'invalid_trip_date',
      payload: {
        message: '当前日期范围超出天气和路线演示流程支持范围，请调整为近期出行计划。',
      },
    },
    { type: 'done', payload: {} },
  ];
}

function clarificationFixtureEvents() {
  return [
    {
      type: 'clarification_required',
      payload: {
        message: '请补充预计入住日期或主要活动地点，以便继续判断住宿区域。',
        awaiting_user_input: true,
      },
    },
    { type: 'done', payload: {} },
  ];
}

function fixtureEventsFor(name) {
  if (name === 'no_candidate') return noCandidateFixtureEvents();
  if (name === 'unsupported_city') return unsupportedCityFixtureEvents();
  if (name === 'invalid_trip_date') return invalidTripDateFixtureEvents();
  if (name === 'clarification_required') return clarificationFixtureEvents();
  return normalFixtureEvents();
}

module.exports = {
  clarificationFixtureEvents,
  fixtureEventsFor,
  invalidTripDateFixtureEvents,
  noCandidateFixtureEvents,
  normalFixtureEvents,
  unsupportedCityFixtureEvents,
};
