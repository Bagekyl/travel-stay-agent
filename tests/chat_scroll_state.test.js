const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createScrollFollowState,
  handleVisibleContentChange,
  isNearBottom,
  markFollowed,
  resetScrollFollowState,
  updateScrollPosition,
  visibleContentSignature,
} = require('../lib/client/chat_scroll_state');

const bottomMetrics = { scrollY: 740, viewportHeight: 800, scrollHeight: 1700 };
const farMetrics = { scrollY: 80, viewportHeight: 800, scrollHeight: 1700 };

function view(overrides = {}) {
  return {
    status: { tone: 'streaming' },
    primaryRecommendation: null,
    recommendationReasons: [],
    alternativeRecommendations: [],
    route: null,
    weather: null,
    dataNotice: null,
    exception: null,
    ...overrides,
  };
}

test('near bottom metrics are detected within threshold', () => {
  assert.equal(isNearBottom(bottomMetrics, 180), true);
  assert.equal(isNearBottom(farMetrics, 180), false);
});

test('near bottom new result requests auto follow', () => {
  const state = createScrollFollowState({ bottomThresholdPx: 180 });
  const signature = visibleContentSignature(view({
    primaryRecommendation: { hotel: { hotelId: 'h1' } },
  }));

  const result = handleVisibleContentChange(state, bottomMetrics, signature);

  assert.equal(result.shouldFollow, true);
  assert.equal(result.state.autoFollowEnabled, true);
  assert.equal(result.state.hasPendingNewResults, false);
});

test('far from bottom new result does not auto follow and shows indicator', () => {
  let state = createScrollFollowState({ bottomThresholdPx: 180 });
  state = updateScrollPosition(state, farMetrics);
  const signature = visibleContentSignature(view({
    recommendationReasons: [{ key: 'reason-1' }],
  }));

  const result = handleVisibleContentChange(state, farMetrics, signature);

  assert.equal(result.shouldFollow, false);
  assert.equal(result.state.autoFollowEnabled, false);
  assert.equal(result.state.userHasScrolledAway, true);
  assert.equal(result.state.hasPendingNewResults, true);
});

test('clicking new results restores follow state', () => {
  let state = createScrollFollowState();
  state = { ...state, autoFollowEnabled: false, userHasScrolledAway: true, hasPendingNewResults: true };

  const next = markFollowed(state);

  assert.equal(next.autoFollowEnabled, true);
  assert.equal(next.userHasScrolledAway, false);
  assert.equal(next.hasPendingNewResults, false);
});

test('manual scroll back to bottom clears pending indicator', () => {
  let state = createScrollFollowState({ bottomThresholdPx: 180 });
  state = { ...state, autoFollowEnabled: false, userHasScrolledAway: true, hasPendingNewResults: true };

  const next = updateScrollPosition(state, bottomMetrics);

  assert.equal(next.autoFollowEnabled, true);
  assert.equal(next.userHasScrolledAway, false);
  assert.equal(next.hasPendingNewResults, false);
});

test('done follows at bottom but does not steal viewport when user is reading above', () => {
  const doneSignature = visibleContentSignature(view({
    status: { tone: 'done' },
    primaryRecommendation: { hotel: { hotelId: 'h1' } },
  }));

  const bottomResult = handleVisibleContentChange(createScrollFollowState(), bottomMetrics, doneSignature);
  let farState = updateScrollPosition(createScrollFollowState(), farMetrics);
  const farResult = handleVisibleContentChange(farState, farMetrics, doneSignature);

  assert.equal(bottomResult.shouldFollow, true);
  assert.equal(farResult.shouldFollow, false);
  assert.equal(farResult.state.hasPendingNewResults, true);
});

test('reset returns to auto follow and clears pending state', () => {
  const state = {
    ...createScrollFollowState({ bottomThresholdPx: 180 }),
    autoFollowEnabled: false,
    userHasScrolledAway: true,
    hasPendingNewResults: true,
    lastVisibleSignature: 'old',
  };

  const reset = resetScrollFollowState(state);

  assert.equal(reset.autoFollowEnabled, true);
  assert.equal(reset.userHasScrolledAway, false);
  assert.equal(reset.hasPendingNewResults, false);
  assert.equal(reset.lastVisibleSignature, '');
});

test('abnormal card follows the same visible content logic', () => {
  let state = updateScrollPosition(createScrollFollowState(), farMetrics);
  const signature = visibleContentSignature(view({
    exception: { type: 'unsupported_city' },
  }));

  const result = handleVisibleContentChange(state, farMetrics, signature);

  assert.equal(result.shouldFollow, false);
  assert.equal(result.state.hasPendingNewResults, true);
});

test('repeated visible signature does not trigger scrolling', () => {
  const signature = visibleContentSignature(view({
    alternativeRecommendations: [{ key: 'alt-1' }],
  }));
  const first = handleVisibleContentChange(createScrollFollowState(), bottomMetrics, signature);
  const second = handleVisibleContentChange(first.state, bottomMetrics, signature);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.shouldFollow, false);
});

test('conversation or status-only update has no visible signature', () => {
  assert.equal(visibleContentSignature(view({ status: { tone: 'streaming' } })), '');
});
