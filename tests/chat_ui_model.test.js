const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { createInitialChatState, reduceChatEvent } = require('../lib/client/chat_event_state');
const { buildChatViewModel, dimensionPresentation } = require('../lib/client/chat_ui_model');
const {
  clarificationFixtureEvents,
  invalidTripDateFixtureEvents,
  noCandidateFixtureEvents,
  normalFixtureEvents,
  unsupportedCityFixtureEvents,
} = require('../lib/client/chat_ui_fixtures');

function applyEvents(events) {
  return events.reduce((state, event) => reduceChatEvent(state, event), createInitialChatState());
}

function internalWeatherContext() {
  return [
    '天气覆盖模式：full',
    '具体天气覆盖至：2026-07-21',
    '',
    '旅行日期天气：',
    '2026-07-10：最高 30.7°C，最低 25.5°C，最大降雨概率 96%，降水量 1.2 mm，最大风速 10.5 km/h。',
    '2026-07-11：最高 31.5°C，最低 26.3°C，最大降雨概率 86%，降水量 2.4 mm，最大风速 19.0 km/h。',
    '2026-07-12：最高 29.5°C，最低 26.5°C，最大降雨概率 93%，降水量 4.8 mm，最大风速 11.1 km/h。',
    '',
    '天气风险等级：high',
    '天气风险提示：',
    '- 存在较高降雨概率，应准备室内备选地点。',
    '- 旅行期间存在降水，应携带雨具并关注户外活动安排。',
  ].join('\n');
}

test('primary hotel ID is resolved from factFrame hotel facts', () => {
  const state = applyEvents(normalFixtureEvents().slice(0, 2));
  const view = buildChatViewModel(state);

  assert.equal(view.primaryRecommendation.hotel.hotelId, 'mock_hk_024');
  assert.equal(view.primaryRecommendation.hotel.name, '海口观澜湖度假酒店');
  assert.equal(view.primaryRecommendation.hotel.priceText, '¥1080 / 晚');
  assert.ok(view.primaryRecommendation.hotel.chips.includes('含早餐'));
});

test('alternative hotel ID is resolved and alternatives keep arrival order', () => {
  const state = applyEvents(normalFixtureEvents());
  const view = buildChatViewModel(state);

  assert.equal(view.alternativeRecommendations.length, 1);
  assert.equal(view.alternativeRecommendations[0].hotel.name, '海口东站亚朵酒店');
  assert.equal(view.alternativeRecommendations[0].label, '交通优先备选');
});

test('route stats are associated with hotels and sorted by route_rank', () => {
  const state = applyEvents(normalFixtureEvents());
  const view = buildChatViewModel(state);

  assert.equal(view.route.valid, true);
  assert.deepEqual(view.route.stats.map((stat) => stat.hotelId), ['mock_hk_024', 'mock_hk_013']);
  assert.equal(view.primaryRecommendation.route.fastestRoute.place_name, '观澜湖高尔夫球会');
});

test('missing optional fields do not crash view model', () => {
  const state = applyEvents([
    {
      type: 'fact_frame',
      payload: {
        schema_version: '1.0',
        hotels: [{ hotel_id: 'h1', name: '简化酒店' }],
        target_places: [],
        route_matrix: {},
        weather: {},
      },
    },
    { type: 'primary_recommendation', payload: { hotel_id: 'h1', summary: '摘要', tradeoff: '取舍' } },
  ]);

  const view = buildChatViewModel(state);
  assert.equal(view.primaryRecommendation.hotel.name, '简化酒店');
  assert.deepEqual(view.primaryRecommendation.hotel.chips, []);
});

test('weather unavailable produces degraded weather view model', () => {
  const state = applyEvents([
    {
      type: 'fact_frame',
      payload: {
        schema_version: '1.0',
        hotels: [],
        target_places: [],
        route_matrix: {},
        weather: {
          available: false,
          coverage_mode: 'unavailable',
          context: '天气数据暂不可用。',
          source: 'degraded_context',
        },
      },
    },
  ]);

  const view = buildChatViewModel(state);
  assert.equal(view.weather.available, false);
  assert.equal(view.weather.statusLabel, '当前旅行日期暂不在可用天气范围内');
  assert.equal(view.weather.sourceLabel, '天气信息：降级说明');
  assert.equal(view.weather.summary, '当前旅行日期暂不在可用天气预报范围内，住宿建议仍基于预算、位置、路线和旅行偏好生成。');
  assert.deepEqual(view.weather.dailyForecasts, []);
  assert.equal(Object.hasOwn(view.weather, 'coverageMode'), false);
  assert.equal(Object.hasOwn(view.weather, 'source'), false);
  assert.equal(Object.hasOwn(view.weather, 'context'), false);
});

