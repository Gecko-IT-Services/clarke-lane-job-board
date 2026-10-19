import assert from 'node:assert/strict';
import { guessProcesses, previewJobs } from '../src/core/preview.js';

// — Preview: Xero's open sales orders as jobs, never saved. —
assert.deepEqual(guessProcesses(['Bracket 3mm laser cut and folded, powder coat RAL 9005']), ['Laser', 'Fold', 'P/Coat Paint']);
assert.deepEqual(guessProcesses(['Guard plate, zinc plated, M8 tapped']), ['Tap', 'Plating / Anodising']);
assert.deepEqual(guessProcesses(['Mystery part']), ['Laser'], 'nothing recognised: Laser');
assert.deepEqual(guessProcesses(['Tube 2mm, drilled and rolled']), ['Cut & Drill', 'Rolling']);

const quotes = [
  { id: 'a', number: 'SO-9776', status: 'ACCEPTED', customer: 'Example Ltd', reference: 'P1', date: '2026-10-01', expiry: '2026-10-20',
    lines: [{ description: 'Bracket welded', qty: 10, unit: 11.327 }, { description: 'Note only', qty: 0, unit: 0 }] },
  { id: 'b', number: 'SO9777', status: 'SENT', customer: 'Other Ltd', reference: '', date: '2026-10-02', expiry: null, lines: [{ description: 'Plate', qty: 2, unit: 50 }] },
  { id: 'c', number: 'SO-9700', status: 'INVOICED', customer: 'Done Ltd', lines: [{ description: 'x', qty: 1, unit: 1 }] },
  { id: 'd', number: 'QU-0042', status: 'SENT', customer: 'A quote, not an order', lines: [{ description: 'x', qty: 1, unit: 1 }] },
  { id: 'e', number: 'SO-9778', status: 'ACCEPTED', customer: 'Already a job', lines: [{ description: 'x', qty: 1, unit: 1 }] },
];
const jobs = previewJobs(quotes, q => q.id === 'e', d => 'FALLBACK-' + d);
assert.deepEqual(jobs.map(j => j.so), ['SO-9776', 'SO-9777'], 'open SOs only; invoiced, quotes and real jobs left out');
assert.ok(jobs.every(j => j.preview && j.id < 0 && j.lines.every(l => l.id < 0)), 'negative ids, marked preview');
assert.equal(jobs[0].lines.length, 1, 'zero-quantity lines dropped');
assert.equal(jobs[0].lines[0].price, 11.327); assert.equal(jobs[0].due, '2026-10-20');
assert.equal(jobs[1].due, 'FALLBACK-2026-10-02', 'no expiry: fallback due date');
assert.deepEqual(Object.keys(jobs[0].procs), ['Weld']);
console.log('preview: ok');
