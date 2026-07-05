const test = require('node:test');
const assert = require('node:assert/strict');

const { searchPlaces } = require('../lib/place_search');

test('place_ids exact query returns one record', () => {
  const result = searchPlaces({ place_ids: ['place_hak_airport'] });
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.data[0].place_id, 'place_hak_airport');
});

test('multiple place_ids preserve request order', () => {
  const ids = ['place_hak_qilou', 'place_hak_airport', 'place_hak_east_station'];
  const result = searchPlaces({ place_ids: ids });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.map((place) => place.place_id), ids);
});

test('duplicate place_ids are ignored', () => {
  const result = searchPlaces({ place_ids: ['place_hak_qilou', 'place_hak_qilou'] });
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
});

test('missing place_ids are reported', () => {
  const result = searchPlaces({ place_ids: ['place_hak_airport', 'missing_id'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing_place_ids, ['missing_id']);
});

test('category filter works', () => {
  const result = searchPlaces({ categories: ['historical_site'], limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((place) => place.category === 'historical_site'));
});

test('area filter works', () => {
  const result = searchPlaces({ areas: ['龙华区'], limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((place) => place.area === '龙华区'));
});

test('tag filter works', () => {
  const result = searchPlaces({ tags: ['历史文化'], limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((place) => place.tags.includes('历史文化')));
});

test('trip_styles filter works', () => {
  const result = searchPlaces({ trip_styles: ['城市漫游'], limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((place) => place.trip_styles.includes('城市漫游')));
});

test('route_priority filter works', () => {
  const result = searchPlaces({ route_priorities: ['high'], limit: 24 });
  assert.equal(result.ok, true);
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((place) => place.route_priority === 'high'));
});

test('limit is honored for filtered places', () => {
  const result = searchPlaces({ tags: ['城市漫游'], limit: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(result.data.length, 2);
});
