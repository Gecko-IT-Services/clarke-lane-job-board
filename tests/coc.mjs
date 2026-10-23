// Certificates of conformity: the lines, the materials, when one is wanted.
import assert from 'node:assert/strict';
const { cocRows, cocNeeded, asksForCoc, COC_STATEMENT, DEFAULT_ORIGIN } = await import('../src/core/coc.js');

const job = { customer: 'Example Customer Ltd', notes: '', lines: [
  { id: 1, partNo: 'BRK-1001', part: 'Mounting bracket 3mm S275', qty: 20 },
  { id: 2, partNo: '', part: 'Cover 2mm 304 stainless', qty: 5 },
  { id: 3, partNo: 'SH-9', part: 'Shim', qty: 10 }] };
const d = { id: 7, dn: 'DN-0007', lines: { 1: 10, 2: 5 } };

// — The lines: only what went out on this note, materials read from the description until someone types one. —
assert.deepEqual(cocRows(job, d), [
  { lineId: 1, partNo: 'BRK-1001', desc: 'Mounting bracket 3mm S275', qty: 10, material: 'S275', batch: '' },
  { lineId: 2, partNo: '', desc: 'Cover 2mm 304 stainless', qty: 5, material: '304', batch: '' }]);
const saved = { 1: { material: 'S275JR', batch: 'H123456' }, 2: { material: '', batch: 'B-77' } };
assert.deepEqual(cocRows(job, d, saved).map(r => [r.material, r.batch]), [['S275JR', 'H123456'], ['', 'B-77']], 'what was typed wins, even a cleared material');
assert.deepEqual(cocRows(job, { id: 8, lines: {} }), [], 'nothing went out: no lines');

// — When one is wanted. —
assert.ok(!cocNeeded(job, d, new Set(), new Set()));
assert.ok(cocNeeded(job, d, new Set(['examplecustomer']), new Set()), 'the customer wants one with every delivery');
assert.ok(!cocNeeded(job, d, new Set(['examplecustomer']), new Set([7])), 'already made for this note');
assert.ok(!cocNeeded(job, { ...d, cancelled: { at: '2026-10-23' } }, new Set(['examplecustomer']), new Set()), 'not for a cancelled note');
assert.ok(cocNeeded({ ...job, notes: 'C of C required with delivery' }, d, new Set(), new Set()), 'the order notes ask for one');
assert.ok(cocNeeded(job, d, new Set(['examplecustomer']), new Map()), 'a Map of issued ones works too');

// — The words that ask for one. —
for (const t of ['Please supply a Certificate of Conformity and Country of Origin', 'C of C required', 'CofC with goods', 'CoC please', 'certificates of conformance'])
  assert.ok(asksForCoc(t), t);
for (const t of ['', 'Please deliver to goods in', 'cocktail', 'Coca'])
  assert.ok(!asksForCoc(t), t);

assert.match(COC_STATEMENT, /conform in all respects/);
assert.equal(DEFAULT_ORIGIN, 'United Kingdom');
console.log('coc: ok');
