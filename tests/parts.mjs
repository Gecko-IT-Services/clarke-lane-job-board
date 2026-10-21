// Parts library: which parts an order names, and which drawings to link.
import assert from 'node:assert/strict';
const { normPartNo, namesPart, currentFile, partsOnJob, drawingsToLink, findPart, ordersForPart } = await import('../src/core/parts.js');

assert.equal(normPartNo(' ex-pr 20001 '), 'EX-PR-20001');
assert.ok(namesPart('Exhaust shim EX-PR-20001 rev 01', 'ex-pr-20001'));
assert.ok(namesPart('EX PR 20001 x 40', 'EX-PR-20001'), 'spaces for dashes');
assert.ok(!namesPart('Shim EX-PR-200012', 'EX-PR-20001'), 'a longer number is a different part');
assert.ok(!namesPart('Bracket', 'BR'), 'too short to match');
assert.ok(namesPart('Handle 990000001 (stainless)', '990000001'));
assert.ok(!namesPart('UL-PR-10448 bracket', '10448'), 'the tail of a longer number is not this part');
assert.ok(!namesPart('ABC-100-2 plate', 'ABC-100'), 'nor the head of one');
assert.ok(namesPart('Bracket 10448, galv', '10448'), 'punctuation around it is fine');

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

// Part numbers in order lines, and suggestions.
{
  const { partNumbersIn, suggestedParts, openOrdersNeeding } = await import('../src/core/parts.js');
  assert.deepEqual(partNumbersIn('Exhaust shim EX-PR-20001 rev 02'), ['EX-PR-20001']);
  assert.deepEqual(partNumbersIn('Handle, locking 990000123 (316 bar)'), ['990000123']);
  assert.deepEqual(partNumbersIn('Bracket 3/SP0000/1234 2.5mm ali'), ['3/SP0000/1234']);
  assert.deepEqual(partNumbersIn('Cover BRK7731 x40'), ['BRK7731']);
  assert.deepEqual(partNumbersIn('Bracket 3mm S275 DC01 ALU 1050-H14 AISI304 EN8'), [], 'material grades');
  assert.deepEqual(partNumbersIn('Valve guard 2mm Zintec M8 RAL9005 300N 12/10/2026 SO-9784 PO-1234'), [], 'sizes, threads, colours, dates and our own numbers are not parts');
  const jobs = [
    { id: 1, customer: 'Example Racers Ltd', status: 'open', lines: [{ part: 'Exhaust shim EX-PR-20001' }, { part: 'Frame' }] },
    { id: 2, customer: 'Example Racers Limited', status: 'open', lines: [{ part: 'EX-PR-20001 shim' }] },
    { id: 3, customer: 'Other Co', status: 'open', lines: [{ part: 'Plate AB-1234-01' }] },
    { id: 4, customer: 'Other Co', status: 'cancelled', lines: [{ part: 'Plate ZZ-9999-01' }] },
  ];
  const s = suggestedParts(jobs, [{ customerKey: 'other', partNo: 'AB-1234-01', files: [] }]);
  assert.deepEqual(s.map(x => [x.partNo, x.orders.length]), [['EX-PR-20001', 2]], 'already in Parts and cancelled orders left out');
  assert.equal(s[0].description, 'Exhaust shim');
  const part = { customerKey: 'exampleracers', partNo: 'EX-PR-20001', files: [{ id: 1, itemId: 'x', at: '2026-10-20' }] };
  assert.deepEqual(openOrdersNeeding([...jobs, { id: 5, customer: 'Example Racers Ltd', status: 'open', lines: [{ part: 'EX-PR-20001' }], files: [{ itemId: 'x' }] }], part, j => j.status === 'open').map(j => j.id), [1, 2]);
  console.log('parts suggested: ok');
}

// The Part no. box first (Mandy, 22 Oct): when a line has one, that is its part number; its description is not searched.
{
  const { lineNamesPart, lineNumbers, suggestedParts, openOrdersNeeding } = await import('../src/core/parts.js');
  assert.ok(lineNamesPart({ partNo: 'brk 1001', part: 'Mounting bracket' }, 'BRK-1001'), 'the box, ignoring case and spacing');
  assert.ok(!lineNamesPart({ partNo: 'BRK-1002', part: 'Bracket, replaces BRK-1001' }, 'BRK-1001'), 'the box wins over the text');
  assert.ok(!lineNamesPart({ partNo: 'BRK-10010', part: 'Bracket' }, 'BRK-1001'), 'a longer number is a different part');
  assert.ok(lineNamesPart({ partNo: '', part: 'Bracket BRK-1001' }, 'BRK-1001'), 'empty box: the text, as before');
  assert.ok(lineNamesPart({ part: 'Bracket BRK-1001' }, 'BRK-1001'), 'no box at all (old lines)');
  assert.deepEqual(lineNumbers({ partNo: 'Shim-A', part: 'Exhaust shim EX-PR-20001' }), ['Shim-A'], 'the box, even when it would not look like a part number');
  assert.deepEqual(lineNumbers({ partNo: '', part: 'Exhaust shim EX-PR-20001' }), ['EX-PR-20001']);
  const parts = [{ id: 1, customer: 'Example Racers Ltd', customerKey: 'exampleracers', partNo: 'BRK-1001', files: [{ id: 1, itemId: 'x', at: '2026-10-20' }] }];
  const job = { id: 8, customer: 'Example Racers Ltd', status: 'open', lines: [{ partNo: 'BRK-1001', part: 'Mounting bracket' }], files: [] };
  assert.deepEqual(partsOnJob(parts, job).map(p => p.id), [1], 'partsOnJob uses the box');
  assert.deepEqual(drawingsToLink(parts, job).map(x => x.file.itemId), ['x'], 'and so does drawingsToLink');
  assert.deepEqual(ordersForPart([job], parts[0]).map(j => j.id), [8]);
  assert.deepEqual(openOrdersNeeding([job], parts[0], () => true).map(j => j.id), [8]);
  const s = suggestedParts([{ id: 9, customer: 'Sample Works Ltd', status: 'open', lines: [{ partNo: 'CVR-20', part: 'Cover plate 2mm' }, { partNo: '', part: 'Guard GD-4401-02' }] }], []);
  assert.deepEqual(s.map(x => [x.partNo, x.description]), [['CVR-20', 'Cover plate 2mm'], ['GD-4401-02', 'Guard']], 'the box with its description; the text when empty');
}
