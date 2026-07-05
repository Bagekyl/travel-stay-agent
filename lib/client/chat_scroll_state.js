const DEFAULT_BOTTOM_THRESHOLD_PX = 180;

function createScrollFollowState(options = {}) {
  return {
    autoFollowEnabled: true,
    userHasScrolledAway: false,
    hasPendingNewResults: false,
    bottomThresholdPx: options.bottomThresholdPx || DEFAULT_BOTTOM_THRESHOLD_PX,
    lastVisibleSignature: '',
  };
}

function isNearBottom(metrics, thresholdPx = DEFAULT_BOTTOM_THRESHOLD_PX) {
  const scrollY = typeof metrics?.scrollY === 'number' ? metrics.scrollY : 0;
  const viewportHeight = typeof metrics?.viewportHeight === 'number' ? metrics.viewportHeight : 0;
  const scrollHeight = typeof metrics?.scrollHeight === 'number' ? metrics.scrollHeight : 0;
  const distance = Math.max(0, scrollHeight - (scrollY + viewportHeight));
  return distance <= thresholdPx;
}

function updateScrollPosition(state, metrics) {
  const nearBottom = isNearBottom(metrics, state.bottomThresholdPx);
  if (nearBottom) {
    return {
      ...state,
      autoFollowEnabled: true,
      userHasScrolledAway: false,
      hasPendingNewResults: false,
    };
  }
  return {
    ...state,
    autoFollowEnabled: false,
    userHasScrolledAway: true,
  };
}

function visibleContentSignature(view) {
  const reasonCount = Array.isArray(view?.recommendationReasons) ? view.recommendationReasons.length : 0;
  const alternativeCount = Array.isArray(view?.alternativeRecommendations) ? view.alternativeRecommendations.length : 0;
  const routeStatsCount = Array.isArray(view?.route?.stats) ? view.route.stats.length : 0;
  const weatherDailyCount = Array.isArray(view?.weather?.dailyForecasts) ? view.weather.dailyForecasts.length : 0;
  const hasVisibleContent = !!(
    view?.primaryRecommendation
    || reasonCount > 0
    || alternativeCount > 0
    || view?.route
    || view?.weather
    || view?.dataNotice
    || view?.exception
  );
  if (!hasVisibleContent) return '';
  return [
    view?.primaryRecommendation?.hotel?.hotelId || '',
    reasonCount,
    alternativeCount,
    view?.route ? `route:${routeStatsCount}:${view.route.advice ? 1 : 0}` : '',
    view?.weather ? `weather:${weatherDailyCount}:${view.weather.advice ? 1 : 0}:${view.weather.riskMessages?.length || 0}` : '',
    view?.dataNotice ? 'notice' : '',
    view?.exception?.type || '',
    view?.status?.tone === 'done' ? 'done' : '',
  ].join('|');
}

function handleVisibleContentChange(state, metrics, signature) {
  if (!signature || signature === state.lastVisibleSignature) {
    return { state, shouldFollow: false, changed: false };
  }

  const nearBottom = isNearBottom(metrics, state.bottomThresholdPx);
  const shouldFollow = nearBottom || (state.autoFollowEnabled && !state.userHasScrolledAway);
  const nextState = {
    ...state,
    lastVisibleSignature: signature,
    autoFollowEnabled: shouldFollow,
    userHasScrolledAway: !shouldFollow,
    hasPendingNewResults: shouldFollow ? false : true,
  };
  return { state: nextState, shouldFollow, changed: true };
}

function markFollowed(state) {
  return {
    ...state,
    autoFollowEnabled: true,
    userHasScrolledAway: false,
    hasPendingNewResults: false,
  };
}

function resetScrollFollowState(state) {
  return createScrollFollowState({ bottomThresholdPx: state?.bottomThresholdPx || DEFAULT_BOTTOM_THRESHOLD_PX });
}

module.exports = {
  DEFAULT_BOTTOM_THRESHOLD_PX,
  createScrollFollowState,
  handleVisibleContentChange,
  isNearBottom,
  markFollowed,
  resetScrollFollowState,
  updateScrollPosition,
  visibleContentSignature,
};
