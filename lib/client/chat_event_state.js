const RESPONSE_MODES = new Set([
  'normal',
  'no_candidate',
  'unsupported_city',
  'invalid_trip_date',
  'clarification_required',
]);

const KNOWN_EVENT_TYPES = new Set([
  'fact_frame',
  'primary_recommendation',
  'recommendation_reason',
  'alternative_recommendation',
  'route_advice',
  'weather_advice',
  'data_notice',
  'no_candidate',
  'unsupported_city',
  'invalid_trip_date',
  'clarification_required',
  'done',
]);

function createInitialChatState() {
  return {
    streamStatus: 'idle',
    responseMode: null,
    conversationId: '',
    awaitingUserInput: false,
    factFrame: null,
    primaryRecommendation: null,
    recommendationReasons: [],
    alternativeRecommendations: [],
    routeAdvice: null,
    weatherAdvice: null,
    dataNotice: null,
    noCandidate: null,
    unsupportedCity: null,
    invalidTripDate: null,
    clarification: null,
    protocolErrors: [],
  };
}

function cloneState(state) {
  return {
    ...state,
    recommendationReasons: [...state.recommendationReasons],
    alternativeRecommendations: [...state.alternativeRecommendations],
    protocolErrors: [...state.protocolErrors],
  };
}

function protocolError(message, details = {}) {
  return {
    message,
    ...details,
  };
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string';
}

function isArray(value) {
  return Array.isArray(value);
}

function requireFields(payload, checks) {
  const missing = [];
  for (const [field, check] of Object.entries(checks)) {
    if (!check(payload[field])) missing.push(field);
  }
  return missing;
}

function validateKnownEvent(event) {
  const payload = event.payload;

  switch (event.type) {
    case 'fact_frame':
      return requireFields(payload, {
        schema_version: isString,
        hotels: isArray,
        target_places: isArray,
        route_matrix: isObject,
        weather: isObject,
      });
    case 'primary_recommendation':
      return requireFields(payload, {
        hotel_id: isString,
        summary: isString,
        tradeoff: isString,
      });
    case 'recommendation_reason':
      return requireFields(payload, {
        dimension: isString,
        title: isString,
        content: isString,
        related_hotel_ids: isArray,
        related_place_ids: isArray,
      });
    case 'alternative_recommendation':
      return requireFields(payload, {
        hotel_id: isString,
        label: isString,
        fit_for: isString,
        reason: isString,
        tradeoff: isString,
      });
    case 'route_advice':
    case 'weather_advice':
    case 'data_notice':
      return requireFields(payload, { content: isString });
    case 'no_candidate':
      return requireFields(payload, {
        summary: isString,
        detail: isString,
      });
    case 'unsupported_city':
      return requireFields(payload, {
        city: isString,
        supported_cities: isArray,
        message: isString,
      });
    case 'invalid_trip_date':
      return requireFields(payload, { message: isString });
    case 'clarification_required':
      return requireFields(payload, {
        message: isString,
        awaiting_user_input: (value) => typeof value === 'boolean',
      });
    case 'done':
      return [];
    default:
      return [];
  }
}

function withProtocolError(state, message, details = {}) {
  const next = cloneState(state);
  next.protocolErrors.push(protocolError(message, details));
  if (next.streamStatus !== 'done') next.streamStatus = 'error';
  return next;
}

function setConversationId(state, conversationId) {
  if (!conversationId) return state;
  return {
    ...state,
    conversationId,
  };
}

function reduceChatEvent(state, event) {
  let next = cloneState(state);
  if (next.streamStatus === 'idle') next.streamStatus = 'streaming';

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return withProtocolError(next, 'business event must be an object', { code: 'INVALID_EVENT' });
  }
  if (typeof event.type !== 'string' || event.type.trim() === '') {
    return withProtocolError(next, 'business event type must be a non-empty string', { code: 'INVALID_EVENT_TYPE' });
  }
  if (!isObject(event.payload)) {
    return withProtocolError(next, 'business event payload must be an object', {
      code: 'INVALID_EVENT_PAYLOAD',
      eventType: event.type,
    });
  }
  if (!KNOWN_EVENT_TYPES.has(event.type)) {
    next.protocolErrors.push(protocolError('unknown business event type', {
      code: 'UNKNOWN_EVENT_TYPE',
      eventType: event.type,
    }));
    return next;
  }

  const missing = validateKnownEvent(event);
  if (missing.length > 0) {
    return withProtocolError(next, 'business event is missing required fields', {
      code: 'MALFORMED_EVENT',
      eventType: event.type,
      missing,
    });
  }

  switch (event.type) {
    case 'fact_frame':
      next.factFrame = event.payload;
      next.responseMode = 'normal';
      break;
    case 'primary_recommendation':
      next.primaryRecommendation = event.payload;
      break;
    case 'recommendation_reason':
      next.recommendationReasons.push(event.payload);
      break;
    case 'alternative_recommendation':
      next.alternativeRecommendations.push(event.payload);
      break;
    case 'route_advice':
      next.routeAdvice = event.payload;
      break;
    case 'weather_advice':
      next.weatherAdvice = event.payload;
      break;
    case 'data_notice':
      next.dataNotice = event.payload;
      break;
    case 'no_candidate':
      next.noCandidate = event.payload;
      next.responseMode = 'no_candidate';
      break;
    case 'unsupported_city':
      next.unsupportedCity = event.payload;
      next.responseMode = 'unsupported_city';
      break;
    case 'invalid_trip_date':
      next.invalidTripDate = event.payload;
      next.responseMode = 'invalid_trip_date';
      break;
    case 'clarification_required':
      next.clarification = event.payload;
      next.responseMode = 'clarification_required';
      next.awaitingUserInput = event.payload.awaiting_user_input === true;
      break;
    case 'done':
      next.streamStatus = 'done';
      break;
    default:
      break;
  }

  if (next.responseMode && !RESPONSE_MODES.has(next.responseMode)) {
    next.protocolErrors.push(protocolError('invalid response mode', {
      code: 'INVALID_RESPONSE_MODE',
      responseMode: next.responseMode,
    }));
  }

  return next;
}

module.exports = {
  KNOWN_EVENT_TYPES,
  createInitialChatState,
  reduceChatEvent,
  setConversationId,
  validateKnownEvent,
};
