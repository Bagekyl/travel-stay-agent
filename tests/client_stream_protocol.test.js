const test = require('node:test');
const assert = require('node:assert/strict');

const { DifySseParser, SseParseError } = require('../lib/client/sse_parser');
const { NdjsonEventParser, NdjsonProtocolError } = require('../lib/client/ndjson_event_parser');
const {
  createInitialChatState,
  reduceChatEvent,
} = require('../lib/client/chat_event_state');
const { streamChat } = require('../lib/client/chat_stream_client');

const encoder = new TextEncoder();

function encode(value) {
  return encoder.encode(value);
}

function sseFrame(object) {
  return `data: ${JSON.stringify(object)}\n\n`;
}

function responseFromChunks(chunks) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(typeof chunk === 'string' ? encode(chunk) : chunk);
        }
        controller.close();
      },
    }),
  };
}

function eventLine(type, payload = {}) {
  return `${JSON.stringify({ type, payload })}\n`;
}

function minimalFactFrame() {
  return {
    schema_version: '1.0',
    scope: 'normal_recommendation',
    hotel_data_mode: 'mock_demo',
    route_data_mode: 'google_routes',
    candidate_count: 1,
    selected_place_count: 1,
    hotels: [],
    target_places: [],
    route_matrix: {},
    weather: {},
  };
}

test('SSE parser restores one JSON event split across arbitrary chunks', () => {
  const parser = new DifySseParser();
  const frame = sseFrame({ event: 'message', conversation_id: 'conv-1', answer: 'abc' });

  assert.deepEqual(parser.push(frame.slice(0, 7)), []);
  assert.deepEqual(parser.push(frame.slice(7, 23)), []);
  const events = parser.push(frame.slice(23));

  assert.equal(events.length, 1);
  assert.equal(events[0].conversation_id, 'conv-1');
  assert.equal(events[0].answer, 'abc');
});

test('SSE parser preserves UTF-8 Chinese characters split across byte chunks', () => {
  const parser = new DifySseParser();
  const bytes = encode(sseFrame({ event: 'message', answer: '海口住宿' }));
  const splitIndex = bytes.findIndex((byte) => byte >= 0x80) + 1;

  assert.deepEqual(parser.push(bytes.slice(0, splitIndex)), []);
  const events = parser.push(bytes.slice(splitIndex));

  assert.equal(events.length, 1);
  assert.equal(events[0].answer, '海口住宿');
});

test('SSE parser handles multiple frames in one network chunk', () => {
  const parser = new DifySseParser();
  const events = parser.push(
    sseFrame({ event: 'message', answer: 'a' })
    + sseFrame({ event: 'message', answer: 'b' }),
  );

  assert.deepEqual(events.map((event) => event.answer), ['a', 'b']);
});

test('SSE parser supports CRLF frame boundaries and ignores comments', () => {
  const parser = new DifySseParser();
  const events = parser.push(': heartbeat\r\ndata: {"event":"message","answer":"ok"}\r\n\r\n');

  assert.equal(events.length, 1);
  assert.equal(events[0].answer, 'ok');
});

test('SSE parser supports multi-line data fields', () => {
  const parser = new DifySseParser();
  const events = parser.push('data: {"event":"message",\ndata: "answer":"ok"}\n\n');

  assert.equal(events.length, 1);
  assert.equal(events[0].answer, 'ok');
});

test('SSE parser reports malformed data JSON', () => {
  const parser = new DifySseParser();

  assert.throws(() => parser.push('data: {"event":\n\n'), SseParseError);
});

test('NDJSON parser waits for a complete line across multiple answer deltas', () => {
  const parser = new NdjsonEventParser();

  assert.deepEqual(parser.push('{"type":"primary_recom'), []);
  assert.deepEqual(parser.push('mendation","payload":{"hotel_id":"mock_hk_002",'), []);
  const events = parser.push('"summary":"推荐","tradeoff":"取舍"}}\n');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'primary_recommendation');
  assert.equal(events[0].payload.hotel_id, 'mock_hk_002');
});

test('NDJSON parser handles multiple complete lines in one answer delta', () => {
  const parser = new NdjsonEventParser();
  const events = parser.push(
    eventLine('invalid_trip_date', { message: '日期不可用' })
    + eventLine('done', {}),
  );

  assert.deepEqual(events.map((event) => event.type), ['invalid_trip_date', 'done']);
});

