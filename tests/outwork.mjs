import assert from 'node:assert/strict';
import { defaultDueBack, itemsFor, finishFor, outNow, outBoard, suppliersUsed, checkSend } from '../src/core/outwork.js';

const job = (id, procs, extra = {}) => ({ id, so: 'SO-' + id, customer: 'Example Ltd', status: 'open', notes: '', priority: null, ordered: '2026-10-01', due: '2026-11-01',
  lines: [{ id: id * 10, part: 'Bracket RAL 9005 satin', qty: 40, due: '2026-11-01' }], despatches: [], procs, ...extra });
const done = { done: true }, todo = { done: false };

// Five working days, skipping the weekend: Thu 22 Oct → Thu 29 Oct; Fri 23 → Fri 30.
assert.equal(defaultDueBack('2026-10-22'), '2026-10-29');
assert.equal(defaultDueBack('2026-10-23'), '2026-10-30');

assert.equal(itemsFor(job(1, { Laser: done })), '40 × Bracket RAL 9005 satin');
assert.equal(finishFor(job(1, {}), 'P/Coat Paint'), 'RAL 9005 satin');
assert.equal(finishFor(job(1, {}, { lines: [{ id: 1, part: 'Cover, black anodised', qty: 1 }] }), 'Plating / Anodising'), 'black anodised');
assert.equal(finishFor(job(1, {}, { lines: [{ id: 1, part: 'Cover', qty: 1 }] }), 'P/Coat Paint'), '');

const jobs = [job(1, { Laser: done, 'P/Coat Paint': todo }), job(2, { Laser: done, 'P/Coat Paint': todo }), job(3, { Laser: todo, 'P/Coat Paint': todo }),
  job(4, { Laser: done, 'Plating / Anodising': todo })];
const rows = [
  { id: 1, jobId: 1, process: 'P/Coat Paint', supplier: 'Coaters Ltd', sentOn: '2026-10-12', dueBack: '2026-10-16', backOn: null },
  { id: 2, jobId: 2, process: 'P/Coat Paint', supplier: 'coaters ltd ', sentOn: '2026-10-19', dueBack: '2026-10-26', backOn: null },
  { id: 3, jobId: 1, process: 'P/Coat Paint', supplier: 'Old Paint Co', sentOn: '2026-09-01', dueBack: '2026-09-05', backOn: '2026-10-10', backBy: 'x' },
];
assert.equal(outNow(rows, 1, 'P/Coat Paint').id, 1);
assert.equal(outNow(rows, 3, 'P/Coat Paint'), null);
const b = outBoard(rows, jobs, '2026-10-20');
assert.equal(b.suppliers.length, 1, 'same company however it was typed');
assert.deepEqual(b.suppliers[0].rows.map(r => r.id), [1, 2], 'most overdue first');
assert.equal(b.suppliers[0].rows[0].late, 4);
assert.equal(b.suppliers[0].rows[0].daysOut, 8);
assert.deepEqual(b.ready.map(r => [r.job.id, r.process]), [[4, 'Plating / Anodising']], 'job 3 still needs lasering; 1 and 2 are out');
assert.deepEqual(b.back.map(r => r.id), [3]);
assert.equal(outBoard(rows, jobs, '2026-10-30').back.length, 0, 'back more than 14 days ago drops off');
assert.equal(b.late.length, 1);
assert.deepEqual(suppliersUsed(rows), ['coaters ltd', 'Old Paint Co'], 'newest spelling, once each');

assert.equal(checkSend({ process: 'P/Coat Paint', supplier: ' ', sentOn: '2026-10-20' }), 'Say which company it is going to.');
assert.equal(checkSend({ process: 'P/Coat Paint', supplier: 'A', sentOn: '2026-10-20', dueBack: '2026-10-19' }), 'The due back date is before the date it went.');
assert.equal(checkSend({ process: 'P/Coat Paint', supplier: 'A', sentOn: '2026-10-20', dueBack: '' }), '');
assert.equal(checkSend({ process: 'P/Coat Paint', supplier: 'A', sentOn: '2026-10-23' }, '2026-10-20'), 'The date it went is in the future.');
console.log('outwork: ok');
