import assert from 'node:assert/strict';
import { repeatLines, deliveryDates, deliveryLabel, despatchStatus, invoiceStatus, splitIntoCalloffs, addWorkingDays, quoteStates, PROCESSES, stage, nextDue, left, value, despatchValue, calloffDates, defaultDespatchQty,
  suggestProcesses, describeLine, unitPrice, allDone, salesSummary, boardLists, nextStep, floorQueue, floorStations, partsLeft, dayNo, dispatchLists } from '../src/core/jobs.js';

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
  ['Cut & Drill', 'Weld', 'Plating / Anodising']);
assert.equal(PROCESSES.length, 9);
assert.equal(PROCESSES.at(-1), 'Rolling', 'Rolling is last (Levi)');

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

// — Home screen numbers. —
{
  const { dashboard, weekStart, attention } = await import('../src/core/jobs.js');
  assert.equal(weekStart('2026-10-15'), '2026-10-12', 'Thursday → Monday');
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12', 'Sunday belongs to the week before');
  const mk = (id, due, over = {}) => ({ id, so: 'SO-' + id, status: 'open', despatches: [], procs: { Laser: { done: false } },
    lines: [{ id: id * 10, qty: 10, price: 5, due }], ...over });
  const jobs = [
    mk(1, '2026-10-10'),                                                            // 5 days late
    mk(2, '2026-10-14', { status: 'held' }),                                        // 1 day late, held
    mk(3, '2026-10-20', { procs: { Laser: { done: true, at: '2026-10-15T09:00:00Z' } } }),   // due soon, ready
    mk(4, '2026-11-30'),                                                            // later
    mk(5, '2026-10-01', { despatches: [{ id: 9, date: '2026-10-13', lines: { 50: 10 }, deliveredOn: '2026-10-14', xero: null }] }),  // done, waiting for Xero
    mk(6, '2026-10-01', { status: 'cancelled' }),
  ];
  const d = dashboard(jobs, '2026-10-15');
  assert.deepEqual(d.late.map(x => [x.job.id, x.days]), [[1, 5], [2, 1]], 'late, worst first; completed and cancelled left out');
  assert.deepEqual(d.soon.map(j => j.id), [3]);
  assert.deepEqual(d.ready.map(j => j.id), [3]);
  assert.deepEqual(d.held.map(j => j.id), [2]);
  assert.equal(d.stations.Laser, 3);
  assert.equal(d.toXero.length, 1); assert.equal(d.toXeroValue, 50);
  assert.equal(d.thisWeekValue, 50, 'dispatched Tue 13 Oct is this week');
  assert.equal(d.orderBook, 200); assert.equal(d.lateValue, 100);
  assert.equal(d.ticksToday, 1);
  const floor = dashboard(jobs.map(j => ({ ...j, lines: j.lines.map(l => ({ ...l, price: null })) })), '2026-10-15');
  assert.equal(floor.orderBook, null, 'no money for the shop floor');

  // At risk: not ready, due within 3 working days. Going out: today to Friday of next week.
  const withSoon = [...jobs, mk(7, '2026-10-16'), mk(8, '2026-10-21')];
  const thu = dashboard(withSoon, '2026-10-15');
  assert.deepEqual(thu.atRisk.map(j => j.id), [7], 'Thu: due Fri at risk; Wed 21 is 4 working days away; ready job 3 is not at risk');
  assert.deepEqual(thu.goingOut.map(j => j.id), [7, 3, 8], 'Thu 15 → Fri 23, soonest first; late and later jobs left out');
  assert.equal(thu.stationLate.Laser, 2, 'jobs 1 and 2 are late and still need Laser');
  assert.equal(thu.stationLate.Weld, 0, 'every process has a count');
  const fri = dashboard(withSoon, '2026-10-16');
  assert.deepEqual(fri.atRisk.map(j => j.id), [7, 8], 'Fri: three working days reach Wed 21');
  assert.deepEqual(dashboard(withSoon, '2026-10-17').goingOut.map(j => j.id), [3, 8], 'Sat: window still ends Fri 23');

  // Needs attention: worst first, each job once, office-only rows hidden from the floor.
  const rows = attention(thu, { office: true, wonQuotes: 2 });
  const tag = r => r.kind + (r.job ? ':' + r.job.id : '') + (r.count ? ':' + r.count : '');
  assert.deepEqual(rows.map(tag), ['late:1', 'late:2', 'risk:7', 'ready:3', 'quotes:2', 'invoice:5'],
    'held job 2 is late, so it is listed once, as late');
  assert.equal(rows[0].days, 5);
  assert.equal(rows.at(-1).despatch.id, 9);
  assert.deepEqual(attention(thu, { office: false, wonQuotes: 2 }).map(tag), ['late:1', 'late:2', 'risk:7', 'ready:3']);
  assert.ok(!attention(thu, { office: true, wonQuotes: 0 }).some(r => r.kind === 'quotes'), 'no quotes row when none are waiting');
  assert.deepEqual(attention(dashboard([mk(9, '2026-10-30', { status: 'held' })], '2026-10-15')).map(tag), ['held:9']);
  assert.deepEqual(attention(dashboard([], '2026-10-15'), { office: true }), [], 'all clear');
  // Held jobs are never at risk (nothing to chase on the floor) but still go out on the calendar.
  const heldSoon = dashboard([mk(10, '2026-10-16', { status: 'held' })], '2026-10-15');
  assert.deepEqual(heldSoon.atRisk.map(j => j.id), [], 'held job due within 3 working days is not at risk');
  assert.deepEqual(heldSoon.goingOut.map(j => j.id), [10], 'but it is still going out');
  assert.deepEqual(attention(heldSoon).map(tag), ['held:10']);
  // Late and ready: listed once, as late.
  const lateReady = dashboard([mk(11, '2026-10-10', { procs: { Laser: { done: true } } })], '2026-10-15');
  assert.deepEqual(attention(lateReady).map(tag), ['late:11'], 'late and ready shows once, as late');
  console.log('jobs dashboard: ok');
}