test('NDJSON parser reports malformed complete JSON lines', () => {
  const parser = new NdjsonEventParser();

  assert.throws(() => parser.push('{"type":\n'), NdjsonProtocolError);
});

test('NDJSON parser reports truncated non-empty line at stream end', () => {
  const parser = new NdjsonEventParser();
  parser.push('{"type":"primary_recommendation"');

  assert.throws(() => parser.end(), /incomplete NDJSON line/);
});

test('normal flow reducer records all business event state', () => {
  let state = createInitialChatState();
  const events = [
    { type: 'fact_frame', payload: minimalFactFrame() },
    {
      type: 'primary_recommendation',
      payload: { hotel_id: 'mock_hk_002', summary: '主推', tradeoff: '取舍' },
    },
    {
      type: 'recommendation_reason',
      payload: { dimension: 'style', title: '风格', content: '适合', related_hotel_ids: ['mock_hk_002'], related_place_ids: [] },
    },
    {
      type: 'recommendation_reason',
      payload: { dimension: 'route', title: '路线', content: '方便', related_hotel_ids: ['mock_hk_002'], related_place_ids: ['place_hak_qilou'] },
    },
    {
      type: 'recommendation_reason',
      payload: { dimension: 'future', title: '扩展', content: '兼容', related_hotel_ids: [], related_place_ids: [] },
    },
    {
      type: 'alternative_recommendation',
      payload: { hotel_id: 'mock_hk_013', label: '备选1', fit_for: '交通', reason: '近站', tradeoff: '离度假区远' },
    },
    {
      type: 'alternative_recommendation',
      payload: { hotel_id: 'mock_hk_024', label: '备选2', fit_for: '度假', reason: '近活动', tradeoff: '到站较远' },
    },
    { type: 'route_advice', payload: { content: '以 Routes 为准', related_hotel_ids: [], related_place_ids: [] } },
    { type: 'weather_advice', payload: { content: '雨天调整', related_place_ids: [] } },
    { type: 'data_notice', payload: { content: '演示数据' } },
    { type: 'done', payload: {} },
  ];

  for (const event of events) state = reduceChatEvent(state, event);

  assert.equal(state.streamStatus, 'done');
  assert.equal(state.responseMode, 'normal');
  assert.equal(state.primaryRecommendation.hotel_id, 'mock_hk_002');
  assert.equal(state.recommendationReasons.length, 3);
  assert.equal(state.alternativeRecommendations.length, 2);
  assert.equal(state.routeAdvice.content, '以 Routes 为准');
  assert.equal(state.weatherAdvice.content, '雨天调整');
  assert.equal(state.dataNotice.content, '演示数据');
});

test('no_candidate flow sets response mode and completes', () => {
  let state = createInitialChatState();
  state = reduceChatEvent(state, {
    type: 'no_candidate',
    payload: { summary: '无候选', detail: '条件过严', active_constraints: {}, suggestions: [] },
  });
  state = reduceChatEvent(state, { type: 'data_notice', payload: { content: '演示数据' } });
  state = reduceChatEvent(state, { type: 'done', payload: {} });

  assert.equal(state.responseMode, 'no_candidate');
  assert.equal(state.streamStatus, 'done');
});

test('unsupported_city flow sets response mode and completes', () => {
  let state = createInitialChatState();
  state = reduceChatEvent(state, {
    type: 'unsupported_city',
    payload: { city: '上海', supported_cities: ['海口'], message: '暂不支持' },
  });
  state = reduceChatEvent(state, { type: 'done', payload: {} });

  assert.equal(state.responseMode, 'unsupported_city');
  assert.equal(state.unsupportedCity.city, '上海');
  assert.equal(state.streamStatus, 'done');
});

test('invalid_trip_date flow sets response mode and completes', () => {
  let state = createInitialChatState();
  state = reduceChatEvent(state, {
    type: 'invalid_trip_date',
    payload: { message: '日期超出范围' },
  });
  state = reduceChatEvent(state, { type: 'done', payload: {} });

  assert.equal(state.responseMode, 'invalid_trip_date');
  assert.equal(state.invalidTripDate.message, '日期超出范围');
  assert.equal(state.streamStatus, 'done');
});

