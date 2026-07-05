const test = require('node:test');
const assert = require('node:assert/strict');

const { searchHotels } = require('../lib/hotel_search');

function hotel(overrides) {
  return {
    hotel_id: 'h_default',
    name: 'Default Hotel',
    area: '龙华区',
    sub_area: '国贸CBD',
    mock_price_per_night: 500,
    room_types: [{ type: '大床房', max_guests: 2 }],
    availability: { available: true },
    parking: { available: true },
    cancellation: { free_cancellation: true },
    review: { score: 4.0 },
    tags: [],
    target_users: [],
    trip_styles: [],
    ...overrides,
  };
}

test('empty hotel search returns default candidates', () => {
  const result = searchHotels({});
  assert.equal(result.ok, true);
  assert.equal(result.count, 5);
  assert.equal(result.data.length, 5);
});

test('budget filter limits hotel prices', () => {
  const result = searchHotels({ budget: { min: 400, max: 800 }, limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((hotel) => hotel.mock_price_per_night >= 400 && hotel.mock_price_per_night <= 800));
});

test('area filter returns only requested area', () => {
  const result = searchHotels({ areas: ['龙华区'], limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.every((hotel) => hotel.area === '龙华区'));
});

test('preferred areas do not filter out other areas', () => {
  const records = [
    hotel({ hotel_id: 'h1', area: '龙华区', review: { score: 4.0 } }),
    hotel({ hotel_id: 'h2', area: '西海岸', review: { score: 4.1 } }),
  ];
  const result = searchHotels({ preferred_areas: ['龙华区'], limit: 24 }, records);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.deepEqual(new Set(result.data.map((item) => item.area)), new Set(['龙华区', '西海岸']));
});

test('preferred sub areas do not filter out other sub areas', () => {
  const records = [
    hotel({ hotel_id: 'h1', sub_area: '国贸CBD', review: { score: 4.0 } }),
    hotel({ hotel_id: 'h2', sub_area: '滨海大道', review: { score: 4.1 } }),
  ];
  const result = searchHotels({ preferred_sub_areas: ['国贸CBD'], limit: 24 }, records);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.deepEqual(new Set(result.data.map((item) => item.sub_area)), new Set(['国贸CBD', '滨海大道']));
});

test('preferred areas add score and match reason', () => {
  const records = [
    hotel({ hotel_id: 'h1', area: '龙华区', review: { score: 4.0 } }),
    hotel({ hotel_id: 'h2', area: '西海岸', review: { score: 4.9 } }),
  ];
  const result = searchHotels({ preferred_areas: ['龙华区'], limit: 2 }, records);
  assert.equal(result.data[0].hotel_id, 'h1');
  assert.equal(result.data[0].match_score, 3);
  assert.ok(result.data[0].match_reasons.includes('匹配偏好区域：龙华区'));
});

test('preferred sub areas add score and match reason', () => {
  const records = [
    hotel({ hotel_id: 'h1', sub_area: '国贸CBD', review: { score: 4.0 } }),
    hotel({ hotel_id: 'h2', sub_area: '滨海大道', review: { score: 4.9 } }),
  ];
  const result = searchHotels({ preferred_sub_areas: ['国贸CBD'], limit: 2 }, records);
  assert.equal(result.data[0].hotel_id, 'h1');
  assert.equal(result.data[0].match_score, 4);
  assert.ok(result.data[0].match_reasons.includes('匹配偏好片区：国贸CBD'));
});

test('guests filter checks room type max_guests', () => {
  const result = searchHotels({ guests: 4, limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((hotel) => hotel.room_types.some((room) => room.max_guests >= 4)));
});

test('availability filter returns available records only', () => {
  const result = searchHotels({ availability_only: true, limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.every((hotel) => hotel.availability.available === true));
});

test('parking filter returns parking-capable records only', () => {
  const result = searchHotels({ parking_required: true, limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.every((hotel) => hotel.parking.available === true));
});

test('sub area filter remains a hard filter', () => {
  const result = searchHotels({ sub_areas: ['国贸CBD'], limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((hotel) => hotel.sub_area === '国贸CBD'));
});

test('trip style contributes to deterministic ranking reasons', () => {
  const result = searchHotels({ trip_styles: ['商务出差'], limit: 5 });
  assert.equal(result.ok, true);
  assert.ok(result.data.some((hotel) => hotel.match_reasons.includes('匹配旅行类型：商务出差')));
  for (let i = 1; i < result.data.length; i += 1) {
    assert.ok(result.data[i - 1].match_score >= result.data[i].match_score);
  }
});

test('tags contribute to deterministic ranking reasons', () => {
  const result = searchHotels({ tags: ['近机场'], limit: 5 });
  assert.equal(result.ok, true);
  assert.ok(result.data.some((hotel) => hotel.match_reasons.includes('匹配标签：近机场')));
});

test('limit is honored', () => {
  const result = searchHotels({ limit: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.count, 3);
  assert.equal(result.data.length, 3);
});

test('invalid budget is rejected', () => {
  const result = searchHotels({ budget: { min: 1200, max: 400 } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_REQUEST');
});

test('invalid guests is rejected', () => {
  const result = searchHotels({ guests: '两个人' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_REQUEST');
});

test('old request without preferred fields preserves result order', () => {
  const input = { trip_styles: ['商务出差'], limit: 5 };
  const first = searchHotels(input);
  const second = searchHotels(input);
  assert.deepEqual(first.data.map((item) => item.hotel_id), second.data.map((item) => item.hotel_id));
  assert.equal(first.applied_preferences.preferred_areas, undefined);
  assert.equal(first.applied_preferences.preferred_sub_areas, undefined);
});

test('invalid preferred areas is rejected', () => {
  const result = searchHotels({ preferred_areas: '龙华区' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_REQUEST');
});

test('invalid preferred sub areas is rejected', () => {
  const result = searchHotels({ preferred_sub_areas: ['国贸CBD', 1] });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_REQUEST');
});

test('hard area and preferred area do not double score the same value', () => {
  const records = [hotel({ hotel_id: 'h1', area: '龙华区' })];
  const result = searchHotels({ areas: ['龙华区'], preferred_areas: ['龙华区'] }, records);
  assert.equal(result.data[0].match_score, 3);
  assert.deepEqual(result.data[0].match_reasons, ['匹配目标区域：龙华区']);
});

test('hard sub area and preferred sub area do not double score the same value', () => {
  const records = [hotel({ hotel_id: 'h1', sub_area: '国贸CBD' })];
  const result = searchHotels({ sub_areas: ['国贸CBD'], preferred_sub_areas: ['国贸CBD'] }, records);
  assert.equal(result.data[0].match_score, 4);
  assert.deepEqual(result.data[0].match_reasons, ['匹配目标片区：国贸CBD']);
});

test('real preferred sub area case returns candidates without making preference a hard filter', () => {
  const result = searchHotels({
    availability_only: true,
    limit: 5,
    budget: {
      min: 0,
      max: 1200,
    },
    guests: 2,
    preferred_sub_areas: ['观澜湖'],
    trip_styles: ['纯度假', '自驾'],
    tags: ['适合纯度假'],
    target_users: ['度假旅客'],
  });
  assert.equal(result.ok, true);
  assert.ok(result.count > 0);
  assert.ok(result.data.every((item) => item.availability.available === true));
  assert.ok(result.data.every((item) => item.mock_price_per_night >= 0 && item.mock_price_per_night <= 1200));
  assert.ok(result.data.every((item) => item.room_types.some((room) => room.max_guests >= 2)));
  assert.ok(result.data.some((item) => item.sub_area !== '观澜湖'));
  assert.deepEqual(result.applied_preferences.preferred_sub_areas, ['观澜湖']);
});
