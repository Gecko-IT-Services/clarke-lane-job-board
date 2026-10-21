import assert from 'node:assert/strict';
import { digestPicks, samePicks, fallbackLine, digestFacts, noMoney, KIND_ORDER } from '../src/core/digest.js';

const today = '2026-10-21', now = '2026-10-21T09:00:00Z';
const hoursAgo = h => new Date(Date.parse(now) - h * 36e5).toISOString();
const enquiries = [
  { id: 1, kind: 'enquiry', status: 'new', receivedAt: hoursAgo(30), company: 'Newco Fabrications Ltd', wants: '50 brackets', hasDrawings: true, customerKey: '' },
  { id: 2, kind: 'enquiry', status: 'new', receivedAt: hoursAgo(70), company: 'Older Example Ltd', wants: 'a guard', customerKey: 'olderexample' },
  { id: 3, kind: 'enquiry', status: 'new', receivedAt: hoursAgo(5), company: 'Fresh Example Ltd' },          // under a day: not yet
  { id: 4, kind: 'enquiry', status: 'replied', receivedAt: hoursAgo(90), company: 'Done Example Ltd' },
  { id: 5, kind: 'customer', status: 'new', receivedAt: hoursAgo(90), company: 'Customer Example Ltd' }];
const tasks = [{ id: 9, title: 'Call Sam about the next batch', customer: 'Example Customer Ltd', dueOn: '2026-10-19', doneAt: null },
  { id: 8, title: 'Send the revised drawing', dueOn: '2026-10-22', doneAt: null }, { id: 7, title: 'Done one', dueOn: '2026-10-01', doneAt: '2026-10-02' }];
const chase = [{ spId: 501, quoteNo: 'Q-0321', customer: 'Second Example Ltd', stage: 'due', value: 4200, likely: 1600, chance: 0.38, age: 9 },
  { spId: 503, quoteNo: 'Q-0323', customer: 'Fourth Example Ltd', stage: 'follow', value: 2750, likely: 900, chance: 0.33, age: 21 }];
const job = { id: 44, so: 'SO-1001', customer: 'Example Customer Ltd', status: 'open' };
const late = [{ job, days: 6 }, { job: { ...job, id: 45, so: 'SO-1002' }, days: 2 }];
const reorders = [{ key: 'tenthexample', customer: 'Tenth Example Ltd', item: 'Shelf bracket', every: 20, since: 30, worth: 2000 },
  { key: 'secondexample', customer: 'Second Example Ltd', item: 'Mounting plate', every: 28, since: 40, worth: 9000 }];
const all = { enquiries, chase, reorders, late, tasks, today, now };

// — Ranked, one of each kind: the oldest enquiry waiting over a day, an overdue task, the quote to chase. —
const office = digestPicks({ ...all, role: 'office' });
assert.deepEqual(office.map(p => [p.kind, p.id]), [['enquiry', '2'], ['task', '9'], ['quote', '501']]);
assert.equal(office[0].title, 'Reply to Older Example Ltd');
assert.equal(office[0].open.attrs, 'data-tab="customers" data-goenq data-goenqid="2"');
assert.equal(office[0].facts.waitingDays, 2);
assert.equal(office[1].open.attrs, 'data-gotasks');
assert.equal(office[1].facts.daysOverdue, 2);
assert.equal(office[2].open.attrs, 'data-tab="sales"');

// — Mandy's picks never carry money; Levi's carry the quote's and the late order's value. —
const officeAll = digestPicks({ ...all, role: 'office', enquiries: [], tasks: [], jobValue: () => 5000 });
assert.deepEqual(officeAll.map(p => p.kind), ['quote', 'late', 'reorder']);
assert.ok(!/4200|2750|5000|9000|2000|value|worth/i.test(JSON.stringify(officeAll.map(p => p.facts))), 'no money for the office');
const md = digestPicks({ ...all, role: 'md', enquiries: [], tasks: [], jobValue: () => 5000 });
assert.equal(md[0].facts.value, 4200);
assert.equal(md[1].facts.valueStillToSend, 5000);
assert.equal(md[1].open.attrs, 'data-homeview="late"');
assert.equal(md[1].title, 'SO-1001 for Example Customer Ltd is 6 days late');
assert.equal(md[2].id, 'secondexample|Mounting plate', 'the reorder most worth asking about');
assert.equal(md[2].open.attrs, 'data-tab="sales" data-gosmart');
assert.ok(!('worth' in md[2].facts));

// — Two of a kind only when nothing else; never more than three; nothing at all is fine. —
assert.deepEqual(digestPicks({ role: 'office', enquiries, today, now }).map(p => p.id), ['2', '1']);
assert.deepEqual(digestPicks({ role: 'office', late, reorders, today, now }).map(p => p.kind), ['late', 'reorder', 'late']);
assert.deepEqual(digestPicks({ role: 'md', today }), []);

