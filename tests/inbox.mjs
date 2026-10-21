import assert from 'node:assert/strict';
import { linkEmail, emailActions, topicChip, topicTone, sortEmails, emailTaskTitle, customerQuestion, needTopic, cleanTopic, TOPICS } from '../src/core/inbox.js';

// Made-up orders and quotes only.
const jobs = [{ id: 1, so: 'SO-9781', po: 'PO-1', spQuoteId: 301, customer: 'Example Customer Ltd', lines: [] },
  { id: 2, so: 'SO-9782', po: '', spQuoteId: null, customer: 'Second Example Ltd', lines: [{ po: 'PO-55120' }] },
  { id: 3, so: 'SO-9783', po: 'PO-7781', spQuoteId: null, customer: 'Fourth Example Ltd', lines: [] },
  { id: 99, so: 'PV-9784', preview: true, po: '', customer: 'Preview Example Ltd' }];
const quotes = [{ spId: 301, quoteNo: 'Q-0301' }, { spId: 312, quoteNo: 'Q-0312' }, { spId: 520, quoteNo: 'Q-0320' }];
const link = refs => linkEmail({ refs }, { jobs, quotes });

// — The order: "SO-" optional, a zero for the O tolerated, the order's quote comes with it. —
assert.deepEqual(link({ so: 'SO-9781' }), { jobId: 1, quoteSpId: 301 });
assert.deepEqual(link({ so: '9781' }), { jobId: 1, quoteSpId: 301 });
assert.deepEqual(link({ so: 'S0-9781' }), { jobId: 1, quoteSpId: 301 });
assert.deepEqual(link({ so: 'so 9782' }), { jobId: 2, quoteSpId: null });
assert.deepEqual(link({ so: 'SO-1234' }), { jobId: null, quoteSpId: null }, 'no such order');
assert.deepEqual(link({ so: '' , po: '', quote: '' }), { jobId: null, quoteSpId: null });
assert.deepEqual(linkEmail({}, {}), { jobId: null, quoteSpId: null }, 'nothing given is fine');

// — The quote: Q-0312, Q0312, 0312; a quote named wins over the order's own. —
for (const q of ['Q-0312', 'Q0312', '0312', 'q 312']) assert.equal(link({ quote: q }).quoteSpId, 312, q);
assert.deepEqual(link({ so: 'SO-9781', quote: 'Q-0320' }), { jobId: 1, quoteSpId: 520 });
assert.equal(link({ quote: 'QCLE01204' }).quoteSpId, null, 'an old SharePoint quote file is not a calculator quote');

// — Their PO: the order's, or one of its lines'; not a preview order. —
assert.equal(link({ po: 'PO-7781' }).jobId, 3);
assert.equal(link({ po: 'P.O. 7781' }).jobId, 3);
assert.equal(link({ po: '55120' }).jobId, 2);
assert.equal(link({ po: 'PO-1' }).jobId, null, 'too short to trust');
assert.equal(link({ so: '9784' }).jobId, null, 'preview orders are not real');

// — The chips. —
assert.equal(topicChip('po'), 'PO received');
assert.equal(topicChip('quote_question'), 'Question on a quote');
assert.equal(topicChip('order_change'), 'Order change');
assert.equal(topicChip('delivery'), 'Delivery');
assert.equal(topicChip('complaint'), 'Complaint');
assert.equal(topicChip('lead_time'), 'Lead time');
assert.equal(topicChip('invoice'), 'Invoice');
assert.equal(topicChip('other'), '');
assert.equal(topicChip(''), '');
assert.equal(topicTone('complaint'), 'late');
assert.equal(topicTone('po'), 'ok');
assert.equal(topicTone('delivery'), '');
assert.equal(TOPICS.length, 8);

