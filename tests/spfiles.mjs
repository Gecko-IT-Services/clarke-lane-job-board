// SharePoint files: folder matching, groups, old quote history, drawings by part number, certificate grades.
import assert from 'node:assert/strict';
const { matchFolder, customerFolders, quoteNo, quoteCustomer, fileGroup, groupFiles, quoteHistory, issueOf, drawingsFor, foundDrawings, gradesIn, gradesOnJob, certFolders } = await import('../src/core/spfiles.js');

// — Folders: by name, Ltd and Limited the same; a near name only when it is the only one. —
const folders = [{ name: 'Example Racers' }, { name: 'Example Racing Group' }, { name: 'Sample Works Limited' }, { name: 'MISCELLANEOUS' }, { name: 'Fourth Example' }];
assert.equal(matchFolder('sampleworks', folders).name, 'Sample Works Limited');
assert.equal(matchFolder('exampleracers', folders).name, 'Example Racers', 'exact beats near');
assert.equal(matchFolder('fourthexampleengineering', folders).name, 'Fourth Example', 'the only near one');
assert.equal(matchFolder('example', folders), null, 'two near ones: ask');
assert.equal(matchFolder('nobody', folders), null);
assert.equal(matchFolder('', folders), null);

// — Linked by hand beats found by name; "none" stops a near match coming back. —
const lists = { clients: folders, laser: [{ name: 'Sample Works' }] };
const links = [{ key: 'example', kind: 'client', name: 'Example Racing Group', driveId: 'd', itemId: 'x', url: 'u' }, { key: 'sampleworks', kind: 'laser', itemId: null }];
assert.deepEqual(customerFolders('example', links, lists).client, { folder: { name: 'Example Racing Group', driveId: 'd', itemId: 'x', url: 'u' }, how: 'linked' });
assert.equal(customerFolders('example', links, lists).laser.how, 'missing');
assert.equal(customerFolders('sampleworks', links, lists).client.how, 'name');
assert.deepEqual(customerFolders('sampleworks', links, lists).laser, { folder: null, how: 'none' });

// — Quote numbers and the one-off folder's customer names. —
assert.equal(quoteNo('QCLE06556 Bracket.xlsx'), 'QCLE06556');
assert.equal(quoteNo('QCLE 06509.pdf'), 'QCLE06509');
assert.equal(quoteNo('QCLE091.xls'), 'QCLE00091');
assert.equal(quoteNo('Drawing QCLE06556.pdf'), null, 'only at the start');
assert.equal(quoteCustomer('QCLE04906 - Example Ltd.xlsx'), 'Example Ltd');

// — Groups. —
assert.equal(fileGroup({ name: 'QCLE01234.xlsx' }), 'quotes');
assert.equal(fileGroup({ name: 'Costing.xlsx', path: 'Example/Quotes' }), 'quotes');
assert.equal(fileGroup({ name: 'Delivery Note 4411.pdf' }), 'delivery');
assert.equal(fileGroup({ name: 'Declaration of Conformity.pdf' }), 'certs');
assert.equal(fileGroup({ name: 'Pro Forma 12.pdf' }), 'other');
assert.equal(fileGroup({ name: '03-7866-0000 Issue 05.pdf' }), 'drawings');
assert.equal(fileGroup({ name: 'Bracket.DXF' }), 'drawings');
assert.equal(fileGroup({ name: 'notes.docx' }), 'other');
const files = [
  { name: 'QCLE01000 Bracket.xlsx', at: '2015-03-01T00:00:00Z' }, { name: 'QCLE05000.pdf', at: '2024-06-01T00:00:00Z' }, { name: 'QCLE05000.xlsx', at: '2024-06-02T00:00:00Z' },
  { name: 'EX-PR-20001 Rev A.pdf', at: '2023-01-01T00:00:00Z' }, { name: 'EX-PR-20001 Rev B.pdf', at: '2025-01-01T00:00:00Z', itemId: 'b' },
  { name: 'EX-PR-20001 Rev B.dxf', at: '2025-02-01T00:00:00Z' }, { name: 'Delivery note.pdf', at: '2025-05-01T00:00:00Z' }];
const office = groupFiles(files, { office: true });
assert.deepEqual(office.map(g => g.key), ['drawings', 'quotes', 'delivery']);
assert.equal(office[0].files[0].name, 'EX-PR-20001 Rev B.dxf', 'newest first');
assert.ok(!groupFiles(files, {}).some(g => g.key === 'quotes'), 'the shop floor never sees old quotes');
assert.deepEqual(groupFiles(files, { q: 'rev b', office: true }).flatMap(g => g.files.map(f => f.name)), ['EX-PR-20001 Rev B.dxf', 'EX-PR-20001 Rev B.pdf']);

