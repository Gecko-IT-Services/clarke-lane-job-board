import assert from 'node:assert/strict';
import { deliveryRuns, deliveredToday, mapsUrl, addressLines, signatureOk, deliveryProblem, noteParts, SIGNATURE_MAX } from '../src/core/deliveries.js';

const job = (id, customer, despatches, extra = {}) => ({ id, so: 'SO-' + id, customer, po: 'PO-' + id, contactName: '', status: 'open',
  address: `Unit ${id}, Example Park\nExampletown EX1 2AB`,
  lines: [{ id: id * 10, partNo: 'BRK-1', part: 'Bracket', qty: 10, price: 12.5, po: '' }, { id: id * 10 + 1, partNo: '', part: 'Cover plate', qty: 4, price: 30, po: 'CO-9' }],
  despatches, ...extra });
const jobs = [
  job(1, 'Zed Example Ltd', [{ id: 1, dn: 'DN-0001', date: '2026-10-20', lines: { 10: 5 }, xero: null }]),
  job(2, 'Able Example Ltd', [
    { id: 2, dn: 'DN-0002', date: '2026-10-20', lines: { 20: 10, 21: 4 }, xero: null },
    { id: 3, dn: 'DN-0003', date: '2026-10-19', lines: { 20: 2 }, xero: null, deliveredOn: '2026-10-22', deliveredAt: '2026-10-22T09:10:00Z', receivedBy: 'J Smith' },
    { id: 4, dn: 'DN-0004', date: '2026-10-18', lines: { 20: 1 }, xero: { no: 'INV-1' } }]),
  job(3, 'Middle Example Ltd', [{ id: 5, dn: 'DN-0005', date: '2026-10-21', lines: { 30: 1 }, xero: null, deliveredOn: '2026-10-22', deliveredAt: '2026-10-22T13:00:00Z' },
    { id: 6, dn: 'DN-0006', date: '2026-10-16', lines: { 30: 3 }, xero: null, deliveredOn: '2026-10-21' }], { address: '' }),
  job(4, 'Old Example Ltd', [{ id: 7, dn: 'DN-0007', date: '2026-10-15', lines: { 40: 1 }, xero: null, cancelled: { at: '2026-10-16' } }]),
];

// — Out for delivery: oldest dispatched first, then customer; delivered, invoiced and cancelled notes are not listed. —
const runs = deliveryRuns(jobs, '2026-10-22');
assert.deepEqual(runs.map(r => r.d.dn), ['DN-0002', 'DN-0001']);
const r = runs[0];
assert.equal(r.job.customer, 'Able Example Ltd');
assert.deepEqual(r.addressLines, ['Unit 2, Example Park', 'Exampletown EX1 2AB']);
assert.equal(r.firstLine, 'Unit 2, Example Park');
assert.equal(r.mapsUrl, 'https://www.google.com/maps/dir/?api=1&destination=Unit%202%2C%20Example%20Park%2C%20Exampletown%20EX1%202AB');
assert.deepEqual(r.parts, [{ qty: 10, partNo: 'BRK-1', part: 'Bracket' }, { qty: 4, partNo: '', part: 'Cover plate' }]);
assert.equal(r.po, 'CO-9', 'the call-off PO on the note wins over the order PO');
assert.equal(r.daysOut, 2);
assert.equal(runs[1].po, 'PO-1');
assert.ok(!JSON.stringify(runs.map(x => ({ ...x, job: undefined, d: undefined }))).includes('12.5'), 'never a price');
assert.deepEqual(noteParts(jobs[0], jobs[0].despatches[0]), [{ qty: 5, partNo: 'BRK-1', part: 'Bracket' }]);
assert.deepEqual(deliveryRuns([], '2026-10-22'), []);

// — Same day: by customer. —
const same = deliveryRuns([job(8, 'B Example', [{ id: 8, dn: 'DN-8', date: '2026-10-20', lines: { 80: 1 } }]),
  job(9, 'A Example', [{ id: 9, dn: 'DN-9', date: '2026-10-20', lines: { 90: 1 } }])], '2026-10-20');
assert.deepEqual(same.map(x => x.d.dn), ['DN-9', 'DN-8']);

// — Maps link: none without an address; commas and blank lines tidied. —
assert.equal(mapsUrl(''), '');
assert.equal(mapsUrl(null), '');
assert.equal(mapsUrl('  \n '), '');
assert.deepEqual(addressLines('Unit 1,\n\n  High St \r\nTown'), ['Unit 1', 'High St', 'Town']);
assert.equal(deliveryRuns([job(10, 'X', [{ id: 10, dn: 'DN-10', date: '2026-10-20', lines: { 100: 1 } }], { address: '' })], '2026-10-20')[0].mapsUrl, '');

// — Delivered today, newest first. —
assert.deepEqual(deliveredToday(jobs, '2026-10-22').map(x => x.d.dn), ['DN-0005', 'DN-0003']);
assert.deepEqual(deliveredToday(jobs, '2026-10-21').map(x => x.d.dn), ['DN-0006']);
assert.deepEqual(deliveredToday(jobs, '2026-10-01'), []);

// — Signatures: a PNG data URL under 80 KB. —
const png = 'data:image/png;base64,iVBORw0KGgo=';
assert.equal(signatureOk(png), true);
assert.equal(signatureOk('data:image/png;base64,'), false, 'empty picture');
assert.equal(signatureOk('data:image/jpeg;base64,abc'), false);
assert.equal(signatureOk('javascript:alert(1)'), false);
assert.equal(signatureOk(''), false);
assert.equal(signatureOk(null), false);
assert.equal(signatureOk('data:image/png;base64,' + 'A'.repeat(SIGNATURE_MAX)), false, 'too big');
assert.equal(SIGNATURE_MAX, 80000, 'the same limit as mark_despatch');

// — Save delivery: a name and a signature, or Nobody to sign. —
assert.match(deliveryProblem({ name: '', nobody: false, signature: '' }), /Nobody to sign/);
assert.match(deliveryProblem({ name: '  ', signature: png }), /who signed/);
assert.equal(deliveryProblem({ name: 'J Smith', signature: '' }), 'Ask them to sign in the box.');
assert.equal(deliveryProblem({ name: 'J Smith', signature: png }), '');
assert.equal(deliveryProblem({ name: '', nobody: true, signature: '', note: 'Left at goods-in' }), '');
assert.match(deliveryProblem({ name: '', nobody: true, note: '  ' }), /where it was left/);
assert.match(deliveryProblem({ name: 'J Smith', signature: 'data:image/png;base64,' + 'A'.repeat(SIGNATURE_MAX) }), /too big/);

console.log('deliveries: ok');
