import assert from 'node:assert/strict';
import { norm, resolveColumns, quoteLookupColumn, toQuote, toLine, QUOTE_FIELDS, LINE_FIELDS } from '../src/core/quotes.js';

assert.equal(norm('Thickness_x0028_mm_x0029_'), 'thicknessmm');
assert.equal(norm('Drawing_x002f_Description'), 'drawingdescription');

// — Display and internal names both match. —
const qcols = [{ name: 'QuoteNo', displayName: 'QuoteNo' }, { name: 'CustomerName', displayName: 'Customer' },
  { name: 'Status', displayName: 'Status' }, { name: 'CarriageCost', displayName: 'CarriageCost' }];
const qc = resolveColumns(qcols, QUOTE_FIELDS, 'Quotes');
assert.equal(qc.customer, 'CustomerName');
assert.equal(qc.carriage, 'CarriageCost');
assert.equal(qc.contactName, undefined, 'optional and absent is fine');

// — A missing required column is an error that names it, never an empty list. —
assert.throws(() => resolveColumns([{ name: 'Title', displayName: 'Title' }], QUOTE_FIELDS, 'Quotes'),
  /"Quotes" has no column "QuoteNo", "Customer", "Status"/);

const lcols = [{ name: 'Quantity', displayName: 'Quantity' }, { name: 'Qty', displayName: 'Qty' },
  { name: 'SellTotal', displayName: 'SellTotal' }, { name: 'Thickness_x0028_mm_x0029_', displayName: 'Thickness (mm)' },
  { name: 'Drawing_x002f_Description', displayName: 'Drawing/Description' },
  { name: 'Quote', displayName: 'Quote', lookup: { listId: 'ABC-123' } }];
const lc = resolveColumns(lcols, LINE_FIELDS, 'QuoteLines');
assert.equal(lc.qty, 'Quantity', 'Quantity preferred over Qty');
assert.equal(lc.thickness, 'Thickness_x0028_mm_x0029_');
assert.equal(lc.desc, 'Drawing_x002f_Description');
assert.equal(quoteLookupColumn(lcols, 'abc-123'), 'Quote');
assert.throws(() => quoteLookupColumn(lcols, 'other'), /no lookup column/);

const q = toQuote({ id: '307', fields: { QuoteNo: 'Q-0307', CustomerName: ' BSA Regal Group LTD ', Status: 'Ordered', CarriageCost: '12.5' } }, qc);
assert.deepEqual([q.spId, q.quoteNo, q.customer, q.status, q.carriage], [307, 'Q-0307', 'BSA Regal Group LTD', 'Ordered', 12.5]);

const l = toLine({ fields: { Quantity: 6, SellTotal: 110.62, Thickness_x0028_mm_x0029_: 3, Drawing_x002f_Description: '5808-3' } }, lc);
assert.deepEqual([l.qty, l.sellTotal, l.thickness, l.desc, l.paint, l.holes], [6, 110.62, 3, '5808-3', false, 0]);

console.log('quotes: ok');