// — Won quotes: ages in working days, flags, and the tab's lists and totals. —
{
  const { workingDaysSince, quoteAgeTone, wonQuotes } = await import('../src/core/jobs.js');
  const today = '2026-10-15';   // a Thursday
  assert.equal(workingDaysSince('2026-10-07', today), 6, 'Wed 7 → Thu 15 is six working days');
  assert.equal(workingDaysSince('2026-10-12', today), 3);
  assert.equal(workingDaysSince('2026-10-14', today), 1);
  assert.equal(workingDaysSince(today, today), 0, 'won today');
  assert.equal(workingDaysSince('2026-10-10', today), 4, 'won on a Saturday: Mon–Thu');
  assert.equal(workingDaysSince('2026-10-12T09:30:00Z', today), 3, 'a timestamp counts by its date');
  assert.equal(workingDaysSince(null, today), null);
  assert.deepEqual([0, 2, 3, 5, 6, null].map(quoteAgeTone), ['', '', 'soon', 'soon', 'late', '']);

  const rows = [   // newest first, as the app builds them
    { ref: 'Q1', date: '2026-10-14', net: 100, state: 'waiting' },
    { ref: 'Q3', date: '2026-10-13', net: 50, state: 'job', madeOn: '2026-10-14' },
    { ref: 'Q2', date: '2026-10-07', net: 200, state: 'waiting' },
    { ref: 'Q5', date: '2026-10-02', net: 999, state: 'dismissed' },
    { ref: 'Q4', date: '2026-09-30', net: 70, state: 'job', madeOn: '2026-10-09' },
    { ref: 'X1', date: null, net: null, state: 'waiting' },
  ];
  const w = wonQuotes(rows, today);
  assert.deepEqual(w.waiting.map(r => [r.ref, r.age]), [['Q2', 6], ['Q1', 1], ['X1', null]], 'oldest first, undated last');
  assert.deepEqual(w.made.map(r => r.ref), ['Q3', 'Q4'], 'newest first');
  assert.deepEqual(w.gone.map(r => r.ref), ['Q5']);
  assert.equal(w.waitingValue, 300, 'a missing value counts as nothing');
  assert.equal(w.oldest.ref, 'Q2'); assert.equal(w.oldest.age, 6);
  assert.equal(w.madeThisWeek, 1, 'made Wed 14 is this week; Fri 9 is not');
  assert.equal(w.wonMonth, 3, 'October, not marked not a job');
  assert.equal(w.wonMonthValue, 350);
  assert.deepEqual(w.madeWeek.map(r => r.ref), ['Q3'], 'the list behind "made this week"');
  assert.deepEqual(w.month.map(r => [r.ref, r.age ?? '-']), [['Q1', 1], ['Q3', '-'], ['Q2', 6]], 'the list behind "won this month", waiting ones aged');
  const tie = wonQuotes([{ ref: 'S', date: '2026-10-10', state: 'waiting' }, { ref: 'F', date: '2026-10-09', state: 'waiting' }], today);
  assert.deepEqual(tie.waiting.map(r => [r.ref, r.age]), [['F', 4], ['S', 4]], 'same age: the earlier date first');
  const none = wonQuotes([], today);
  assert.deepEqual([none.waiting, none.made, none.gone, none.oldest, none.madeThisWeek, none.wonMonth, none.wonMonthValue], [[], [], [], null, 0, 0, 0]);
  assert.equal(wonQuotes([{ ref: 'X', date: null, net: 5, state: 'waiting' }], today).oldest, null, 'no age, no oldest');
  console.log('jobs won quotes: ok');
}