test('weather full context is mapped to user-facing daily forecast and risk labels', () => {
  const baseFactFrame = {
    schema_version: '1.0',
    hotels: [],
    target_places: [],
    route_matrix: {},
  };
  const fullView = buildChatViewModel(applyEvents([{
    type: 'fact_frame',
    payload: {
      ...baseFactFrame,
      weather: {
        available: true,
        coverage_mode: 'full',
        context: internalWeatherContext(),
        source: 'open_meteo',
      },
    },
  }]));

  assert.equal(fullView.weather.statusLabel, '旅行日期范围内天气数据完整');
  assert.equal(fullView.weather.sourceLabel, '天气数据：Open-Meteo');
  assert.equal(fullView.weather.dailyForecasts.length, 3);
  assert.equal(fullView.weather.dailyForecasts[0].dateLabel, '7 月 10 日');
  assert.equal(fullView.weather.dailyForecasts[0].tempMaxC, 30.7);
  assert.equal(fullView.weather.dailyForecasts[0].tempMinC, 25.5);
  assert.equal(fullView.weather.dailyForecasts[0].precipitationProbabilityPct, 96);
  assert.equal(fullView.weather.dailyForecasts[0].precipitationSumMm, 1.2);
  assert.equal(fullView.weather.dailyForecasts[0].windSpeedMaxKmh, 10.5);
  assert.equal(fullView.weather.riskLabel, '降雨或天气影响风险较高');
  assert.equal(fullView.weather.riskMessages.length, 2);
  assert.equal(JSON.stringify(fullView.weather).includes('天气覆盖模式：full'), false);
  assert.equal(JSON.stringify(fullView.weather).includes('天气风险等级：high'), false);
});

test('weather partial coverage is mapped to user-facing label', () => {
  const baseFactFrame = {
    schema_version: '1.0',
    hotels: [],
    target_places: [],
    route_matrix: {},
  };
  const partialView = buildChatViewModel(applyEvents([{
    type: 'fact_frame',
    payload: {
      ...baseFactFrame,
      weather: {
        available: true,
        coverage_mode: 'partial',
        context: '部分天气可用。',
        source: 'open_meteo',
      },
    },
  }]));

  assert.equal(partialView.weather.statusLabel, '部分旅行日期可提供天气信息');
});

test('structured weather daily data is preferred when present', () => {
  const view = buildChatViewModel(applyEvents([{
    type: 'fact_frame',
    payload: {
      schema_version: '1.0',
      hotels: [],
      target_places: [],
      route_matrix: {},
      weather: {
        available: true,
        coverage_mode: 'full',
        source: 'open_meteo',
        context: '天气覆盖模式：full\n天气风险等级：high',
        daily: [{
          date: '2026-07-10',
          temp_max_c: 30,
          temp_min_c: 25,
          precip_probability_max_pct: 80,
          precipitation_sum_mm: 2,
          wind_speed_max_kmh: 12,
        }],
        risk_level: 'medium',
        risk_messages: ['午后可能有阵雨。'],
      },
    },
  }]));

  assert.equal(view.weather.dailyForecasts.length, 1);
  assert.equal(view.weather.dailyForecasts[0].tempMaxC, 30);
  assert.equal(view.weather.riskLabel, '需要关注天气变化');
  assert.deepEqual(view.weather.riskMessages, ['午后可能有阵雨。']);
});

test('normal view model does not expose raw implementation field names', () => {
  const view = buildChatViewModel(applyEvents(normalFixtureEvents()));
  const serialized = JSON.stringify(view);

  assert.equal(serialized.includes('route_matrix'), false);
  assert.equal(serialized.includes('fact_frame'), false);
  assert.equal(serialized.includes('business event'), false);
  assert.equal(serialized.includes('coverage_mode'), false);
  assert.equal(serialized.includes('source: open_meteo'), false);
  assert.equal(serialized.includes('天气覆盖模式'), false);
  assert.equal(serialized.includes('天气风险等级'), false);
  assert.equal(view.route.description, '比较候选酒店前往主要活动地点的车程与距离。');
  assert.ok(view.route.stats.length > 0);
  assert.equal(Object.hasOwn(view.weather, 'context'), false);
  assert.ok(view.weather.summary || view.weather.dailyForecasts.length >= 0);
});

test('recommendation reasons keep arrival order', () => {
  const state = applyEvents(normalFixtureEvents());
  const view = buildChatViewModel(state);

  assert.deepEqual(view.recommendationReasons.map((reason) => reason.dimension), ['style', 'route']);
});

test('unknown dimension uses fallback presentation', () => {
  const presentation = dimensionPresentation('future_dimension');

  assert.equal(presentation.label, 'future_dimension');
  assert.equal(presentation.icon, 'note');
});

test('no_candidate view model exposes summary, constraints, and suggestions', () => {
  const view = buildChatViewModel(applyEvents(noCandidateFixtureEvents()));

  assert.equal(view.exception.type, 'no_candidate');
  assert.equal(view.responseMode, 'no_candidate');
  assert.equal(view.exception.payload.suggestions.length, 2);
});

