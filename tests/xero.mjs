import assert from 'node:assert/strict';
import { normName, matchContact, invoiceLine, buildInvoice, invoiceNet, salesDefaults, buildPurchaseOrder } from '../src/core/xero.js';

// — Customer names. —
assert.equal(normName('BSA Regal Group LTD'), normName('BSA Regal Group Limited'));
assert.equal(normName('VFS (Southampton) Ltd'), normName('VFS (SOUTHAMPTON) LTD'));
assert.equal(normName('Elite Air Handling Unit & Heat Exchange'), normName('Elite Air Handling Unit and Heat Exchange'));
assert.notEqual(normName('INDO Technologies Ltd'), normName('Indo Tech Ltd'));

const contacts = [{ id: 'a', name: 'BSA Regal Group Limited' }, { id: 'b', name: 'MultiMount' }, { id: 'c', name: 'Multi Mount' }];
assert.deepEqual(matchContact('BSA REGAL GROUP LTD', contacts, new Map()), { id: 'a', name: 'BSA Regal Group Limited', how: 'auto' });
assert.equal(matchContact('MultiMount', contacts, new Map()), null, 'two contacts normalise the same: never guess');
assert.equal(matchContact('Unknown Ltd', contacts, new Map()), null);
assert.equal(matchContact('MultiMount', contacts, new Map([[normName('MultiMount'), { id: 'c', name: 'Multi Mount' }]])).id, 'c', 'saved choice wins');

// — Money is never altered by Xero's 4dp unit prices. —
assert.deepEqual(invoiceLine('Bracket', 10, 11.327, '200', 'OUTPUT2'), { Description: 'Bracket', Quantity: 10, UnitAmount: 11.327, AccountCode: '200', TaxType: 'OUTPUT2' });
const q78 = invoiceLine('MEPL-1600 — 1.2mm Aluminium', 4000, 3.01044, '200', 'OUTPUT2');
assert.deepEqual([q78.Quantity, q78.UnitAmount, q78.Description], [1, 12041.76, 'MEPL-1600 — 1.2mm Aluminium (4000 @ £3.01044)'],
  'Q-0078: 4000 × £3.0104 would be £12,041.60, so it goes as one line of the exact £12,041.76');
assert.equal(invoiceLine('Part', 1000, 3.01044, '200').Quantity, 1, '1000 × 3.0104 = 3010.40 ≠ 3010.44');
assert.equal(invoiceLine('Part', 5, 3.01044, '200').Quantity, 5, '5 × 3.0104 = 15.05 = 15.05: keep quantities');

// — The draft invoice: exactly the despatch, referenced SO / PO / DN, never approved. —
const inv = buildInvoice({ dn: 'DN-0002', date: '2026-10-16', so: 'SO-9781', po: 'P31620', calloff: '2 of 5',
  lines: [{ part: 'Luton bezel LH', qty: 30, unit: 76.26 }, { part: 'Luton bezel RH', qty: 0, unit: 76.26 }] }, 'contact-1', '200', 'OUTPUT2');
assert.equal(inv.Status, 'DRAFT');
assert.equal(inv.Type, 'ACCREC');
assert.equal(inv.Reference, 'SO-9781 / PO P31620 / DN-0002');
assert.equal(inv.LineItems.length, 1, 'parts not on this despatch are left off');
assert.equal(inv.LineItems[0].Description, 'Luton bezel LH (call-off 2 of 5)');
assert.equal(invoiceNet(inv), 2287.8);
assert.equal(buildInvoice({ dn: 'DN-1', date: '2026-10-16', so: 'SO-1', po: '', calloff: '', lines: [{ part: 'a', qty: 1, unit: 1 }] }, 'c', '200').Reference, 'SO-1 / DN-1');

// — Account and VAT: what Clarke Lane's own invoices use most. —
assert.deepEqual(salesDefaults([
  { LineItems: [{ AccountCode: '200', TaxType: 'OUTPUT2' }, { AccountCode: '200', TaxType: 'OUTPUT2' }] },
  { LineItems: [{ AccountCode: '260', TaxType: 'OUTPUT2' }, { Description: 'note line' }] }]),
  { accountCode: '200', taxType: 'OUTPUT2', seen: 2 });
