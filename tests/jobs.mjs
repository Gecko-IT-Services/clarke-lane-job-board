import assert from 'node:assert/strict';
import { repeatLines, deliveryDates, deliveryLabel, despatchStatus, invoiceStatus, splitIntoCalloffs, addWorkingDays, quoteStates, PROCESSES, stage, nextDue, left, value, despatchValue, calloffDates, defaultDespatchQty,
  suggestProcesses, describeLine, unitPrice, allDone } from '../src/core/jobs.js';

const job = over => ({
  id: 1, so: 'SO-9729', customer: 'BSA Regal Group Ltd', po: 'M32991', due: '2026-10-30', status: 'open',
  lines: [{ id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 13.1, due: '2026-10-30' }, { id: 11, lineNo: 2, part: 'Plate', qty: 5, price: 2, due: '2026-10-30' }],
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

// — Call-offs, Sage style: the same part on several lines with their own due dates. —
assert.deepEqual(calloffDates('2026-10-16', 3, 7), ['2026-10-16', '2026-10-23', '2026-10-30']);
assert.deepEqual(calloffDates('2026-10-16', 2, 14), ['2026-10-16', '2026-10-30']);
const split = splitIntoCalloffs([{ part: 'Bezel LH', qty: 152, price: 76.26 }, { part: 'Bezel RH', qty: 2, price: 76.26 }], ['2026-10-16', '2026-10-23', '2026-10-30']);
assert.deepEqual(split.map(l => `${l.part} ${l.qty} ${l.due}`), ['Bezel LH 51 2026-10-16', 'Bezel RH 1 2026-10-16',
  'Bezel LH 51 2026-10-23', 'Bezel RH 1 2026-10-23', 'Bezel LH 50 2026-10-30'], 'remainder on the earliest; no zero lines');
assert.equal(split.filter(l => l.part === 'Bezel LH').reduce((a, l) => a + l.qty, 0), 152, 'nothing lost in the split');

const c = job({ lines: [{ id: 1, part: 'Bezel', qty: 60, price: 1, due: '2026-10-16' }, { id: 2, part: 'Bezel', qty: 60, price: 1, due: '2026-10-23' },
  { id: 3, part: 'Bezel', qty: 60, price: 1, due: '2026-10-30' }] });
assert.deepEqual(deliveryDates(c), ['2026-10-16', '2026-10-23', '2026-10-30']);
assert.equal(nextDue(c), '2026-10-16');
assert.equal(deliveryLabel(c), 'Delivery 1 of 3');
assert.deepEqual(c.lines.map(l => defaultDespatchQty(c, l)), [60, 0, 0], 'only what is due next is offered');
const c2 = { ...c, despatches: [{ lines: { 1: 60 } }] };
assert.equal(nextDue(c2), '2026-10-23');
assert.equal(deliveryLabel(c2), 'Delivery 2 of 3');
assert.deepEqual(c2.lines.map(l => defaultDespatchQty(c2, l)), [0, 60, 0]);
const short = { ...c, despatches: [{ lines: { 1: 50 } }] };
assert.equal(nextDue(short), '2026-10-16', 'a short delivery keeps that date outstanding (Sage leaves it on the order)');
assert.equal(deliveryLabel(job()), '');

// — Sage statuses. —
assert.equal(despatchStatus(job()), 'Not dispatched');
assert.equal(despatchStatus(c2), 'Part dispatched');
assert.equal(despatchStatus(job({ despatches: [{ lines: { 10: 20, 11: 5 } }] })), 'Dispatched');
assert.equal(invoiceStatus(job()), 'Not invoiced');
assert.equal(invoiceStatus({ ...c2, despatches: [{ lines: { 1: 60 }, xero: { no: 'INV-1' } }] }), 'Part invoiced');
assert.equal(invoiceStatus(job({ despatches: [{ lines: { 10: 20, 11: 5 }, xero: { no: 'INV-1' } }] })), 'Invoiced');
assert.equal(stage(job({ status: 'cancelled' })), 'cancelled');

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

// — Delivery days are working days. —
assert.equal(addWorkingDays('2026-10-14', 10), '2026-10-28', 'Wed + 10 working days');
assert.equal(addWorkingDays('2026-10-16', 1), '2026-10-19', 'Fri + 1 = Mon');
assert.equal(addWorkingDays('2026-10-17', 0), '2026-10-17');

// — Quote states come from jobs and dismissals, never stored. —
const qs = quoteStates([{ spId: 1 }, { spId: 2 }, { spId: 3 }], [{ id: 9, so: 'SO-9729', spQuoteId: 1 }], [2, 1]);
assert.deepEqual(qs.map(q => q.state), ['job', 'dismissed', 'waiting'], 'a job wins over a dismissal');
assert.equal(qs[0].so, 'SO-9729');

// — Repeat order: same lines, dates moved together so a call-off keeps its spacing. —
const rep = repeatLines([{ lineNo: 2, part: 'B', qty: 60, price: 76.26, due: '2026-10-23' }, { lineNo: 1, part: 'B', qty: 60, price: 76.26, due: '2026-10-16' }], '2026-12-01');
assert.deepEqual(rep.map(l => `${l.qty} ${l.price} ${l.due}`), ['60 76.26 2026-12-01', '60 76.26 2026-12-08']);
assert.equal(repeatLines([{ part: 'x', qty: 1, price: null, due: '2026-10-16' }], '2026-10-20')[0].price, '', 'hidden price stays blank');

console.log('jobs: ok');

// — Running order: placed jobs first, the rest by due date; moving keeps the rest in date order. —
{
  const { byRunningOrder, moveInOrder, compareValues } = await import('../src/core/jobs.js');
  const mk = (id, due, priority = null) => ({ id, so: 'SO-' + id, priority, despatches: [], lines: [{ id: id * 10, qty: 1, due }] });
  const a = mk(1, '2026-10-20'), b = mk(2, '2026-10-22'), c = mk(3, '2026-10-25'), d = mk(4, '2026-10-30');
  assert.deepEqual([d, c, b, a].sort(byRunningOrder).map(j => j.id), [1, 2, 3, 4], 'no places: date order');
  assert.deepEqual(moveInOrder([a, b, c, d], 3, 0), [3, 1, 2], 'bring 3 to the top: 1 and 2 keep places above 4');
  const placed = [{ ...c, priority: 1 }, { ...a, priority: 2 }, { ...b, priority: 3 }, d];
  assert.deepEqual(placed.slice().reverse().sort(byRunningOrder).map(j => j.id), [3, 1, 2, 4]);
  assert.deepEqual(moveInOrder(placed, 2, 0), [2, 3, 1], 'already-placed jobs keep their places');
  assert.deepEqual(moveInOrder([a, b, c, d], 1, 1), [2, 1], 'down one');
  const late = mk(5, '2026-10-01');   // a new job due sooner still sits below placed jobs
  assert.deepEqual([...placed, late].sort(byRunningOrder).map(j => j.id), [3, 1, 2, 5, 4]);
  assert.deepEqual(['b', '', 'A', null, 'c'].sort((x, y) => compareValues(x, y)), ['A', 'b', 'c', '', null]);
  assert.deepEqual([3, 10, 2].sort((x, y) => compareValues(x, y, -1)), [10, 3, 2]);
  assert.deepEqual(['SO-9790', 'SO-10001', 'SO-9781'].sort((x, y) => compareValues(x, y)), ['SO-9781', 'SO-9790', 'SO-10001']);
  console.log('jobs running order: ok');
}
