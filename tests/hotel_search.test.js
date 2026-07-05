const test = require('node:test');
const assert = require('node:assert/strict');

const { searchHotels } = require('../lib/hotel_search');

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