// — Sales orders tab: lists, order and sums. —
{
  const L = due => [{ id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 13.1, due }, { id: 11, lineNo: 2, part: 'Plate', qty: 5, price: 2, due }];
  const all = { lines: { 10: 20, 11: 5 } };
  const a = job({ id: 1, so: 'SO-1', lines: L('2026-10-10') });
  const b = job({ id: 2, so: 'SO-2', status: 'held', lines: L('2026-10-20') });
  const c = job({ id: 3, so: 'SO-3', lines: L('2026-10-17') });
  const d = job({ id: 4, so: 'SO-4', lines: L('2026-10-01'), despatches: [{ ...all, date: '2026-10-12', xero: null }] });
  const e = job({ id: 5, so: 'SO-5', lines: L('2026-10-01'), despatches: [{ ...all, date: '2026-10-14', xero: { no: 'INV-1' } }] });
  const f = job({ id: 6, so: 'SO-6', status: 'cancelled', ordered: '2026-10-01', lines: L('2026-10-01'), despatches: [{ lines: { 10: 1 }, date: '2026-10-02', xero: null }] });
  const g = job({ id: 7, so: 'SO-7', status: 'cancelled', ordered: '2026-10-05', lines: L('2026-10-01') });
  const h = job({ id: 8, so: 'SO-8', lines: L('2026-10-16'), despatches: [{ lines: { 10: 10 }, date: '2026-10-13', xero: null }] });
  const ids = xs => xs.map(x => x.id);
  const s = salesSummary([a, b, c, d, e, f, g, h], '2026-10-15');
  assert.deepEqual(ids(s.outstanding), [1, 8, 3, 2], 'soonest due first, held included');
  assert.deepEqual(ids(s.late), [1]);
  assert.deepEqual(ids(s.held), [2]);
  assert.deepEqual(ids(s.dispatched), [5, 4], 'newest dispatch first');
  assert.deepEqual(ids(s.cancelled), [7, 6], 'newest order first');
  assert.equal(s.outstandingValue, 957, '272 × 3 + 141 still to send on SO-8');
  assert.equal(s.lateValue, 272);
  assert.equal(s.heldValue, 272);
  assert.equal(s.uninvoiced, 2, 'SO-4 and SO-8; cancelled SO-6 and invoiced SO-5 do not count');
  assert.equal(s.uninvoicedValue, 403, '272 for SO-4 + 131 for SO-8');
  const none = salesSummary([], '2026-10-15');
  assert.deepEqual([none.outstanding, none.late, none.uninvoiced, none.uninvoicedValue, none.outstandingValue], [[], [], 0, 0, 0]);

  // — Jobs tab: running order for the open stages, newest dispatch first for finished. —
  const up1 = job({ id: 11, so: 'SO-11', lines: L('2026-10-20') });
  const up2 = job({ id: 12, so: 'SO-12', lines: L('2026-10-18') });
  const up3 = job({ id: 13, so: 'SO-13', lines: L('2026-10-25'), priority: 1 });
  const cur = job({ id: 14, so: 'SO-14', lines: L('2026-10-19'), procs: { 'Laser': { done: true }, 'Fold': { done: false } } });
  const bl = boardLists([up1, up2, up3, cur, d, e, g]);
  assert.deepEqual(ids(bl.upcoming), [13, 12, 11], 'brought forward first, then by due date');
  assert.deepEqual(ids(bl.current), [14]);
  assert.deepEqual(ids(bl.completed), [5, 4]);
  assert.ok(!Object.values(bl).flat().includes(g), 'cancelled is off the board');
  console.log('jobs sales orders and board: ok');
}

