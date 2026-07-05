const hotels = require('../data/mock_hotels_haikou.json');
const {
  invalid,
  limitValue,
  optionalBoolean,
  optionalPositiveInteger,
  optionalStringArray,
  validateBudget,
} = require('./validation');

const WEIGHTS = {
  area: 3,
  sub_area: 4,
  trip_style: 2,
  target_user: 2,
  tag: 1,
};

const ARRAY_FIELDS = [
  'areas',
  'sub_areas',
  'preferred_areas',
  'preferred_sub_areas',
  'trip_styles',
  'target_users',
  'tags',
];

function validateHotelSearchRequest(input = {}) {
  const budget = validateBudget(input);
  if (!budget.ok) return budget;

  const limit = limitValue(input, 5);
  if (!limit.ok) return limit;

  const guests = optionalPositiveInteger(input, 'guests');
  if (!guests.ok) return guests;

  const availabilityOnly = optionalBoolean(input, 'availability_only');
  if (!availabilityOnly.ok) return availabilityOnly;

  const parkingRequired = optionalBoolean(input, 'parking_required');
  if (!parkingRequired.ok) return parkingRequired;

  const freeCancellationRequired = optionalBoolean(input, 'free_cancellation_required');
  if (!freeCancellationRequired.ok) return freeCancellationRequired;

  const value = {
    budget: budget.value,
    limit: limit.value,
    guests: guests.value,
    availability_only: availabilityOnly.value,
    parking_required: parkingRequired.value,
    free_cancellation_required: freeCancellationRequired.value,
  };

  for (const field of ARRAY_FIELDS) {
    const result = optionalStringArray(input, field);
    if (!result.ok) return result;
    value[field] = result.value;
  }

  return { ok: true, value };
}

function hasOverlap(values, expected) {
  if (!expected || expected.length === 0) return false;
  return values.some((value) => expected.includes(value));
}

function passesHardFilters(hotel, query) {
  const price = hotel.mock_price_per_night;
  if (query.budget?.min !== undefined && price < query.budget.min) return false;
  if (query.budget?.max !== undefined && price > query.budget.max) return false;
  if (query.areas?.length && !query.areas.includes(hotel.area)) return false;
  if (query.sub_areas?.length && !query.sub_areas.includes(hotel.sub_area)) return false;
  if (query.guests && !hotel.room_types.some((room) => room.max_guests >= query.guests)) return false;
  if (query.availability_only === true && hotel.availability?.available !== true) return false;
  if (query.parking_required === true && hotel.parking?.available !== true) return false;
  if (query.free_cancellation_required === true && hotel.cancellation?.free_cancellation !== true) return false;
  return true;
}

function scoreHotel(hotel, query) {
  let score = 0;
  const reasons = [];

  if (query.areas?.includes(hotel.area)) {
    score += WEIGHTS.area;
    reasons.push(`匹配目标区域：${hotel.area}`);
  }
  if (query.preferred_areas?.includes(hotel.area) && !query.areas?.includes(hotel.area)) {
    score += WEIGHTS.area;
    reasons.push(`匹配偏好区域：${hotel.area}`);
  }
  if (query.sub_areas?.includes(hotel.sub_area)) {
    score += WEIGHTS.sub_area;
    reasons.push(`匹配目标片区：${hotel.sub_area}`);
  }
  if (query.preferred_sub_areas?.includes(hotel.sub_area) && !query.sub_areas?.includes(hotel.sub_area)) {
    score += WEIGHTS.sub_area;
    reasons.push(`匹配偏好片区：${hotel.sub_area}`);
  }
  for (const style of hotel.trip_styles) {
    if (query.trip_styles?.includes(style)) {
      score += WEIGHTS.trip_style;
      reasons.push(`匹配旅行类型：${style}`);
    }
  }
  for (const user of hotel.target_users) {
    if (query.target_users?.includes(user)) {
      score += WEIGHTS.target_user;
      reasons.push(`匹配目标用户：${user}`);
    }
  }
  for (const tag of hotel.tags) {
    if (query.tags?.includes(tag)) {
      score += WEIGHTS.tag;
      reasons.push(`匹配标签：${tag}`);
    }
  }

  return { score, reasons };
}

function sortHotels(a, b) {
  return (
    b.match_score - a.match_score ||
    (b.review?.score || 0) - (a.review?.score || 0) ||
    a.mock_price_per_night - b.mock_price_per_night ||
    a.hotel_id.localeCompare(b.hotel_id)
  );
}

function searchHotels(input = {}, records = hotels) {
  const validation = validateHotelSearchRequest(input);
  if (!validation.ok) return validation;
  const query = validation.value;

  const filtered = records.filter((hotel) => passesHardFilters(hotel, query));
  const ranked = filtered
    .map((hotel) => {
      const { score, reasons } = scoreHotel(hotel, query);
      return {
        ...hotel,
        match_score: score,
        match_reasons: reasons,
      };
    })
    .sort(sortHotels);

  return {
    ok: true,
    count: Math.min(ranked.length, query.limit),
    total_candidates: ranked.length,
    applied_filters: query,
    applied_preferences: {
      preferred_areas: query.preferred_areas,
      preferred_sub_areas: query.preferred_sub_areas,
      trip_styles: query.trip_styles,
      target_users: query.target_users,
      tags: query.tags,
    },
    data: ranked.slice(0, query.limit),
  };
}

module.exports = {
  WEIGHTS,
  searchHotels,
  validateHotelSearchRequest,
};
