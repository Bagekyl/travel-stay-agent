const places = require('../data/haikou_target_places.json');
const { limitValue, optionalStringArray } = require('./validation');

const PRIORITY_RANK = {
  high: 3,
  medium: 2,
  low: 1,
};

const ARRAY_FIELDS = ['place_ids', 'categories', 'areas', 'trip_styles', 'tags', 'route_priorities'];

function validatePlaceSearchRequest(input = {}) {
  const limit = limitValue(input, 10);
  if (!limit.ok) return limit;

  const value = { limit: limit.value };
  for (const field of ARRAY_FIELDS) {
    const result = optionalStringArray(input, field);
    if (!result.ok) return result;
    value[field] = result.value;
  }

  return { ok: true, value };
}

function uniqueOrdered(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function hasOverlap(values, expected) {
  if (!expected || expected.length === 0) return true;
  return values.some((value) => expected.includes(value));
}

function matchesFilters(place, query) {
  if (query.categories?.length && !query.categories.includes(place.category)) return false;
  if (query.areas?.length && !query.areas.includes(place.area)) return false;
  if (query.route_priorities?.length && !query.route_priorities.includes(place.route_priority)) return false;
  if (!hasOverlap(place.trip_styles, query.trip_styles)) return false;
  if (!hasOverlap(place.tags, query.tags)) return false;
  return true;
}

function sortPlaces(a, b) {
  return (
    (PRIORITY_RANK[b.route_priority] || 0) - (PRIORITY_RANK[a.route_priority] || 0) ||
    a.name.localeCompare(b.name, 'zh-Hans-CN') ||
    a.place_id.localeCompare(b.place_id)
  );
}

function searchPlaces(input = {}, records = places) {
  const validation = validatePlaceSearchRequest(input);
  if (!validation.ok) return validation;
  const query = validation.value;

  if (query.place_ids?.length) {
    const ids = uniqueOrdered(query.place_ids);
    const byId = new Map(records.map((place) => [place.place_id, place]));
    const matched = ids.map((id) => byId.get(id)).filter(Boolean);
    const data = matched.slice(0, query.limit);
    const foundIds = new Set(matched.map((place) => place.place_id));
    return {
      ok: true,
      count: data.length,
      missing_place_ids: ids.filter((id) => !foundIds.has(id)),
      applied_filters: { place_ids: ids, limit: query.limit },
      data,
    };
  }

  const filtered = records.filter((place) => matchesFilters(place, query)).sort(sortPlaces);
  return {
    ok: true,
    count: Math.min(filtered.length, query.limit),
    total_candidates: filtered.length,
    missing_place_ids: [],
    applied_filters: query,
    data: filtered.slice(0, query.limit),
  };
}

module.exports = {
  PRIORITY_RANK,
  searchPlaces,
  validatePlaceSearchRequest,
};