// — Shop floor: what waits at each station, in the running order. —
{
  const L = due => [{ id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 13.1, due }];
  const a = job({ id: 1, so: 'SO-1', lines: L('2026-10-10'), procs: { 'Laser': { done: true }, 'Fold': { done: false }, 'Weld': { done: false } } });
  const b = job({ id: 2, so: 'SO-2', status: 'held', lines: L('2026-10-20'), procs: { 'Laser': { done: false }, 'Weld': { done: false } } });
  const c = job({ id: 3, so: 'SO-3', lines: L('2026-10-18'), procs: { 'Laser': { done: true }, 'Fold': { done: true } } });
  const d = job({ id: 4, so: 'SO-4', lines: L('2026-10-01'), procs: { 'Laser': { done: false } }, despatches: [{ lines: { 10: 20 }, date: '2026-10-02' }] });
  const e = job({ id: 5, so: 'SO-5', status: 'cancelled', lines: L('2026-10-01'), procs: { 'Laser': { done: false } } });
  const all = [a, b, c, d, e], ids = xs => xs.map(x => x.id);
  assert.equal(nextStep(a), 'Fold', "the first not done, in Levi's order");
  assert.equal(nextStep(c), null);
  assert.deepEqual(ids(floorQueue(all, 'all')), [1, 3, 2], 'running order; held in; finished and cancelled out');
  assert.deepEqual(ids(floorQueue(all, 'Laser')), [2], 'only jobs still needing Laser');
  assert.deepEqual(ids(floorQueue(all, 'Weld')), [1, 2]);
  const st = floorStations(all, '2026-10-15'), t = Object.fromEntries(st.map(s => [s.p, s]));
  assert.equal(st.length, 9);
  assert.deepEqual(st.map(s => s.p), PROCESSES);
  assert.deepEqual([t['Laser'].waiting, t['Laser'].late, t['Weld'].waiting, t['Weld'].late, t['Fold'].waiting, t['Tap & C/Sink'].waiting], [1, 0, 2, 1, 1, 0]);
  console.log('jobs shop floor: ok');
}

// — Parts still to make, one entry per part however many delivery lines. —
{
  const p = job({ lines: [
    { id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 1, due: '2026-10-10' },
    { id: 11, lineNo: 2, part: 'Plate', qty: 5, price: 1, due: '2026-10-10' },
    { id: 12, lineNo: 3, part: 'Bracket', qty: 30, price: 1, due: '2026-10-20' }],
    despatches: [{ lines: { 11: 5, 10: 5 }, date: '2026-10-02' }] });
  assert.deepEqual(partsLeft(p), [{ part: 'Bracket', left: 45, next: 15 }], 'Plate fully sent drops out; next = due by the next delivery');
  assert.equal(dayNo('2026-10-02') - dayNo('2026-10-01'), 1);
  console.log('jobs partsLeft: ok');
}

