import assert from 'node:assert/strict';
import { PROCESSES, stage, nextDue, left, value, despatchValue, calloffDates, defaultDespatchQty,
  suggestProcesses, describeLine, unitPrice, allDone } from '../src/core/jobs.js';

const job = over => ({
  id: 1, so: 'SO-9729', customer: 'BSA Regal Group Ltd', po: 'M32991', due: '2026-10-30', calloffs: [],
  lines: [{ id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 13.1 }, { id: 11, lineNo: 2, part: 'Plate', qty: 5, price: 2 }],
  procs: { 'Laser': { done: false }, 'Fold': { done: false } }, despatches: [], ...over
});

// — Stage is derived, never typed. —
assert.equal(stage(job()), 'upcoming');
assert.equal(stage(job({ procs: { 'Laser': { done: true }, 'Fold': { done: false } } })), 'current');
assert.equal(stage(job({ despatches: [{ lines: { 10: 5 } }] })), 'current', 'part despatched is current');
assert.equal(stage(job({ despatches: [{ lines: { 10: 15 } }, { lines: { 10: 5, 11: 5 } }] })), 'completed');
assert.ok(!allDone(job()));

// — Remaining quantity and value; prices hidden → null, never 0. —
const j = job({ despatches: [{ lines: { 10: 15 } }] });
assert.equal(left(j, j.lines[0]), 5);
assert.equal(value(j), 272);
assert.equal(value(j, { remaining: true }), 75.5);
assert.equal(despatchValue(j, j.despatches[0]), 196.5);
assert.equal(value(job({ lines: [{ id: 1, qty: 2, price: null }] })), null);

// — Call-offs. —
assert.deepEqual(calloffDates('2026-10-16', 3, 7), ['2026-10-16', '2026-10-23', '2026-10-30']);
assert.deepEqual(calloffDates('2026-01-31', 2, 'm').length, 2);
assert.deepEqual(calloffDates('2026-10-16', 2, 14), ['2026-10-16', '2026-10-30']);
const c = job({ calloffs: ['2026-10-16', '2026-10-23', '2026-10-30'] });
assert.equal(nextDue(c), '2026-10-16');
assert.equal(nextDue({ ...c, despatches: [{ lines: {} }] }), '2026-10-23');
assert.equal(nextDue({ ...c, despatches: [{}, {}, {}, {}].map(() => ({ lines: {} })) }), '2026-10-30', 'past the last call-off stays on it');
assert.equal(defaultDespatchQty(c, c.lines[0]), 7);
assert.equal(defaultDespatchQty(job(), job().lines[0]), 20);

// — Pre-ticks from quote lines. —
assert.deepEqual(suggestProcesses([{ process: 'Laser', folds: 2, weld: 0, inserts: 4, paint: true, plating: 0, holes: 0 }]),
  ['Laser', 'Fold', 'Insert', 'P/Coat Paint']);
assert.deepEqual(suggestProcesses([{ process: 'Saw', folds: 0, weld: 120, holes: 3, plating: 5 }]),
  ['Roll Drill', 'Weld', 'Plating / Anodising']);
assert.equal(PROCESSES.length, 9);

assert.equal(describeLine({ desc: 'Bracket', thickness: 3, material: 'S275' }), 'Bracket — 3mm S275');
assert.equal(describeLine({ desc: '' }), 'Part');
assert.equal(unitPrice(110.62, 6), 18.436667);
// Q-0078: 4000 at £12,041.76 must come back to £12,041.76, not £12,041.60.
const q78 = { lines: [{ id: 1, qty: 4000, price: unitPrice(12041.76, 4000) }], despatches: [] };
assert.equal(q78.lines[0].price, 3.01044);
assert.equal(value(q78), 12041.76);
assert.equal(despatchValue(q78, { lines: { 1: 1000 } }), 3010.44);
assert.equal(unitPrice(5, 0), 0);

console.log('jobs: ok');