assert.equal(salesDefaults([]), null);

// — The edge function bundles a copy of src/core/xero.js; they must not drift apart. —
import { readFileSync } from 'node:fs';
assert.equal(readFileSync(new URL('../supabase/functions/xero/xero-core.js', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/core/xero.js', import.meta.url), 'utf8'),
  'supabase/functions/xero/xero-core.js differs from src/core/xero.js: copy it across');

console.log('xero: ok');

// — PO per call-off: a dispatch uses its lines' own POs, else the order's. —
{
  const { dispatchPo } = await import('../src/core/xero.js');
  assert.equal(dispatchPo('PO-1', ['', '']), 'PO-1');
  assert.equal(dispatchPo('PO-1', ['CO-7', 'CO-7']), 'CO-7');
  assert.equal(dispatchPo('', ['CO-7', ' CO-8 ', '']), 'CO-7, CO-8');
  assert.equal(dispatchPo('', []), '');
  console.log('xero dispatch PO: ok');
}

// Pro forma paid in advance: named in the reference and on a note line, not counted in the net.
{
  const pre = buildInvoice({ dn: 'DN-1', date: '2026-10-19', so: 'SO-9790', po: '', calloff: '', lines: [{ part: 'a', qty: 2, unit: 5 }], prepaid: ['PF-0003'] }, 'c', '200', 'OUTPUT2');
  assert.equal(pre.Reference, 'SO-9790 / DN-1 / paid in advance PF-0003');
  assert.deepEqual(pre.LineItems.at(-1), { Description: 'Paid in advance: pro forma PF-0003' });
  assert.equal(invoiceNet(pre), 10);
  console.log('xero pro forma note: ok');
}

// Purchase orders: draft, SO as the reference, empty lines dropped, pennies rounded.
{
  const po = buildPurchaseOrder({ date: '2026-10-19', deliveryDate: '2026-10-24', so: 'SO-9790', customer: 'Example Ltd',
    lines: [{ description: 'Powder coat RAL 9005, 40 brackets', qty: 1, unit: 120.004 }, { description: '', qty: 2, unit: 5 }, { description: 'Inserts M6', qty: 0, unit: 1 }] }, 's1');
  assert.equal(po.Status, 'DRAFT');
  assert.equal(po.Reference, 'SO-9790 for Example Ltd');
  assert.equal(po.DeliveryDate, '2026-10-24');
  assert.deepEqual(po.LineItems, [{ Description: 'Powder coat RAL 9005, 40 brackets', Quantity: 1, UnitAmount: 120 }]);
  const coded = buildPurchaseOrder({ date: '2026-10-19', so: 'SO-9790', accountCode: '5000',
    lines: [{ description: 'Steel 3mm sheet', qty: 2, unit: 50 }, { description: 'Steel 2mm sheet', qty: 1, unit: 40 }] }, 's1');
  assert.deepEqual(coded.LineItems.map(l => l.AccountCode), ['5000', '5000'], 'one account on every line');
  assert.equal('AccountCode' in buildPurchaseOrder({ date: '2026-10-19', so: 'SO-1', accountCode: '', lines: [{ description: 'x', qty: 1, unit: 1 }] }, 's1').LineItems[0], false, 'not sure: left for Keith');
  console.log('xero purchase order: ok');
}

// emailList: several addresses in one box.
{
  const { emailList } = await import('../src/core/jobs.js');
  const assert = (await import('node:assert')).strict;
  assert.deepEqual(emailList('a@x.co.uk, b@x.co.uk; A@X.co.uk\nc@y.com'), { ok: ['a@x.co.uk', 'b@x.co.uk', 'c@y.com'], bad: [] });
  assert.deepEqual(emailList('buyer@x.com and accounts'), { ok: ['buyer@x.com'], bad: ['and', 'accounts'] });
  assert.deepEqual(emailList(''), { ok: [], bad: [] });
  assert.deepEqual(emailList('<a@x.com>'), { ok: ['a@x.com'], bad: [] });
  console.log('emailList ok');
}