// — The cache is used only when today's picks are the same things. —
assert.ok(samePicks(office, JSON.parse(JSON.stringify(office))));
assert.ok(!samePicks(office, md));
assert.ok(!samePicks(office, office.slice(0, 2)));
assert.ok(samePicks([], []));

// — Plain lines when the AI is not there, and what the AI is sent. —
assert.equal(fallbackLine(office[0]), 'Waiting 2 days for a reply: a guard.');
assert.equal(fallbackLine(office[1]), 'Was due 2 days ago (Example Customer Ltd).');
assert.equal(fallbackLine(office[2]), 'Its follow-up is due today.');
assert.ok(md.every(p => fallbackLine(p) && !/£|\d{4}/.test(fallbackLine(p))));
const f = digestFacts('Mandy Example', 'office', office);
assert.deepEqual(Object.keys(f), ['name', 'role', 'picks']);
assert.equal(f.name, 'Mandy');
assert.ok(!JSON.stringify(f).includes('data-'), 'no screen attributes sent');

// — Customers' emails (21 Oct): a complaint outranks everything, a PO everything but a complaint, a question on a
//   quote comes just below an enquiry waiting. Only new customer emails; no 24-hour wait for these. —
assert.deepEqual(KIND_ORDER.slice(0, 4), ['complaint', 'po', 'enquiry', 'question']);
const emails = [
  { id: 20, kind: 'customer', status: 'new', topic: 'quote_question', receivedAt: hoursAgo(3), company: 'Sample Works Ltd', summary: 'Does the £1,250 price include folding?', refs: { so: '', po: '', quote: 'Q-0312' } },
  { id: 21, kind: 'customer', status: 'new', topic: 'po', receivedAt: hoursAgo(2), company: 'Example Customer Ltd', summary: 'PO-4471 for Q-0320.', refs: { so: '', po: 'PO-4471', quote: 'Q-0320' } },
  { id: 22, kind: 'customer', status: 'new', topic: 'complaint', receivedAt: hoursAgo(1), company: 'Second Example Ltd', summary: 'Brackets arrived bent.', jobId: 44, refs: { so: '9782', po: '', quote: '' } },
  { id: 23, kind: 'customer', status: 'ignored', topic: 'complaint', receivedAt: hoursAgo(1), company: 'Done Example Ltd' },   // done: not a pick
  { id: 24, kind: 'customer', status: 'new', topic: 'delivery', receivedAt: hoursAgo(50), company: 'Example Customer Ltd' },  // not a pick
  { id: 25, kind: 'enquiry', status: 'new', topic: 'complaint', receivedAt: hoursAgo(1), company: 'Newco Example Ltd' }];      // an enquiry stays an enquiry
const withMail = digestPicks({ ...all, role: 'office', enquiries: [...enquiries, ...emails], soOf: id => id === 44 ? 'SO-1001' : '' });
assert.deepEqual(withMail.map(p => [p.kind, p.id]), [['email', '22'], ['email', '21'], ['enquiry', '2']]);
assert.equal(withMail[0].title, 'Complaint from Second Example Ltd about SO-1001', 'the linked order\'s own number');
assert.equal(withMail[0].open.attrs, 'data-tab="customers" data-goenq data-goenqid="22"');
assert.deepEqual(withMail[0].facts, { from: 'Second Example Ltd', topic: 'complaint', said: 'Brackets arrived bent.', order: 'SO-1001', waitingHours: 1 });
assert.equal(withMail[1].title, 'PO received from Example Customer Ltd for Q-0320');
assert.equal(fallbackLine(withMail[0]), 'A customer says something went wrong: sort it today, before it costs the next order.');
assert.equal(fallbackLine(withMail[1]), 'An order has come in: book it in today.');
// The question comes after an enquiry waiting, before tasks and quotes.
const q = digestPicks({ ...all, role: 'office', enquiries: [...enquiries, emails[0]] });
assert.deepEqual(q.map(p => [p.kind, p.id]), [['enquiry', '2'], ['email', '20'], ['task', '9']]);
assert.equal(q[1].title, 'Sample Works Ltd asked about Q-0312');
assert.equal(q[1].facts.said, 'Does the [price] price include folding?', 'no money in Mandy\'s facts');
assert.equal(digestPicks({ ...all, role: 'md', enquiries: [emails[0]] })[0].facts.said, 'Does the £1,250 price include folding?', 'Levi may see it');
assert.equal(fallbackLine(q[1]), 'A customer is asking about a quote: a quick answer often wins it.');
assert.equal(noMoney('a £2,400.50 order, 300 pounds, GBP 40, £2k, 12 brackets'), 'a [price] order, [price], [price], [price], 12 brackets');
// With no customer emails, the picks are as they were.
assert.deepEqual(digestPicks({ ...all, role: 'office', enquiries: [...enquiries, emails[3], emails[4]] }).map(p => [p.kind, p.id]), office.map(p => [p.kind, p.id]));

console.log('digest: ok');