// — The buttons for each topic. —
const labels = e => emailActions({ id: 7, ...e }).map(b => b.label);
const attrs = e => emailActions({ id: 7, ...e }).map(b => b.attrs);
// A PO against a quote: Won quotes (mark it Ordered in the calculator first); with no quote: a new order.
const poQ = emailActions({ id: 7, topic: 'po', quoteSpId: 520, refs: { quote: 'Q-0320' } });
assert.deepEqual(poQ.map(b => b.label), ['Won quotes', 'Add a task']);
assert.equal(poQ[0].attrs, 'data-tab="quotes"');
assert.equal(poQ[0].note, 'mark Q-0320 as Ordered in the calculator');
assert.equal(poQ[0].tone, 'pri');
assert.equal(emailActions({ id: 7, topic: 'po', quoteSpId: 520, quoteNo: 'Q-0320', refs: { quote: '0320' } })[0].note, 'mark Q-0320 as Ordered in the calculator', 'the calculator\'s own number when known');
assert.deepEqual(attrs({ topic: 'po', quoteSpId: null }), ['data-neworder', 'data-taskadd="enquiry:7"']);
assert.deepEqual(labels({ topic: 'po' }), ['Make the order', 'Add a task']);
// A question on a quote: on the chase list (when the quote is known), and a reply.
assert.deepEqual(attrs({ topic: 'quote_question', quoteSpId: 312 }), ['data-enqchase="7"', 'data-enqreply="7"']);
assert.deepEqual(labels({ topic: 'quote_question', quoteSpId: 312 }), ['Put on the chase list', 'Draft a reply with AI']);
assert.deepEqual(labels({ topic: 'quote_question', quoteSpId: null }), ['Add a task', 'Draft a reply with AI']);
// Order change, delivery, lead time: the order (when linked), a reply, a task.
for (const topic of ['order_change', 'delivery', 'lead_time']) {
  assert.deepEqual(attrs({ topic, jobId: 1 }), ['data-open="1"', 'data-enqreply="7"', 'data-taskadd="enquiry:7"'], topic);
  assert.deepEqual(labels({ topic, jobId: null }), ['Draft a reply with AI', 'Add a task'], topic);
  assert.equal(emailActions({ id: 7, topic, jobId: null })[0].tone, 'pri', 'the reply is the main button with no order');
}
// A complaint: a task first (red), then the order.
const comp = emailActions({ id: 7, topic: 'complaint', jobId: 2 });
assert.deepEqual(comp.map(b => b.label), ['Make a task', 'Open the order', 'Draft a reply with AI']);
assert.equal(comp[0].tone, 'bad');
assert.equal(comp[0].attrs, 'data-taskadd="enquiry:7"');
assert.deepEqual(labels({ topic: 'complaint' }), ['Make a task', 'Draft a reply with AI']);
// Invoice: the customer's Orders and invoices tab; other: a task.
assert.deepEqual(attrs({ topic: 'invoice', customerKey: 'examplecustomer' }), ['data-custpage="examplecustomer" data-custtab="orders"', 'data-taskadd="enquiry:7"']);
assert.deepEqual(labels({ topic: 'invoice', customerKey: '' }), ['Add a task']);
assert.deepEqual(labels({ topic: 'other' }), ['Add a task']);
assert.deepEqual(labels({ topic: '' }), ['Add a task'], 'not read yet');
// Nothing priced on any button, for Levi or Mandy.
for (const topic of TOPICS) for (const md of [true, false]) assert.ok(!/£|value|price/i.test(JSON.stringify(emailActions({ id: 1, topic, quoteSpId: 1, jobId: 1, customerKey: 'k' }, { md }))));

// — Complaints first, then POs, the rest as they were. —
const list = [{ id: 1, topic: 'delivery' }, { id: 2, topic: 'po' }, { id: 3, topic: '' }, { id: 4, topic: 'complaint' }, { id: 5, topic: 'po' }, { id: 6, topic: 'complaint' }];
assert.deepEqual(sortEmails(list).map(e => e.id), [4, 6, 2, 5, 1, 3]);
assert.deepEqual(sortEmails([]), []);

// — The task an email becomes. —
assert.equal(emailTaskTitle({ topic: 'complaint', summary: 'Brackets arrived bent; 10 to be re-made urgently.' }, 'SO-9782'), 'Sort out SO-9782: Brackets arrived bent; 10 to be re-made urgently.');
assert.equal(emailTaskTitle({ topic: 'complaint', summary: 'Plates arrived at half size.' }), 'Sort out: Plates arrived at half size.');
assert.equal(emailTaskTitle({ topic: 'delivery', company: 'Example Customer Ltd', summary: 'When will it arrive?' }, 'SO-9781'), 'Reply to Example Customer Ltd (SO-9781): When will it arrive?');
assert.ok(emailTaskTitle({ topic: 'other', subject: 'x'.repeat(400) }).length <= 200);

// — The customer's question on the quote card: newest, last 14 days, that quote only. —
const today = '2026-10-21';
const acts = [{ spId: 312, kind: 'note', note: 'Customer asked: does the price include folding?', at: '2026-10-20T09:00:00Z' },
  { spId: 312, kind: 'note', note: 'Customer asked: an older question', at: '2026-10-10T09:00:00Z' },
  { spId: 312, kind: 'call', note: 'Customer asked: not a note', at: '2026-10-21T09:00:00Z' },
  { spId: 520, kind: 'note', note: 'Customer asked: a breakdown of the price increase', at: '2026-09-30T09:00:00Z' },
  { spId: 301, kind: 'note', note: 'Rang them', at: '2026-10-21T09:00:00Z' }];
assert.equal(customerQuestion(acts, 312, today), 'does the price include folding?');
assert.equal(customerQuestion(acts, 520, today), '', 'over 14 days old');
assert.equal(customerQuestion(acts, 301, today), '', 'not a customer question');
assert.equal(customerQuestion([], 312, today), '');

// — The backfill: new customer emails and enquiries with no topic, up to ten; the AI's answer made safe. —
const rows = [{ id: 1, kind: 'customer', status: 'new', topic: '' }, { id: 2, kind: 'customer', status: 'new', topic: 'po' }, { id: 3, kind: 'other', status: 'new', topic: '' },
  { id: 4, kind: 'enquiry', status: 'new', topic: '' }, { id: 5, kind: 'customer', status: 'ignored', topic: '' }, { id: 6, kind: 'customer', status: 'new' }];
assert.deepEqual(needTopic(rows).map(e => e.id), [1, 4, 6]);
assert.equal(needTopic(Array.from({ length: 20 }, (_, i) => ({ id: i, kind: 'customer', status: 'new', topic: '' }))).length, 10);
assert.deepEqual(cleanTopic({ topic: 'complaint', refs: { so: ' SO-9782 ', po: '', quote: undefined } }), { topic: 'complaint', refs: { so: 'SO-9782', po: '', quote: '' } });
assert.deepEqual(cleanTopic({ topic: 'nonsense' }), { topic: 'other', refs: { so: '', po: '', quote: '' } });
assert.deepEqual(cleanTopic(null), { topic: 'other', refs: { so: '', po: '', quote: '' } });

console.log('inbox: ok');
