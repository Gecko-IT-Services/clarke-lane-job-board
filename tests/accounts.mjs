// Keith's Accounts page: drafts with their evidence, the cut-off, purchase orders against bills, money in.
import assert from 'node:assert/strict';
const { draftsToApprove, cutOff, moneyIn, matchPurchases, outworkWithoutBill, poNo, differs } = await import('../src/core/accounts.js');

const today = '2026-10-23';
const line = (id, qty, price, due) => ({ id, lineNo: id, partNo: '', part: 'Part ' + id, qty, price, due });
const jobs = [
  { id: 1, so: 'SO-1', customer: 'Example Customer Ltd', status: 'open', lines: [line(11, 10, 5, '2026-10-10'), line(12, 10, 5, '2026-11-12')],
    despatches: [{ id: 1, dn: 'DN-1', lines: { 11: 10 }, deliveredOn: '2026-10-20', receivedBy: 'A Buyer', xero: { id: 'inv-1', no: 'INV-1' } },
      { id: 2, dn: 'DN-2', lines: { 12: 4 }, deliveredOn: '2026-10-22', receivedBy: '', xero: null }] },
  { id: 2, so: 'SO-2', customer: 'Haig Example Ltd', status: 'open', lines: [line(21, 2, 100, '2026-12-01')],
    despatches: [{ id: 3, dn: 'DN-3', lines: { 21: 1 }, deliveredOn: '2026-10-21', receivedBy: '', deliveryNote: '', xero: { id: 'inv-2', no: 'INV-2' } },
      { id: 4, dn: 'DN-4', lines: { 21: 1 }, deliveredOn: null, xero: null }] },
  { id: 3, so: 'SO-3', customer: 'Gone Ltd', status: 'cancelled', lines: [line(31, 5, 9, '2026-10-30')], despatches: [] }];

// — Drafts to approve, with what backs them. —
const inv = new Map([['inv-1', { status: 'DRAFT', number: 'INV-1', net: 50, contact: 'Example Customer Limited' }],
  ['inv-2', { status: 'DRAFT', number: 'INV-2', net: 120, contact: 'Ice Cool Servicing Ltd' }]]);
const drafts = draftsToApprove(jobs, inv);
assert.deepEqual(drafts.map(r => [r.d.dn, r.flags]), [['DN-3', ['amount', 'contact', 'unsigned']], ['DN-1', []]], 'flagged first; amount changed in Xero, a different company, nobody signed');
assert.equal(drafts[0].boardNet, 100);
assert.equal(draftsToApprove(jobs, new Map([['inv-1', { status: 'AUTHORISED', net: 50 }]])).length, 0, 'approved ones are done');
assert.deepEqual(draftsToApprove(jobs, new Map([['inv-1', { status: 'DRAFT', net: 50.004 }]]))[0].flags, [], 'a fraction of a penny is not a difference');

// — The cut-off. —
const c = cutOff(jobs, today);
assert.deepEqual(c.delivered.map(x => [x.d.dn, x.value]), [['DN-2', 20]], 'delivered, not invoiced');
assert.equal(c.deliveredThisMonth, 20);
assert.deepEqual(c.transit.map(x => x.d.dn), ['DN-4'], 'dispatched, not delivered yet');
assert.equal(c.transitTotal, 100);
assert.deepEqual(c.book, { late: 0, thisMonth: 0, nextMonth: 30, later: 0, total: 30 }, 'what is left to make: 6 × £5 due in November; the cancelled order is left out');

// — Money coming in. —
const debts = [{ number: 'INV-9', customer: 'Example Customer Ltd', due: '2026-09-30', owed: 300 }, { number: 'INV-10', customer: 'Other Ltd', due: '2026-10-28', owed: 50 },
  { number: 'INV-11', customer: 'Other Ltd', due: '2026-11-15', owed: 70 }, { number: 'INV-12', customer: 'Other Ltd', due: '2027-01-15', owed: 10 }];
const m = moneyIn(debts, jobs, [{ customer: 'EXAMPLE CUSTOMER LTD', at: '2026-10-16T09:00:00Z', by: 'Mandy' }], today);
assert.deepEqual([m.overdue, m.week, m.month, m.later], [300, 50, 70, 10]);
assert.deepEqual(m.late.map(x => [x.number, x.days, x.chased?.by]), [['INV-9', 23, 'Mandy']], 'overdue, with the last chase');
assert.equal(m.toInvoice, 30, 'due in the next 4 weeks: SO-1 line 12 (6 left × £5) is due 12 Nov');

