import assert from 'node:assert/strict';
import { reorderRound, reorderTally, reorderAngle, roundNudge, itemWords, lineNamesItem, reorderNote, snoozeNote } from '../src/core/reorders.js';

const today = '2026-10-21';   // a Wednesday
const ago = d => new Date(Date.parse(today + 'T12:00:00Z') - d * 864e5).toISOString().slice(0, 10);
const at = d => ago(d) + 'T10:00:00Z';
const due = (customer, key, item, worth) => ({ key, customer, contactId: '', item, times: 5, every: 20, last: ago(30), since: 30, worth });

// The words that name an item: no sizes, no little words.
assert.deepEqual(itemWords('Shelf bracket 2mm Zintec'), ['shelf', 'bracket', 'zintec']);
assert.deepEqual(itemWords('Control box enclosure, powder coated RAL 7035'), ['control', 'box', 'enclosure']);
assert.deepEqual(itemWords('1000 x 500 x 3mm plate of S275'), ['plate', 's275']);
assert.equal(lineNamesItem('40 off shelf brackets, Zintec 2mm', 'Shelf bracket 2mm Zintec'), true);
assert.equal(lineNamesItem('Shelf support 2mm Zintec', 'Shelf bracket 2mm Zintec'), false);

const reorders = [due('Sample Works Ltd', 'sampleworks', 'Shelf bracket 2mm Zintec', 9000), due('Example Customer Ltd', 'examplecustomer', 'Guard plate 2mm Zintec', 5000),
  due('Second Example Ltd', 'secondexample', 'Mounting plate 3mm aluminium', 3000), due('Third Example Ltd', 'thirdexample', 'Cable tray lid', 1000)];
const actions = [
  { customer: 'Example Customer Ltd', kind: 'reorder', note: reorderNote('Guard plate 2mm Zintec'), by: 'mandy@example.com', at: at(3) },
  { customer: 'Second Example Ltd', kind: 'reorder_snooze', note: snoozeNote('Mounting plate 3mm aluminium', ago(-60)), by: 'levi@example.com', at: at(2) },
  { customer: 'Third Example Ltd', kind: 'reorder', note: reorderNote('Cable tray lid'), by: 'mandy@example.com', at: at(10) },
  { customer: 'Sample Works Ltd', kind: 'reorder', note: reorderNote('Shelf bracket 2mm Zintec'), by: 'mandy@example.com', at: at(45) },   // over 30 days: due again
  { customer: 'Fifth Example Ltd', kind: 'reorder', note: reorderNote('Hopper lid 304'), by: 'levi@example.com', at: at(12) },              // since ordered and invoiced
  { customer: 'Sixth Example Ltd', kind: 'reorder', note: reorderNote('Base frame'), by: 'levi@example.com', at: at(5) },                  // no order: not listed
  { customer: 'Example Customer Ltd', kind: 'call', note: 'Guard plate 2mm Zintec', at: at(1) },                                           // not a reorder action
];
const jobs = [
  { id: 1, so: 'SO-1', customer: 'Third Example Ltd', ordered: ago(4), status: 'open', lines: [{ part: 'Cable tray lids x20' }], v: 400 },
  { id: 2, so: 'SO-2', customer: 'Example Customer Ltd', ordered: ago(5), status: 'open', lines: [{ part: 'Guard plate 2mm Zintec' }], v: 999 },   // before the ask
  { id: 3, so: 'SO-3', customer: 'Fifth Example Ltd', ordered: ago(8), status: 'open', lines: [{ part: 'Hopper lid, 304 stainless' }], v: 2200 },
  { id: 4, so: 'SO-4', customer: 'Sample Works Ltd', ordered: ago(2), status: 'cancelled', lines: [{ part: 'Shelf bracket' }], v: 50 },
];
const round = reorderRound(reorders, actions, jobs, today);
const st = Object.fromEntries(round.map(r => [r.customer, r]));
assert.equal(st['Sample Works Ltd'].state, 'due', 'asked 45 days ago is due again; a cancelled order is not a win');
assert.equal(st['Example Customer Ltd'].state, 'asked');
assert.equal(st['Example Customer Ltd'].asked, ago(3)); assert.equal(st['Example Customer Ltd'].askedBy, 'mandy@example.com');
assert.equal(st['Second Example Ltd'].state, 'snoozed'); assert.equal(st['Second Example Ltd'].snoozedUntil, ago(-60));
assert.equal(st['Third Example Ltd'].state, 'won'); assert.equal(st['Third Example Ltd'].wonOrder.so, 'SO-1');
assert.equal(st['Fifth Example Ltd'].state, 'won', 'asked, ordered, since invoiced: still counted');
assert.ok(!st['Sixth Example Ltd'], 'asked, no longer due and no order found: not listed');
assert.deepEqual(round.map(r => r.state), ['due', 'asked', 'snoozed', 'won', 'won'], 'due first, then asked, snoozed, won');

// Due ones by worth.
const two = reorderRound([due('Small Ltd', 'small', 'Bracket', 100), due('Big Ltd', 'big', 'Plate', 900)], [], [], today);
assert.deepEqual(two.map(r => r.customer), ['Big Ltd', 'Small Ltd']);
// A snooze that has run out is due again; asked after a snooze is asked.
assert.equal(reorderRound([reorders[2]], [{ customer: 'Second Example Ltd', kind: 'reorder_snooze', note: snoozeNote('Mounting plate 3mm aluminium', ago(1)), at: at(91) }], [], today)[0].state, 'due');
assert.equal(reorderRound([reorders[2]], [actions[1], { customer: 'Second Example Ltd', kind: 'reorder', note: reorderNote('Mounting plate 3mm aluminium'), at: at(1) }], [], today)[0].state, 'asked');

// The tally: this month's asks and wins; the value only with a value function.
const tally = reorderTally(round, today, j => j.v);
assert.deepEqual(tally, { due: 1, asked: 3, won: 2, wonValue: 2600 });
assert.equal(reorderTally(round, today).wonValue, null);

assert.equal(reorderAngle(reorders[0]), `Their regular order of "Shelf bracket 2mm Zintec" looks due: they usually order it about every 20 days and last ordered it on ${ago(30)}. Ask whether they need the next batch.`);

// The Monday nudge: Mondays, or when nobody has asked for a week.
assert.equal(roundNudge(round, actions, today), 0, 'Wednesday, asked 3 days ago');
assert.equal(roundNudge(round, actions, '2026-10-19'), 1, 'Monday');
assert.equal(roundNudge(round, actions.filter(a => a.at < at(7)), today), 1, 'nobody asked for a week');
assert.equal(roundNudge([], [], '2026-10-19'), 0, 'nothing due');
console.log('reorders: ok');
