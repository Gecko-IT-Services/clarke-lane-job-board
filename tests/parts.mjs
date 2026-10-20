// Parts library: which parts an order names, and which drawings to link.
import assert from 'node:assert/strict';
const { normPartNo, namesPart, currentFile, partsOnJob, drawingsToLink, findPart, ordersForPart } = await import('../src/core/parts.js');

assert.equal(normPartNo(' ex-pr 20001 '), 'EX-PR-20001');
assert.ok(namesPart('Exhaust shim EX-PR-20001 rev 01', 'ex-pr-20001'));
assert.ok(namesPart('EX PR 20001 x 40', 'EX-PR-20001'), 'spaces for dashes');
assert.ok(!namesPart('Shim EX-PR-200012', 'EX-PR-20001'), 'a longer number is a different part');
assert.ok(!namesPart('Bracket', 'BR'), 'too short to match');
assert.ok(namesPart('Handle 990000001 (stainless)', '990000001'));

const parts = [
  { id: 1, customer: 'Example Racers Ltd', customerKey: 'exampleracers', partNo: 'EX-PR-20001', files: [
    { id: 10, itemId: 'a', at: '2026-09-01T00:00:00Z' }, { id: 11, itemId: 'b', at: '2026-10-05T00:00:00Z' }] },
  { id: 2, customer: 'Other Co', customerKey: 'other', partNo: 'EX-PR-20001', files: [{ id: 20, itemId: 'c', at: '2026-10-01T00:00:00Z' }] },
  { id: 3, customer: 'Example Racers Ltd', customerKey: 'exampleracers', partNo: 'BRK-7', files: [] },
];
assert.equal(currentFile(parts[0]).id, 11, 'the newest revision');
const job = { id: 5, customer: 'Example Racers Limited', lines: [{ part: 'Exhaust shim EX-PR-20001' }, { part: 'BRK-7 bracket' }], files: [] };
assert.deepEqual(partsOnJob(parts, job).map(p => p.id), [1, 3], 'same customer only (Ltd = Limited)');
assert.deepEqual(drawingsToLink(parts, job).map(x => x.file.id), [11], 'a part with no drawing links nothing');
assert.deepEqual(drawingsToLink(parts, { ...job, files: [{ itemId: 'b' }] }), [], 'already on the order');
assert.equal(findPart(parts, 'Example Racers Ltd', 'ex-pr-20001').id, 1);
assert.equal(findPart(parts, 'Nobody', 'EX-PR-20001'), null);
const jobs = [{ ...job, id: 5, createdAt: '2026-10-01' }, { id: 6, customer: 'Example Racers Ltd', createdAt: '2026-10-09', lines: [{ part: 'EX-PR-20001' }] },
  { id: 7, customer: 'Other Co', createdAt: '2026-10-10', lines: [{ part: 'EX-PR-20001' }] }];
assert.deepEqual(ordersForPart(jobs, parts[0]).map(j => j.id), [6, 5]);
console.log('parts: ok');