test('clarification_required keeps awaitingUserInput after done', () => {
  let state = createInitialChatState();
  state = reduceChatEvent(state, {
    type: 'clarification_required',
    payload: { message: '请补充日期', awaiting_user_input: true },
  });
  state = reduceChatEvent(state, { type: 'done', payload: {} });

  assert.equal(state.responseMode, 'clarification_required');
  assert.equal(state.awaitingUserInput, true);
  assert.equal(state.streamStatus, 'done');
});

test('unknown business event records protocol warning and continues', () => {
  let state = createInitialChatState();
  state = reduceChatEvent(state, { type: 'future_event', payload: { x: 1 } });
  state = reduceChatEvent(state, { type: 'done', payload: {} });

  assert.equal(state.protocolErrors.length, 1);
  assert.equal(state.protocolErrors[0].code, 'UNKNOWN_EVENT_TYPE');
  assert.equal(state.streamStatus, 'done');
});

test('malformed known event records protocol error without corrupting state', () => {
  const state = reduceChatEvent(createInitialChatState(), {
    type: 'primary_recommendation',
    payload: { hotel_id: 'mock_hk_002' },
  });

  assert.equal(state.streamStatus, 'error');
  assert.equal(state.primaryRecommendation, null);
  assert.equal(state.protocolErrors[0].code, 'MALFORMED_EVENT');
});

test('streamChat captures conversation_id and parses answer NDJSON', async () => {
  const seenConversationIds = [];
  const seenEvents = [];
  const finalState = await streamChat({
    query: 'hello',
    user: 'u1',
    fetchImpl: async () => responseFromChunks([
      sseFrame({ event: 'message', conversation_id: 'conv-123', answer: eventLine('done', {}) }),
    ]),
    onConversationId: (conversationId) => seenConversationIds.push(conversationId),
    onBusinessEvent: (event) => seenEvents.push(event.type),
  });

  assert.deepEqual(seenConversationIds, ['conv-123']);
  assert.deepEqual(seenEvents, ['done']);
  assert.equal(finalState.conversationId, 'conv-123');
  assert.equal(finalState.streamStatus, 'done');
});

test('streamChat records malformed SSE JSON as protocol error', async () => {
  const finalState = await streamChat({
    query: 'hello',
    fetchImpl: async () => responseFromChunks(['data: {"event":\n\n']),
  });

  assert.equal(finalState.streamStatus, 'error');
  assert.equal(finalState.protocolErrors[0].code, 'MALFORMED_SSE_DATA');
});

test('streamChat records truncated NDJSON at stream end', async () => {
  const finalState = await streamChat({
    query: 'hello',
    fetchImpl: async () => responseFromChunks([
      sseFrame({ event: 'message', answer: '{"type":"primary_recommendation"' }),
    ]),
  });

  assert.equal(finalState.streamStatus, 'error');
  assert.equal(finalState.protocolErrors[0].code, 'TRUNCATED_NDJSON');
});

test('streamChat ignores Dify events without answer and reports Dify transport error', async () => {
  const errors = [];
  const finalState = await streamChat({
    query: 'hello',
    fetchImpl: async () => responseFromChunks([
      sseFrame({ event: 'workflow_started', conversation_id: 'conv-1' }),
      sseFrame({ event: 'error', message: 'upstream failed' }),
    ]),
    onError: (error) => errors.push(error),
  });

  assert.equal(finalState.conversationId, 'conv-1');
  assert.equal(finalState.streamStatus, 'error');
  assert.equal(errors[0].code, 'DIFY_TRANSPORT_ERROR');
});

test('streamChat passes AbortSignal and ends without dispatching later events when aborted', async () => {
  const controller = new AbortController();
  const states = [];
  const fetchImpl = async (_url, init) => {
    assert.equal(init.signal, controller.signal);
    controller.abort();
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  const finalState = await streamChat({
    query: 'hello',
    signal: controller.signal,
    fetchImpl,
    onStateChange: (state) => states.push(state.streamStatus),
  });

  assert.equal(finalState.streamStatus, 'error');
  assert.equal(finalState.protocolErrors[0].code, 'REQUEST_ABORTED');
  assert.deepEqual(states, ['streaming', 'error']);
});