// — Dispatch tab: what is ready, and where each dispatch note is. —
{
  const L = [{ id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 13.1, due: '2026-10-30' }];
  const done = { 'Laser': { done: true } }, todo = { 'Laser': { done: false } };
  const a = job({ id: 1, so: 'SO-1', lines: L, procs: done, despatches: [
    { id: 1, dn: 'DN-1', date: '2026-10-05', lines: { 10: 2 }, deliveredOn: '2026-10-06', xero: { no: 'INV-1' } },
    { id: 3, dn: 'DN-3', date: '2026-10-13', lines: { 10: 2 }, deliveredOn: '2026-10-14', xero: null },
    { id: 5, dn: 'DN-5', date: '2026-10-14', lines: { 10: 2 }, emailedAt: '2026-10-14T10:00:00Z', deliveredOn: null, xero: null }],
    cancelledDespatches: [{ id: 4, dn: 'DN-4', date: '2026-10-13', lines: { 10: 1 }, cancelled: { at: '2026-10-14T09:00:00Z', by: 'Levi' } }] });
  const b = job({ id: 2, so: 'SO-2', lines: L, procs: todo, despatches: [
    { id: 2, dn: 'DN-2', date: '2026-10-12', lines: { 10: 1 }, deliveredOn: '2026-10-13', xero: null },
    { id: 6, dn: 'DN-6', date: '2026-10-15', lines: { 10: 1 }, deliveredOn: null, xero: null }] });
  const c = job({ id: 3, so: 'SO-3', lines: L, procs: done, status: 'held' });
  const gone = job({ id: 4, so: 'SO-4', lines: L, procs: done, despatches: [{ id: 7, dn: 'DN-7', date: '2026-10-15', lines: { 10: 20 }, deliveredOn: null, xero: null }] });
  const off = job({ id: 5, so: 'SO-5', lines: L, procs: done, status: 'cancelled' });
  const s = dispatchLists([b, a, c, gone, off], '2026-10-15');
  const ids = xs => xs.map(x => (x.d || x).id);
  assert.deepEqual(ids(s.ready), [1], 'ready: open, every process ticked; held, finished and cancelled out');
  assert.deepEqual(ids(s.open), [1, 2], 'open: every open job, running order');
  assert.deepEqual(ids(s.held), [3]);
  assert.deepEqual(ids(s.out), [7, 6, 5], 'out for delivery: newest first, finished jobs included');
  assert.deepEqual(ids(s.notEmailed), [7, 6]);
  assert.deepEqual(ids(s.toXero), [2, 3], 'waiting for Xero: oldest first');
  assert.equal(s.toXeroValue, 39.3);
  assert.deepEqual(ids(s.notes), [7, 6, 5, 4, 3, 2, 1], 'all notes newest first, cancelled included');
  assert.equal(s.thisWeek, 5, 'live notes dated Monday 12 Oct to today');
  const hidden = j => ({ ...j, lines: j.lines.map(l => ({ ...l, price: null })) });
  assert.equal(dispatchLists([hidden(a), hidden(b)], '2026-10-15').toXeroValue, null, 'no £ without prices');
  console.log('jobs dispatchLists: ok');
}

// — Part suggestions: this customer's parts first (latest price), then the board's, then Xero items. —
{
  const { partSuggestions } = await import('../src/core/jobs.js');
  const jobs = [
    { so: 'SO-1', customer: 'VFS Ltd', ordered: '2026-10-01', lines: [{ part: 'Bracket 3mm', price: 12 }] },
    { so: 'SO-2', customer: 'VFS Ltd', ordered: '2026-10-10', lines: [{ part: 'bracket  3mm', price: 12.4 }, { part: 'Cover', price: 5 }] },
    { so: 'SO-3', customer: 'Wessex', ordered: '2026-10-12', lines: [{ part: 'Guard', price: 8 }, { part: '', price: 1 }] },
  ];
  const items = [{ code: 'BR3', description: 'Bracket 3mm', price: 11 }, { code: 'PL', description: 'Plate 6mm', price: 30 }];
  const s = partSuggestions(jobs, items, 'vfs ltd');
  assert.deepEqual(s.map(x => [x.part, x.price, x.from]), [['bracket  3mm', 12.4, 'customer'], ['Cover', 5, 'customer'], ['Guard', 8, 'board'], ['Plate 6mm', 30, 'xero']],
    'latest price for the customer wins; a Xero item already ordered is not repeated; blank parts ignored');
  assert.deepEqual(partSuggestions([], items, 'x').map(x => x.from), ['xero', 'xero']);
  console.log('jobs part suggestions: ok');
}

