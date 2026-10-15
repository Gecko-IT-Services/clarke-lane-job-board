import assert from 'node:assert/strict';
import { postcodeOf, milesBetween, nearbyStops } from '../src/core/geo.js';

assert.equal(postcodeOf('Unit 4, Example Park\nSouthampton SO15 1AA'), 'SO15 1AA');
assert.equal(postcodeOf('FAO Goods In\n12 High St\nEastleigh\nso50 9ab'), 'SO50 9AB', 'lower case, no comma');
assert.equal(postcodeOf('Building 2, EC1A1BB'), 'EC1A 1BB', 'no space');
assert.equal(postcodeOf('No postcode here'), '');
assert.equal(postcodeOf('Old: PO1 1AA, now: SO14 3TJ'), 'SO14 3TJ', 'the last one wins');

const soton = { lat: 50.9097, lng: -1.4044 }, eastleigh = { lat: 50.9697, lng: -1.3500 }, london = { lat: 51.5072, lng: -0.1276 };
assert.ok(Math.abs(milesBetween(soton, eastleigh) - 4.7) < 0.5, 'Southampton to Eastleigh about 5 miles');
assert.ok(milesBetween(soton, london) > 65 && milesBetween(soton, london) < 75);
const near = nearbyStops([{ key: 'A', ...soton }, { key: 'B', ...eastleigh }, { key: 'C', ...london }], 10);
assert.deepEqual(near.A.map(x => x.key), ['B']);
assert.deepEqual(near.C, []);
console.log('geo: ok');
