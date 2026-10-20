import assert from 'node:assert/strict';
import { lineText, metalKey, checkRfq, quoteTotal, compare, priceHistory, vsLast, billMatches, rfqEmail, rfqRef } from '../src/core/metal.js';

const al = { material: 'Aluminium', grade: '5083', form: 'Sheet', thickness: '3', size: '2500 x 1250', qty: 4, unit: 'sheets' };
const ss = { material: 'Stainless steel', grade: '304', form: 'Sheet', thickness: '1.5', size: '2500x1250', qty: 2, unit: 'sheets' };
assert.equal(lineText(al), '3mm 5083 aluminium sheet, 2500 × 1250');
assert.equal(lineText({ material: 'Other', grade: '', form: 'Other', thickness: '', size: '6m', qty: 1 }), '6m');
assert.equal(metalKey(al), metalKey({ ...al, grade: ' 5083 ', thickness: '3mm', size: '2500×1250', qty: 9 }), 'same metal however typed');
assert.notEqual(metalKey(al), metalKey(ss));
assert.equal(rfqRef(7), 'RFQ-0007');

assert.equal(checkRfq({ lines: [], suppliers: [] }), 'Add at least one line of metal.');
assert.equal(checkRfq({ lines: [{ ...al, qty: 0 }], suppliers: [] }), 'Line 1 needs the material, a thickness or size, and a quantity.');
assert.equal(checkRfq({ lines: [al], suppliers: [] }), 'Tick at least one supplier to ask.');
assert.equal(checkRfq({ lines: [al], suppliers: [{ supplier: 'Aalco', email: 'nope' }] }), 'Aalco needs an email address.');
assert.equal(checkRfq({ lines: [al], suppliers: [{ supplier: 'Aalco', email: 'sales@example.com' }] }), '');

const lines = [al, ss];
assert.deepEqual(quoteTotal(lines, { prices: [80, 55.5], carriage: 25 }), { goods: 431, total: 456, complete: true, any: true });
assert.equal(quoteTotal(lines, { prices: [80, null] }).complete, false);
const c = compare(lines, [
  { supplier: 'Aalco', prices: [82, 54], carriage: 0, leadDays: 2 },
  { supplier: 'Metals B', prices: [78, 58], carriage: 20, leadDays: 3 },
  { supplier: 'Metals C', prices: [70, null], carriage: 0 },
  { supplier: 'Metals D', prices: null }]);
assert.equal(c.best.supplier, 'Aalco', 'Aalco 436 vs B 448; C incomplete');
assert.equal(c.saving, 12);
assert.deepEqual(c.lineBest.map(x => x.suppliers), [['Metals C'], ['Aalco']]);
assert.deepEqual(c.waiting.map(r => r.supplier), ['Metals D']);

const rfqs = [
  { id: 1, createdAt: '2026-09-01T09:00:00Z', lines: [al], quotes: [{ supplier: 'Aalco', prices: [76], enteredAt: '2026-09-02T09:00:00Z' }, { supplier: 'Metals B', prices: [79], enteredAt: '2026-09-02T10:00:00Z' }] },
  { id: 2, createdAt: '2026-10-01T09:00:00Z', lines: [ss, { ...al, size: '2500×1250' }], quotes: [{ supplier: 'Aalco', prices: [50, 80], enteredAt: '2026-10-02T09:00:00Z' }] },
  { id: 3, createdAt: '2026-10-20T09:00:00Z', lines: [al], quotes: [{ supplier: 'Aalco', prices: [88] }] }];
const h = priceHistory(al, rfqs, 3);
assert.deepEqual(h.map(x => [x.ref, x.supplier, x.unit]), [['RFQ-0002', 'Aalco', 80], ['RFQ-0001', 'Aalco', 76], ['RFQ-0001', 'Metals B', 79]]);
assert.deepEqual(vsLast(88, h), { last: h[0], pct: 10 });
assert.equal(vsLast(null, h), null);

const bills = [
  { number: 'B1', supplier: 'Aalco', date: '2026-08-01', description: 'ALU SHEET 5083 H111 3.0MM 2500X1250', qty: 5, unit: 74 },
  { number: 'B2', supplier: 'Aalco', date: '2026-09-01', description: 'Stainless 304 2B 1.5mm sheet 2500 x 1250', qty: 2, unit: 52 },
  { number: 'B3', supplier: 'Other', date: '2026-09-05', description: 'Alu 5083 13mm plate', qty: 1, unit: 300 }];
assert.deepEqual(billMatches(al, bills).map(b => b.number), ['B1'], '3mm, not 13mm');
assert.deepEqual(billMatches(ss, bills).map(b => b.number), ['B2']);

const e = rfqEmail({ id: 12, lines, supplier: 'Aalco', from: 'Mandy', needBy: '30 Oct' });
assert.equal(e.subject, 'Price request RFQ-0012: aluminium and stainless steel');
assert.ok(e.html.includes('3mm 5083 aluminium sheet, 2500 × 1250') && e.html.includes('4 sheets') && e.html.includes('RFQ-0012') && e.html.includes('30 Oct'));
console.log('metal: ok');