// — Home invoicing: drafts in Xero waiting for approval. —
{
  const { awaitingApproval, invoiceIdsToCheck } = await import('../src/core/jobs.js');
  const dn = (id, xid, at) => ({ id, dn: 'DN-' + id, date: '2026-10-14', lines: { 10: 2 }, deliveredOn: '2026-10-14', xero: xid ? { no: '', id: xid, at } : null });
  const job = (price, ...despatches) => ({ id: 1, customer: 'Example Ltd', lines: [{ id: 10, qty: 10, price }], despatches });
  const jobs = [job(5, dn(1, 'a', '2026-10-15T09:00:00Z'), dn(2, 'b', '2026-10-14T09:00:00Z'), dn(3, 'c', '2026-10-13T09:00:00Z'), dn(4, null))];
  const st = new Map([['a', { status: 'DRAFT', number: 'INV-1' }], ['b', { status: 'SUBMITTED', number: 'INV-2' }], ['c', { status: 'AUTHORISED', number: 'INV-3' }]]);
  const r = awaitingApproval(jobs, st);
  assert.deepEqual(r.list.map(x => [x.d.id, x.status, x.number]), [[2, 'SUBMITTED', 'INV-2'], [1, 'DRAFT', 'INV-1']], 'drafts and awaiting approval, oldest sent first; approved and unsent left out');
  assert.equal(r.value, 20);
  assert.equal(awaitingApproval(jobs, new Map()).list.length, 0, 'nothing guessed before Xero answers');
  assert.equal(awaitingApproval([job(null, dn(1, 'a'))], st).value, null, 'no money without prices');
  assert.deepEqual(invoiceIdsToCheck(jobs, new Set(['c'])), ['a', 'b'], 'settled invoices are not asked about again');
  console.log('home invoicing: ok');
}

// — Jobs: this month against the target. —
{
  const { monthProgress } = await import('../src/core/jobs.js');
  const j = (id, over) => ({ id, so: 'SO-' + id, status: 'open', procs: { Laser: { done: false } }, despatches: [], ...over });
  const jobs = [
    j(1, { lines: [{ id: 1, qty: 10, price: 10, due: '2026-10-05' }, { id: 2, qty: 5, price: 20, due: '2026-11-03' }],
      despatches: [{ id: 1, date: '2026-10-06', lines: { 1: 4 } }, { id: 2, date: '2026-09-30', lines: { 1: 1 } }] }),
    j(2, { lines: [{ id: 3, qty: 2, price: 50, due: '2026-10-31' }] }),
    j(3, { status: 'cancelled', lines: [{ id: 4, qty: 9, price: 99, due: '2026-10-20' }], despatches: [{ id: 3, date: '2026-10-02', lines: { 4: 1 } }] }),
  ];
  const p = monthProgress(jobs, '2026-10-16');
  assert.equal(p.end, '2026-10-31');
  assert.equal(p.dispatched, 40, 'only October notes, cancelled order left out');
  assert.equal(p.dueByEnd, 150, '5 left of line 1 (late) + job 2; November line left out');
  assert.equal(p.dueLater, 100, 'the November line: on order, due after the month');
  assert.equal(monthProgress([j(4, { lines: [{ id: 5, qty: 1, price: null, due: '2026-10-20' }] })], '2026-10-16').dispatched, null, 'no money without prices');
  assert.equal(monthProgress([], '2026-02-10').end, '2026-02-28');
  assert.equal(Math.round(p.pace * 100), 55, 'Fri 16 Oct: 12 of 22 working days');
  assert.equal(monthProgress([], '2026-10-31').pace, 1, 'a weekend month end counts the whole month');
  // Xero invoices raised outside the board count; the board's own (by ID or DN- reference) do not.
  jobs[0].despatches[0].xero = { id: 'ours', no: 'INV-1' };
  const xero = [
    { id: 'ours', reference: 'SO-1 / DN-0001', date: '2026-10-07', net: 40 },
    { id: 'byref', reference: 'SO-9 / PO 12 / DN-0002', date: '2026-10-08', net: 500 },
    { id: 'old1', reference: 'P31608', date: '2026-10-02', net: 1000 },
    { id: 'old2', reference: '', date: '2026-10-09', net: 250.5 },
    { id: 'cn', reference: 'credit', date: '2026-10-10', net: -100 },
    { id: 'sep', reference: '', date: '2026-09-30', net: 999 },
    { id: 'later', reference: '', date: '2026-10-20', net: 999 },
  ];
  const px = monthProgress(jobs, '2026-10-16', xero);
  assert.equal(px.fromXero, 1150.5, 'two old invoices less a credit note; ours, last month and after today left out');
  assert.equal(px.xeroCount, 3);
  assert.equal(px.onBoard, 40);
  assert.equal(px.dispatched, 1190.5, 'board + Xero outside it');
  assert.equal(px.dueByEnd, p.dueByEnd, 'due figure unchanged');
  assert.equal(monthProgress(jobs, '2026-10-16').fromXero, 0, 'Xero not read: board only');
  assert.equal(monthProgress(jobs, '2026-10-16').xeroRead, false);
  console.log('jobs month target: ok');
}

