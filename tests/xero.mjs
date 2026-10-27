import assert from 'node:assert/strict';
import { normName, matchContact, withoutCode, nameWords, looksSame, rankContacts, invoiceLine, buildInvoice, invoiceNet, salesDefaults, buildPurchaseOrder } from '../src/core/xero.js';

// — Customer names. —
assert.equal(normName('Example Group LTD'), normName('Example Group Limited'));
assert.equal(normName('Sample (Hampshire) Ltd'), normName('Sample (HAMPSHIRE) LTD'));
assert.equal(normName('Elite Air Handling Unit & Heat Exchange'), normName('Elite Air Handling Unit and Heat Exchange'));
assert.notEqual(normName('INDO Technologies Ltd'), normName('Indo Tech Ltd'));

const contacts = [{ id: 'a', name: 'Example Group Limited' }, { id: 'b', name: 'MetroMount' }, { id: 'c', name: 'Metro Mount' }];
assert.deepEqual(matchContact('EXAMPLE GROUP LTD', contacts, new Map()), { id: 'a', name: 'Example Group Limited', how: 'auto' });
assert.equal(matchContact('MetroMount', contacts, new Map()), null, 'two contacts normalise the same: never guess');
assert.equal(matchContact('Unknown Ltd', contacts, new Map()), null);
assert.equal(matchContact('MetroMount', contacts, new Map([[normName('MetroMount'), { id: 'c', name: 'Metro Mount' }]])).id, 'c', 'saved choice wins');

// — The account code at the end of a Xero contact's name (22 Oct). —
assert.equal(withoutCode('Sample (Hampshire) Ltd (SAM1)'), 'Sample (Hampshire) Ltd');
assert.equal(withoutCode('1111 LIGHTING SOLUTIONS LTD (1111)'), '1111 LIGHTING SOLUTIONS LTD');
assert.equal(withoutCode('Sample (Hampshire) Ltd'), 'Sample (Hampshire) Ltd', 'a place in brackets is part of the name');
assert.equal(withoutCode('Example Parts (UK)'), 'Example Parts (UK)', 'no digit: not a code');
const coded = [{ id: 'h', name: 'Haig Example Ltd (HAI1)' }, { id: 'i', name: 'Ice Example Servicing Ltd' }, { id: 's', name: 'Sample (Hampshire) Ltd (SAM1)' }];
assert.deepEqual(matchContact('Haig Example Ltd', coded, new Map()), { id: 'h', name: 'Haig Example Ltd (HAI1)', how: 'auto' }, 'matched without the code');
assert.equal(matchContact('Sample (Hampshire) Ltd', coded, new Map()).id, 's');
assert.equal(matchContact('Sample (Hampshire) Ltd (SAM1)', coded, new Map()).id, 's', 'a customer typed with the code too');
assert.equal(matchContact('Haig Example Ltd', [...coded, { id: 'h2', name: 'Haig Example Ltd (HAI2)' }], new Map()), null, 'two accounts: Mandy chooses');

// — Does the contact look like the customer? Asked before linking, and before sending a saved link. —
assert.deepEqual(nameWords('Haig Engineering Ltd (HAI1)'), ['haig']);
assert.ok(looksSame('Haig Engineering Ltd', 'Haig Engineering Ltd (HAI1)'));
assert.ok(!looksSame('Haig Engineering Ltd', 'Ice Cool Servicing Ltd'), "today's mistake is caught");
assert.ok(!looksSame('Haig Engineering Ltd', 'Other Engineering Ltd'), 'a shared everyday word is not enough');
assert.ok(looksSame('MetroMount', 'Metro Mount'));
assert.ok(looksSame('Sample (Southampton) Ltd', 'Sample (Southampton) Ltd (SAM1)'));
assert.ok(looksSame('Miscellaneous', 'MISCELLANEOUS'));

// — The picker: likely ones first; a search finds any. —
const book = [{ id: 'i', name: 'Ice Cool Servicing Ltd' }, { id: 'h', name: 'Haig Engineering Ltd (HAI1)' }, { id: 'g', name: 'Haig Group Holdings' }, { id: 'z', name: 'Zed Ltd' }];
assert.deepEqual(rankContacts('Haig Engineering Ltd', book).map(c => c.id), ['h', 'g'], 'only the Haig ones, the same name first');
assert.deepEqual(rankContacts('Haig Group Holdings', book).map(c => c.id), ['g', 'h'], 'the same name first, whatever the alphabet says');
assert.deepEqual(rankContacts('Haig Engineering Ltd', book, 'ice').map(c => c.id), ['i'], 'typing finds any contact');
assert.deepEqual(rankContacts('Nobody Ltd', book), [], 'no likely one: type to search');

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
assert.equal(inv.LineItems[0].ItemCode, undefined, 'no item code unless the caller found one in Xero');
assert.equal(buildInvoice({ dn: 'DN-3', date: '2026-10-27', so: 'SO-3', po: '', calloff: '', lines: [{ part: 'BRK-1 Bracket', qty: 2, unit: 5, code: 'BRK-1' }] }, 'c', '200').LineItems[0].ItemCode, 'BRK-1', 'a part number that is one of Xero\'s items fills the Item column (27 Oct)');
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
  assert.deepEqual(po.LineItems, [{ Description: 'Powder coat RAL 9005, 40 brackets', Quantity: 1, UnitAmount: 120.004 }], 'unit prices keep 4dp');
  const metal = buildPurchaseOrder({ date: '2026-10-19', so: 'SO-1', lines: [{ description: 'Aluminium 3mm', qty: 800, unit: 1.2345 }, { description: 'MEPL-1600', qty: 4000, unit: 3.01044 }] }, 's1').LineItems;
  assert.deepEqual([metal[0].Quantity, metal[0].UnitAmount], [800, 1.2345], '£987.60, not 800 × £1.23');
  assert.deepEqual([metal[1].Quantity, metal[1].UnitAmount, metal[1].Description], [1, 12041.76, 'MEPL-1600 (4000 @ £3.01044)'], '4dp would change the total: 1 × the total');
  const coded = buildPurchaseOrder({ date: '2026-10-19', so: 'SO-9790', accountCode: '5000',
    lines: [{ description: 'Steel 3mm sheet', qty: 2, unit: 50 }, { description: 'Steel 2mm sheet', qty: 1, unit: 40 }] }, 's1');
  assert.deepEqual(coded.LineItems.map(l => l.AccountCode), ['5000', '5000'], 'one account on every line');
  assert.equal('AccountCode' in buildPurchaseOrder({ date: '2026-10-19', so: 'SO-1', accountCode: '', lines: [{ description: 'x', qty: 1, unit: 1 }] }, 's1').LineItems[0], false, 'not sure: left for Keith');
  console.log('xero purchase order: ok');
// Half-pennies round up, as Postgres does: 7 × 0.145 (1.0149999… in floating point) is £1.02, 5 × 0.205 is £1.03.
assert.equal(invoiceNet({ LineItems: [{ Quantity: 7, UnitAmount: 0.145 }] }), 1.02);
assert.equal(invoiceNet({ LineItems: [{ Quantity: 5, UnitAmount: 0.205 }] }), 1.03);
assert.equal(invoiceNet({ LineItems: [{ Quantity: 1, UnitAmount: -1.005 }] }), -1.01, 'away from zero');
console.log('xero rounding: ok');
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