test('unsupported_city view model exposes supported cities', () => {
  const view = buildChatViewModel(applyEvents(unsupportedCityFixtureEvents()));

  assert.equal(view.exception.type, 'unsupported_city');
  assert.deepEqual(view.exception.payload.supported_cities, ['海口']);
});

test('invalid_trip_date view model exposes date message', () => {
  const view = buildChatViewModel(applyEvents(invalidTripDateFixtureEvents()));

  assert.equal(view.exception.type, 'invalid_trip_date');
  assert.match(view.exception.payload.message, /日期/);
});

test('clarification_required view keeps awaitingUserInput after done', () => {
  const view = buildChatViewModel(applyEvents(clarificationFixtureEvents()));

  assert.equal(view.exception.type, 'clarification_required');
  assert.equal(view.awaitingUserInput, true);
  assert.equal(view.status.tone, 'done');
});

test('partial streaming state can render after primary recommendation only', () => {
  const state = applyEvents(normalFixtureEvents().slice(0, 2));
  const view = buildChatViewModel(state);

  assert.equal(view.primaryRecommendation.hotel.name, '海口观澜湖度假酒店');
  assert.deepEqual(view.recommendationReasons, []);
  assert.deepEqual(view.alternativeRecommendations, []);
});

test('primary recommendation can exist before later events without UI crash', () => {
  const state = applyEvents(normalFixtureEvents().slice(0, 3));
  const view = buildChatViewModel(state);

  assert.equal(view.primaryRecommendation.summary.includes('观澜湖'), true);
  assert.equal(view.recommendationReasons.length, 1);
  assert.equal(view.route.stats.length, 2);
});

test('protocol error keeps already successful content in view model', () => {
  let state = applyEvents(normalFixtureEvents().slice(0, 3));
  state = reduceChatEvent(state, {
    type: 'primary_recommendation',
    payload: { hotel_id: 'mock_hk_024' },
  });
  const view = buildChatViewModel(state);

  assert.equal(view.primaryRecommendation.hotel.name, '海口观澜湖度假酒店');
  assert.equal(view.recommendationReasons.length, 1);
  assert.equal(view.protocolErrorNotice.title, '内容生成提示');
  assert.equal(view.protocolErrorNotice.diagnostics[0].code, 'MALFORMED_EVENT');
});

test('user-facing app copy avoids demo-only implementation wording by default', () => {
  const source = fs.readFileSync('lib/client/chat_ui_app.js', 'utf8');

  assert.match(source, /演示信息/);
  assert.match(source, /组件级流式渲染/);
  assert.doesNotMatch(source, /每条理由来自独立业务事件/);
  assert.doesNotMatch(source, /route_matrix/);
  assert.doesNotMatch(source, /流式协议提示/);
});

test('normal fixture reaches done and exposes data notice', () => {
  const view = buildChatViewModel(applyEvents(normalFixtureEvents()));

  assert.equal(view.status.tone, 'done');
  assert.match(view.dataNotice.content, /课程演示/);
});

test('normal fixture exposes streaming UI milestones incrementally', () => {
  const events = normalFixtureEvents();
  let state = createInitialChatState();

  let view = buildChatViewModel(state);
  assert.equal(view.status.tone, 'idle');
  assert.equal(view.primaryRecommendation, null);

  state = { ...state, streamStatus: 'streaming' };
  view = buildChatViewModel(state);
  assert.equal(view.status.tone, 'streaming');

  state = reduceChatEvent(state, events[0]);
  view = buildChatViewModel(state);
  assert.equal(view.hasFactFrame, true);
  assert.equal(view.primaryRecommendation, null);

  state = reduceChatEvent(state, events[1]);
  view = buildChatViewModel(state);
  assert.equal(view.primaryRecommendation.hotel.name, '海口观澜湖度假酒店');
  assert.equal(view.recommendationReasons.length, 0);

  state = reduceChatEvent(state, events[2]);
  view = buildChatViewModel(state);
  assert.equal(view.recommendationReasons.length, 1);

  state = reduceChatEvent(state, events[3]);
  view = buildChatViewModel(state);
  assert.deepEqual(view.recommendationReasons.map((reason) => reason.title), ['度假体验匹配', '路线取舍清晰']);

  state = reduceChatEvent(state, events[4]);
  view = buildChatViewModel(state);
  assert.equal(view.alternativeRecommendations.length, 1);

  state = reduceChatEvent(state, events[5]);
  view = buildChatViewModel(state);
  assert.match(view.route.advice, /提前出发/);

  state = reduceChatEvent(state, events[6]);
  view = buildChatViewModel(state);
  assert.match(view.weather.advice, /降雨/);

  state = reduceChatEvent(state, events[7]);
  view = buildChatViewModel(state);
  assert.match(view.dataNotice.content, /课程演示/);

  state = reduceChatEvent(state, events[8]);
  view = buildChatViewModel(state);
  assert.equal(view.status.tone, 'done');
});