// — Month gauge words. —
{
  const { monthState } = await import('../src/gauge.js');
  assert.deepEqual(monthState({ dispatched: 300, dueByEnd: 100 }, 500, 600), { tone: 'warn', word: '£200 to break-even', short: 100 });
  assert.equal(monthState({ dispatched: 550, dueByEnd: 0 }, 500, 600).word, 'Past break-even · £50 to target');
  assert.equal(monthState({ dispatched: 650, dueByEnd: 0 }, 500, 600).tone, 'top');
  assert.equal(monthState({ dispatched: 1500, dueByEnd: 0 }, 2000, null).word, '£500 to break-even');
  assert.equal(monthState({ dispatched: 12300, dueByEnd: 0 }, 20000, null).word, '£7.7k to break-even');
  console.log('month gauge words: ok');
}

// — Copy a previous PO: same parts first, then the same customer, newest first. —
{
  const { poSuggestions } = await import('../src/core/jobs.js');
  const J = (id, customer, parts) => ({ id, so: 'SO-' + id, customer, lines: parts.map((part, i) => ({ id: id * 10 + i, part })) });
  const jobs = [J(1, 'VFS (Southampton) Ltd', ['Valve Guard 2mm', 'Bracket A']), J(2, 'VFS (Southampton) Ltd', ['Cover plate']),
    J(3, 'Wessex International', ['Panel']), J(4, 'VFS (Southampton) Ltd', ['Valve guard 2mm'])];
  const pos = [
    { id: 1, jobId: 1, lines: [{ description: 'Powder coat RAL 9005' }], at: '2026-10-01T10:00:00Z' },
    { id: 2, jobId: 2, lines: [{ description: 'Zinc plate' }], at: '2026-10-05T10:00:00Z' },
    { id: 3, jobId: 3, lines: [{ description: 'Steel 3mm for Bracket A' }], at: '2026-10-07T10:00:00Z' },
    { id: 4, jobId: 3, lines: [{ description: 'Anodise' }], at: '2026-10-08T10:00:00Z' },
    { id: 5, jobId: 4, lines: [{ description: 'Powder coat' }], at: '2026-10-09T10:00:00Z' },
  ];
  const s = poSuggestions(jobs[3], jobs, pos);
  assert.deepEqual(s.samePart.map(p => p.id), [5, 1], 'same part (case and spacing ignored), newest first, own POs included');
  assert.deepEqual(s.sameCustomer.map(p => p.id), [2]);
  assert.deepEqual(s.other.map(p => p.id), [4, 3]);
  assert.equal(poSuggestions(jobs[0], jobs, pos).samePart.map(p => p.id).join(), '5,3,1', 'a PO line naming one of the parts counts');
  assert.equal(s.samePart[0].so, 'SO-4');
  console.log('copy a previous PO: ok');
}
