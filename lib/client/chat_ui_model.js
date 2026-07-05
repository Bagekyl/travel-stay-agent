const DIMENSION_PRESENTATION = {
  style: { label: '旅行风格', icon: 'spark' },
  route: { label: '交通路线', icon: 'route' },
  budget: { label: '预算匹配', icon: 'wallet' },
  area: { label: '区域取舍', icon: 'pin' },
  weather: { label: '天气影响', icon: 'cloud' },
  convenience: { label: '便利性', icon: 'grid' },
  other: { label: '综合判断', icon: 'note' },
};

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toMap(items, idField) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (item && typeof item[idField] === 'string') map.set(item[idField], item);
  }
  return map;
}

function formatPrice(price) {
  if (!isObject(price) || typeof price.amount_cny !== 'number') return null;
  return `¥${Math.round(price.amount_cny)} / 晚`;
}

function formatStars(value) {
  if (typeof value !== 'number') return null;
  return `${value} 星`;
}

function formatReview(review) {
  if (!isObject(review) || typeof review.score !== 'number') return null;
  return `评分 ${review.score}`;
}

function breakfastLabel(breakfast) {
  if (!isObject(breakfast)) return null;
  if (breakfast.included === true) return '含早餐';
  if (breakfast.included === false && typeof breakfast.price_cny === 'number') {
    return `早餐另付 ¥${Math.round(breakfast.price_cny)}`;
  }
  if (breakfast.included === false) return '早餐另付';
  return null;
}

function booleanChip(value, trueLabel, falseLabel) {
  if (!isObject(value)) return null;
  if (value.available === true) return trueLabel;
  if (value.available === false) return falseLabel;
  if (value.free_cancellation === true) return trueLabel;
  if (value.free_cancellation === false) return falseLabel;
  return null;
}

function hotelChips(hotel) {
  if (!hotel) return [];
  return [
    formatPrice(hotel.price),
    formatStars(hotel.star_rating),
    formatReview(hotel.review),
    breakfastLabel(hotel.breakfast),
    booleanChip(hotel.parking, '可停车', '停车不便'),
    booleanChip(hotel.cancellation, '可免费取消', '取消受限'),
  ].filter(Boolean);
}

function createIndexes(factFrame) {
  const hotels = Array.isArray(factFrame?.hotels) ? factFrame.hotels : [];
  const targetPlaces = Array.isArray(factFrame?.target_places) ? factFrame.target_places : [];
  const routeStats = Array.isArray(factFrame?.route_matrix?.hotel_route_stats)
    ? factFrame.route_matrix.hotel_route_stats
    : [];

  return {
    hotelById: toMap(hotels, 'hotel_id'),
    targetPlaceById: toMap(targetPlaces, 'place_id'),
    routeStatsByHotelId: toMap(routeStats, 'hotel_id'),
  };
}

function hotelSummary(hotel) {
  if (!hotel) return null;
  return {
    hotelId: hotel.hotel_id,
    name: hotel.name || hotel.hotel_id,
    brand: hotel.brand || '',
    area: hotel.area || '',
    subArea: hotel.sub_area || '',
    address: hotel.address || '',
    hotelType: hotel.hotel_type || '',
    starRating: hotel.star_rating,
    priceText: formatPrice(hotel.price),
    reviewText: formatReview(hotel.review),
    chips: hotelChips(hotel),
    tags: Array.isArray(hotel.tags) ? hotel.tags : [],
    tripStyles: Array.isArray(hotel.trip_styles) ? hotel.trip_styles : [],
    facilities: Array.isArray(hotel.facilities) ? hotel.facilities : [],
    matchScore: hotel.match_score,
    matchReasons: Array.isArray(hotel.match_reasons) ? hotel.match_reasons : [],
  };
}

function routeSummary(routeStats) {
  if (!routeStats) return null;
  return {
    hotelId: routeStats.hotel_id,
    hotelName: routeStats.hotel_name || routeStats.hotel_id,
    routeCount: routeStats.route_count,
    averageDurationMinutes: routeStats.average_duration_minutes,
    averageDistanceKm: routeStats.average_distance_km,
    highPriorityAverageDurationMinutes: routeStats.high_priority_average_duration_minutes,
    routeRank: routeStats.route_rank,
    fastestRoute: routeStats.fastest_route || null,
    slowestRoute: routeStats.slowest_route || null,
    routes: Array.isArray(routeStats.routes) ? routeStats.routes : [],
  };
}

function buildPrimaryRecommendationView(state) {
  if (!state.primaryRecommendation) return null;
  const { hotelById, routeStatsByHotelId } = createIndexes(state.factFrame);
  const hotel = hotelById.get(state.primaryRecommendation.hotel_id);
  return {
    type: 'primary',
    hotel: hotelSummary(hotel) || {
      hotelId: state.primaryRecommendation.hotel_id,
      name: state.primaryRecommendation.hotel_id,
      chips: [],
      tags: [],
      tripStyles: [],
      facilities: [],
      matchReasons: [],
    },
    summary: state.primaryRecommendation.summary || '',
    tradeoff: state.primaryRecommendation.tradeoff || '',
    route: routeSummary(routeStatsByHotelId.get(state.primaryRecommendation.hotel_id)),
  };
}