// — Purchase orders against bills. —
assert.equal(poNo('PO-04338'), '4338');
assert.ok(differs(103, 100) && !differs(100.5, 100) && !differs(1000.5, 995), '£1 and 1% both have to be passed');
const pos = [
  { id: 'p1', number: 'PO-4338', supplierId: 's1', supplier: 'Example Metals', date: '2026-10-01', status: 'BILLED', net: 500,
    lines: [{ code: 'SHT3', description: 'Sheet 3mm', qty: 10, unit: 50 }] },
  { id: 'p2', number: 'PO-4339', supplierId: 's1', supplier: 'Example Metals', date: '2026-10-08', status: 'AUTHORISED', net: 200, lines: [] },
  { id: 'p3', number: 'PO-4340', supplierId: 's2', supplier: 'Sample Coaters', date: '2026-09-20', status: 'AUTHORISED', net: 80, lines: [] },
  { id: 'p4', number: 'PO-4341', supplierId: 's2', supplier: 'Sample Coaters', date: '2026-10-20', status: 'AUTHORISED', net: 60, lines: [] },
  { id: 'p5', number: 'PO-4342', supplierId: 's1', supplier: 'Example Metals', date: '2026-10-21', status: 'DRAFT', net: 10, lines: [] },
  { id: 'p6', number: 'PO-4343', supplierId: 's3', supplier: 'Third Supplies', date: '2026-10-02', status: 'BILLED', net: 40, lines: [] }];
const bills = [
  { id: 'b1', number: 'SI-7781', reference: 'Your PO 4338', supplierId: 's1', supplier: 'Example Metals', date: '2026-10-05', net: 530,
    lines: [{ code: 'SHT3', description: 'Sheet 3mm', qty: 10, unit: 53 }] },
  { id: 'b2', number: 'SI-7790', reference: '', supplierId: 's1', supplier: 'Example Metals', date: '2026-10-12', net: 200, lines: [] },
  { id: 'b3', number: 'SI-7795', reference: 'stock', supplierId: 's1', supplier: 'Example Metals', date: '2026-10-15', net: 75, lines: [] },
  { id: 'b4', number: '4338', reference: 'PO 4338', supplierId: 's9', supplier: 'Someone Else', date: '2026-10-06', net: 500, lines: [] }];
const { rows, extraBills } = matchPurchases(pos, bills, today);
const by = Object.fromEntries(rows.map(r => [r.po.number, r]));
assert.deepEqual([by['PO-4338'].how, by['PO-4338'].bills.map(b => b.id), by['PO-4338'].diff], ['reference', ['b1'], 30], 'the bill quoting it; not the other supplier with the same number');
assert.deepEqual(by['PO-4338'].flags, ['price', 'unit']);
assert.deepEqual(by['PO-4338'].units, [{ description: 'Sheet 3mm', qty: 10, order: 50, bill: 53 }], 'sheet went up £3 a sheet');
assert.deepEqual([by['PO-4339'].how, by['PO-4339'].bills.map(b => b.id), by['PO-4339'].flags], ['likely', ['b2'], []], 'same supplier, same amount, soon after: likely, and fine');
assert.deepEqual(by['PO-4340'].flags, ['nobill'], 'approved over 3 weeks ago, no bill');
assert.deepEqual(by['PO-4341'].flags, [], 'three days old: no bill expected yet');
assert.deepEqual(by['PO-4342'].flags, [], 'a draft is not checked');
assert.deepEqual(by['PO-4343'].flags, ['billednobill'], 'Xero says billed, but no bill quotes it');
assert.deepEqual(rows.slice(0, 3).map(r => r.po.number).sort(), ['PO-4338', 'PO-4340', 'PO-4343'], 'the ones to look at first');
assert.deepEqual(extraBills.map(b => b.id), ['b3'], "a bill from a supplier we order from, matching no order; another supplier's bills are not ours to list");

// — Work sent out with no bill seen. —
const out = [{ supplier: 'Sample Coaters Ltd', sentOn: '2026-10-01', jobId: 1 }, { supplier: 'Sample Coaters Ltd', sentOn: '2026-09-25', jobId: 2 },
  { supplier: 'Example Metals', sentOn: '2026-10-01', jobId: 3 }, { supplier: 'New Platers', sentOn: '2026-10-20', jobId: 4 }];
const ow = outworkWithoutBill(out, bills, today);
assert.deepEqual(ow.map(g => [g.supplier, g.sends.length, g.since]), [['Sample Coaters Ltd', 2, '2026-09-25']], 'Example Metals has billed since; New Platers is too recent');
console.log('accounts: ok');