// — Quote history: each number once, first and last year, plus the one-off folder's quotes for this customer. —
const misc = [{ name: 'QCLE00500 - Example Racers Limited.xlsx', at: '2012-01-01T00:00:00Z' }, { name: 'QCLE00600 - Someone Else.xlsx', at: '2013-01-01T00:00:00Z' }];
assert.deepEqual(quoteHistory(files, { key: 'exampleracers', misc }), { count: 3, first: '2012', last: '2024' });
assert.deepEqual(quoteHistory(files), { count: 2, first: '2015', last: '2024' });
assert.equal(quoteHistory([{ name: 'a.pdf' }]), null);

// — Issues and the best drawing. —
assert.equal(issueOf('03-7866-0000 Issue 05.pdf'), 5);
assert.equal(issueOf('Bracket Rev C.pdf'), 3);
assert.equal(issueOf('Bracket_rev2.pdf'), 2);
assert.equal(issueOf('Bracket.pdf'), 0);
assert.equal(issueOf('Revolver plate.pdf'), 0, 'a word starting rev is not a revision');
assert.equal(drawingsFor('ex-pr-20001', files)[0].name, 'EX-PR-20001 Rev B.pdf', 'highest issue, PDF first');
assert.equal(drawingsFor('03-7866-0000', [{ name: '03-7866-0000 Issue 04.pdf' }, { name: '03-7866-0000 Issue 05.pdf' }, { name: '03-7866-00001.pdf' }])[0].name, '03-7866-0000 Issue 05.pdf');
assert.equal(drawingsFor('03-7866-0000', [{ name: '03-7866-00001.pdf' }]).length, 0, 'a longer number is a different part');

const job = { customer: 'Example Racers Ltd', lines: [{ part: 'Exhaust shim EX-PR-20001 x 40' }, { part: 'Shim 3mm' }, { part: 'Bracket BRK-7' }], files: [] };
const parts = [{ customerKey: 'exampleracers', partNo: 'BRK-7' }, { customerKey: 'other', partNo: 'Shim' }];
const lib = [...files, { name: 'BRK-7.pdf', at: '2020-01-01T00:00:00Z', itemId: 'k' }];
assert.deepEqual(foundDrawings(job, lib, parts).map(x => [x.partNo, x.file.name, x.more]), [['EX-PR-20001', 'EX-PR-20001 Rev B.pdf', 2], ['BRK-7', 'BRK-7.pdf', 0]]);
assert.deepEqual(foundDrawings({ ...job, files: [{ itemId: 'b' }] }, lib, parts).map(x => x.partNo), ['BRK-7'], 'the order already has one of them');

// The Part no. box first (22 Oct): BRK-7 in the box finds its drawing; a number in that line's description is not looked for.
assert.deepEqual(foundDrawings({ customer: 'Example Racers Ltd', lines: [{ partNo: 'BRK-7', part: 'Bracket, was EX-PR-20001' }], files: [] }, lib, []).map(x => x.partNo), ['BRK-7']);
assert.deepEqual(foundDrawings({ customer: 'Example Racers Ltd', lines: [{ partNo: 'brk 7', part: 'Bracket' }], files: [] }, lib, parts).map(x => x.partNo), ['BRK-7'], 'once, as Parts spells it');

// — Grades and their certificate folders. —
assert.deepEqual(gradesIn('Bracket 3mm S275'), ['S275']);
assert.deepEqual(gradesIn('Plate S355J2 and S275JR'), ['S355', 'S275']);
assert.deepEqual(gradesIn('Hopper 304 stainless 2mm'), ['304']);
assert.deepEqual(gradesIn('Tray 316L 1.5mm'), ['316']);
assert.deepEqual(gradesIn('Cover SS304'), ['304']);
assert.deepEqual(gradesIn('Washer x 304 off'), [], 'a quantity is not a grade');
assert.deepEqual(gradesIn('Panel 3mm 5083 aluminium'), ['5083']);
assert.deepEqual(gradesIn('Extrusion 6082-T6'), ['6082']);
assert.deepEqual(gradesIn('Part 1050 off'), [], 'a number is not a grade without aluminium');
assert.deepEqual(gradesOnJob({ lines: [{ part: 'Bracket S275' }, { part: 'Cover 304 stainless' }], notes: 'Also S275' }), ['S275', '304']);
const certs = [{ name: '6063 T6' }, { name: '1050' }, { name: '304' }, { name: 'S355' }, { name: '316' }, { name: '6082 T6' }];
assert.deepEqual(certFolders(['6082', 'S275', '304'], certs).map(x => [x.grade, x.folder?.name || null]), [['6082', '6082 T6'], ['S275', null], ['304', '304']]);

console.log('spfiles: ok');