function dimensionPresentation(dimension) {
  return DIMENSION_PRESENTATION[dimension] || {
    label: dimension || '综合判断',
    icon: 'note',
  };
}

function buildReasonViews(state) {
  return state.recommendationReasons.map((reason, index) => ({
    key: `reason-${index}`,
    index,
    dimension: reason.dimension || 'other',
    presentation: dimensionPresentation(reason.dimension || 'other'),
    title: reason.title || '',
    content: reason.content || '',
    relatedHotelIds: Array.isArray(reason.related_hotel_ids) ? reason.related_hotel_ids : [],
    relatedPlaceIds: Array.isArray(reason.related_place_ids) ? reason.related_place_ids : [],
  }));
}

function buildAlternativeViews(state) {
  const { hotelById, routeStatsByHotelId } = createIndexes(state.factFrame);
  return state.alternativeRecommendations.map((alternative, index) => {
    const hotel = hotelById.get(alternative.hotel_id);
    return {
      key: `alternative-${index}-${alternative.hotel_id || 'unknown'}`,
      index,
      hotel: hotelSummary(hotel) || {
        hotelId: alternative.hotel_id,
        name: alternative.hotel_id || '备选酒店',
        chips: [],
        tags: [],
        tripStyles: [],
        facilities: [],
        matchReasons: [],
      },
      label: alternative.label || '',
      fitFor: alternative.fit_for || '',
      reason: alternative.reason || '',
      tradeoff: alternative.tradeoff || '',
      route: routeSummary(routeStatsByHotelId.get(alternative.hotel_id)),
    };
  });
}

function buildRouteView(state) {
  const routeMatrix = state.factFrame?.route_matrix;
  if (!isObject(routeMatrix)) return null;
  if (routeMatrix.valid === false) {
    return {
      valid: false,
      stats: [],
      advice: state.routeAdvice?.content || '',
    };
  }

  const stats = Array.isArray(routeMatrix.hotel_route_stats)
    ? routeMatrix.hotel_route_stats
      .map(routeSummary)
      .filter(Boolean)
      .sort((a, b) => {
        const rankA = typeof a.routeRank === 'number' ? a.routeRank : Number.MAX_SAFE_INTEGER;
        const rankB = typeof b.routeRank === 'number' ? b.routeRank : Number.MAX_SAFE_INTEGER;
        return rankA - rankB;
      })
    : [];

  if (stats.length === 0 && !state.routeAdvice) return null;
  return {
    valid: true,
    stats,
    advice: state.routeAdvice?.content || '',
  };
}

function buildWeatherView(state) {
  const weather = state.factFrame?.weather;
  if (!isObject(weather) && !state.weatherAdvice) return null;
  return {
    available: weather?.available === true,
    coverageMode: weather?.coverage_mode || '',
    context: weather?.context || '',
    source: weather?.source || '',
    advice: state.weatherAdvice?.content || '',
  };
}

function buildStatusView(state) {
  if (state.streamStatus === 'idle') return { label: '准备开始', tone: 'idle' };
  if (state.streamStatus === 'streaming') return { label: '正在分析住宿方案…', tone: 'streaming' };
  if (state.streamStatus === 'done') return { label: '分析完成', tone: 'done' };
  if (state.streamStatus === 'error') return { label: '分析遇到问题', tone: 'error' };
  return { label: state.streamStatus || '', tone: 'idle' };
}

function buildExceptionView(state) {
  if (state.noCandidate) {
    return {
      type: 'no_candidate',
      title: '暂时没有找到符合条件的酒店',
      payload: state.noCandidate,
    };
  }
  if (state.unsupportedCity) {
    return {
      type: 'unsupported_city',
      title: '城市暂未支持',
      payload: state.unsupportedCity,
    };
  }
  if (state.invalidTripDate) {
    return {
      type: 'invalid_trip_date',
      title: '旅行日期需要调整',
      payload: state.invalidTripDate,
    };
  }
  if (state.clarification) {
    return {
      type: 'clarification_required',
      title: '还需要补充一点信息',
      payload: state.clarification,
    };
  }
  return null;
}

function buildChatViewModel(state) {
  return {
    status: buildStatusView(state),
    responseMode: state.responseMode,
    conversationId: state.conversationId || '',
    awaitingUserInput: state.awaitingUserInput === true,
    primaryRecommendation: buildPrimaryRecommendationView(state),
    recommendationReasons: buildReasonViews(state),
    alternativeRecommendations: buildAlternativeViews(state),
    route: buildRouteView(state),
    weather: buildWeatherView(state),
    dataNotice: state.dataNotice || null,
    exception: buildExceptionView(state),
    protocolErrors: Array.isArray(state.protocolErrors) ? state.protocolErrors : [],
    hasFactFrame: !!state.factFrame,
  };
}

module.exports = {
  DIMENSION_PRESENTATION,
  buildAlternativeViews,
  buildChatViewModel,
  buildPrimaryRecommendationView,
  buildReasonViews,
  buildRouteView,
  buildWeatherView,
  createIndexes,
  dimensionPresentation,
};
