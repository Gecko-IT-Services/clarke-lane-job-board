import assert from 'node:assert/strict';
import { tvRows, tvColumns, tvPage } from '../src/core/tv.js';

const job = (id, procs, extra = {}) => ({ id, so: 'SO-' + id, customer: 'Example Ltd', status: 'open', priority: null, ordered: '2026-10-01',
  lines: [{ id: id * 10, part: 'Bracket', qty: 4, due: '2026-10-22' }], despatches: [], procs, ...extra });
const jobs = [
  job(1, { Laser: { done: true }, Fold: { done: false }, 'P/Coat Paint': { done: false } }),
  job(2, { Laser: { done: true }, 'P/Coat Paint': { done: false } }, { lines: [{ id: 20, part: 'Cover', qty: 2, due: '2026-10-15' }] }),
  job(3, { Weld: { done: false } }, { status: 'held' }),
  job(4, { Laser: { done: true } }),
];
const out = [{ id: 1, jobId: 2, process: 'P/Coat Paint', supplier: 'Coaters Ltd', sentOn: '2026-10-12', dueBack: '2026-10-16', backOn: null }];
const rows = tvRows(jobs, out, '2026-10-20');
const r = Object.fromEntries(rows.map(x => [x.id, x]));
assert.equal(r[1].cells.Laser.state, 'done');
assert.equal(r[1].cells.Fold.state, 'next');
assert.equal(r[1].cells['P/Coat Paint'].state, 'todo');
assert.equal(r[1].cells.Weld.state, 'none');
assert.equal(r[2].cells['P/Coat Paint'].state, 'out');
assert.equal(r[2].cells['P/Coat Paint'].late, true);
assert.equal(r[2].note, 'At Coaters Ltd');
assert.equal(r[2].outBack, '2026-10-16');
assert.equal(r[2].late, 5);
assert.equal(r[3].cells.Weld.state, 'todo', 'a held job has no next step');
assert.equal(r[3].note, 'On hold');
assert.equal(r[4].ready, true);
assert.equal(r[4].note, 'Ready to dispatch');
assert.equal(r[1].soon, true, 'due in 2 days');
assert.ok(!tvColumns(rows).includes('Rolling'));
assert.equal(tvColumns(rows).length, 8);
const p = tvPage([1, 2, 3, 4, 5], 2, 4);   // wraps: page 4 of 3 is the second page
assert.deepEqual([p.rows, p.page, p.pages], [[3, 4], 1, 3]);
assert.equal(tvPage([], 10, 0).pages, 1);
console.log('tv: ok');
