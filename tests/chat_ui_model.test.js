const test = require('node:test');
const assert = require('node:assert/strict');

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
  assert.equal(view.weather.coverageMode, 'unavailable');
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
  assert.equal(view.protocolErrors.length, 1);
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
