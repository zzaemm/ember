// Run: node tests/search.test.js
const assert = require('assert');
const { matchPlaces, placeArea } = require('../app/search.js');
const all = require('../app/data/places.json').places;

const wayanad = matchPlaces(all, 'Wayanad');
assert.strictEqual(wayanad[0][0], 'Wayanad');
assert.strictEqual(wayanad[0][3], 'district');

const kerala = all.find(p => p[0] === 'Kerala' && p[3] === 'state');
assert.deepStrictEqual(placeArea(kerala), { preset: 'kerala' });

const rajasthan = all.find(p => p[0] === 'Rajasthan' && p[3] === 'state');
assert.strictEqual(placeArea(rajasthan).label, 'the area around the centre of Rajasthan');

assert.deepStrictEqual(matchPlaces(all, 'k'), []);
console.log('search: ok');
