// Search everything: what matches, in which group, and what the shop floor never sees.
import assert from 'node:assert/strict';
const { matches, searchAll } = await import('../src/core/search.js');

assert.ok(matches('so 9781', 'SO-9781'), 'spaces and dashes inside codes do not matter');
assert.ok(matches('bracket s275', 'Bracket 3mm S275'), 'every word, any order');
assert.ok(!matches('bracket s355', 'Bracket 3mm S275'));
assert.ok(!matches('', 'anything'));

const src = {
  jobs: [{ id: 1, so: 'SO-9781', customer: 'Example Racers Ltd', po: 'PO-4471', quote: 'Q-0301', lines: [{ part: 'Exhaust shim EX-PR-20001', price: 12.5 }],
    despatches: [{ dn: 'DN-0007', date: '2026-10-14' }] },
    { id: 2, so: 'SO-9782', customer: 'Sample Works Ltd', po: '', lines: [{ part: 'Cabinet' }], despatches: [] },
    { id: 3, so: 'SO-0001', customer: 'Preview', preview: true, lines: [], despatches: [] }],
  customers: [{ key: 'exampleracers', name: 'Example Racers Ltd' }, { key: 'sampleworks', name: 'Sample Works Ltd' }],
  people: [{ id: 7, key: 'sampleworks', customer: 'Sample Works Ltd', name: 'Sam Buyer', email: 'sam@sample.example', phone: '01234 567890' }],
  quotes: [{ spId: 400, quoteNo: 'Q-0320', customer: 'Sample Works Ltd', status: 'Quote', quoteDate: '2026-10-01' }],
  invoices: [{ number: 'INV-5001', customer: 'Example Racers Ltd', reference: 'PO-4471', date: '2026-10-02' }],
  parts: [{ id: 9, partNo: 'EX-PR-20001', customer: 'Example Racers Ltd', customerKey: 'exampleracers', description: 'Exhaust shim' }],
  enquiries: [{ id: 3, company: 'Newco Fabrications', fromName: 'Jo Bloggs', subject: 'Quote for brackets', wants: '50 brackets' }],
  tasks: [{ id: 4, title: 'Call Sam about brackets', customer: 'Sample Works Ltd', customerKey: 'sampleworks' }, { id: 5, title: 'Old brackets task', doneAt: '2026-10-01' }],
};
const kinds = (q, o) => searchAll(q, src, o).map(g => g.kind);
assert.deepEqual(searchAll('9781', src, { office: true })[0].items[0], { kind: 'job', id: 1, title: 'SO-9781 · Example Racers Ltd', sub: 'PO PO-4471 · Exhaust shim EX-PR-20001', key: 'exampleracers', name: 'Example Racers Ltd' });
assert.deepEqual(kinds('po-4471', { office: true }), ['job', 'invoice'], 'a customer PO finds the order and the invoice');
assert.deepEqual(kinds('dn 7', { office: true }), ['dn'], 'words in any order: dn and 7');
assert.deepEqual(kinds('dn-0007', { office: true }), ['dn']);
assert.deepEqual(kinds('sam', { office: true }).sort(), ['customer', 'job', 'person', 'quote', 'task'], 'Sample Works (customer, order, quote), Sam Buyer, the open task (not the done one)');
assert.deepEqual(kinds('01234567890', { office: true }), ['person'], 'a phone number without spaces');
assert.deepEqual(kinds('ex-pr-20001', { office: true }).sort(), ['job', 'part'].sort());
assert.deepEqual(kinds('brackets', { office: true }).sort(), ['enquiry', 'task'].sort());
assert.equal(searchAll('preview', src, { office: true }).length, 0, 'practice orders are not searched');
assert.equal(searchAll('s', src, { office: true }).length, 0, 'two letters at least');

// Newest first within a group.
const many = { quotes: [{ spId: 1, quoteNo: 'Q-0001', customer: 'Sample', quoteDate: '2025-01-01' }, { spId: 2, quoteNo: 'Q-0002', customer: 'Sample', quoteDate: '2026-05-01' }] };
assert.deepEqual(searchAll('sample', many, { office: true })[0].items.map(x => x.id), [2, 1]);

// The shop floor: orders and delivery notes only.
assert.deepEqual(kinds('sam', {}), ['job'], 'the order, not the contact, quote or task');
assert.deepEqual(kinds('q-0320', {}), [], 'no quotes');
assert.deepEqual(kinds('inv-5001', {}), [], 'no invoices');
assert.deepEqual(kinds('sample', {}), ['job']);
assert.ok(!JSON.stringify(searchAll('9781', src, {})).includes('12.5'), 'never a price');

// Best group first: an exact code beats a word inside another group.
assert.equal(searchAll('q-0320', src, { office: true })[0].kind, 'quote');
console.log('search: ok');
