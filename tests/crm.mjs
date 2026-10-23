import assert from 'node:assert/strict';
import { mailTerms, customerIndex, whoIs, refersToExisting, sortEmail, emailCustomer, plainText, worthReading, enquiryList, enquiryFunnel, taskGroups, reordersDue, couldBuyMore, timeline, trendWords, domainOf, morning } from '../src/core/crm.js';
import { customerBase } from '../src/core/sales.js';

const today = '2026-10-21';
const ago = d => new Date(Date.parse(today + 'T12:00:00Z') - d * 864e5).toISOString().slice(0, 10);

assert.equal(domainOf('Sam@Example.CO.UK'), 'example.co.uk');
assert.deepEqual(mailTerms(['sam@example.co.uk, jo@example.co.uk', 'bob@gmail.com', 'me@clarke-lane.co.uk', 'nonsense'], 'clarke-lane.co.uk'), ['example.co.uk', 'bob@gmail.com']);

const idx = customerIndex([{ key: 'example', customer: 'Example Ltd', email: 'sam@example.co.uk' }, { key: 'solo', customer: 'Solo Trader', email: 'solo@gmail.com' }]);
assert.equal(whoIs(idx, 'new.person@example.co.uk').customer, 'Example Ltd', 'same company domain');
assert.equal(whoIs(idx, 'SOLO@gmail.com').customer, 'Solo Trader');
assert.equal(whoIs(idx, 'other@gmail.com'), null, 'never by a webmail domain');
const idxDom = customerIndex([{ key: 'a', customer: 'A Ltd', email: 'a@btopenworld.com' }, { key: 'b', customer: 'B Ltd', email: 'b@group.example' }, { key: 'c', customer: 'C Ltd', email: 'c@group.example' },
  { key: 'us', customer: 'Clarke staff', email: 'mandy@clarke-lane.co.uk' }], 'clarke-lane.co.uk');
assert.equal(whoIs(idxDom, 'bob@btopenworld.com'), null, 'an ISP mailbox is not a company');
assert.equal(whoIs(idxDom, 'new@group.example'), null, 'a domain two customers share is not guessed');
assert.equal(whoIs(idxDom, 'c@group.example').customer, 'C Ltd', 'their own address still is');
assert.equal(whoIs(idxDom, 'levi@clarke-lane.co.uk'), null, 'a colleague is never a customer');

assert.equal(plainText('<p>Hi&nbsp;there</p><style>x{}</style><div>Need 40 brackets</div>'), 'Hi there\n Need 40 brackets');
const chain = 'Please quote 10 of the attached.' + ' x'.repeat(120) + '\nFrom: Someone\nSent: Monday\nOld stuff';
assert.ok(!plainText(chain).includes('Old stuff'), 'the earlier thread is cut off');

assert.equal(worthReading({ from: 'buyer@example.co.uk' }, 'clarke-lane.co.uk'), true);
assert.equal(worthReading({ from: 'levi@clarke-lane.co.uk' }, 'clarke-lane.co.uk'), false);
assert.equal(worthReading({ from: 'noreply@xero.com' }, 'clarke-lane.co.uk'), false);

const now = '2026-10-21T12:00:00Z';
const enq = [{ id: 1, kind: 'enquiry', status: 'new', receivedAt: '2026-10-21T09:00:00Z' }, { id: 2, kind: 'enquiry', status: 'new', receivedAt: '2026-10-20T09:00:00Z' },
  { id: 3, kind: 'enquiry', status: 'won', receivedAt: '2026-10-10T09:00:00Z' }, { id: 4, kind: 'other', status: 'ignored', receivedAt: '2026-10-19T09:00:00Z' }, { id: 5, kind: null, status: 'new', receivedAt: '2026-10-21T10:00:00Z' }];
assert.deepEqual(enquiryList(enq, now).map(e => e.id), [2, 1, 4, 3], 'new first, longest waiting first; unread rows left out');
assert.equal(enquiryList(enq, now)[0].waitHours, 27);
assert.deepEqual(enquiryFunnel(enq, today), { received: 3, answered: 1, quoted: 1, won: 1, waiting: 2 });

const tasks = [{ id: 1, title: 'a', dueOn: ago(2), assignedTo: 'levi', doneAt: null }, { id: 2, title: 'b', dueOn: today, assignedTo: 'mandy', doneAt: null },
  { id: 3, title: 'c', dueOn: ago(-3), assignedTo: 'levi', doneAt: null }, { id: 4, title: 'd', dueOn: ago(-30), assignedTo: 'levi', doneAt: null }, { id: 5, title: 'e', dueOn: ago(1), assignedTo: 'levi', doneAt: '2026-10-20' }];
const g = taskGroups(tasks, today, 'levi');
assert.deepEqual([g.overdue, g.today, g.soon, g.later].map(x => x.map(t => t.id)), [[1], [], [3], [4]]);
assert.equal(taskGroups(tasks, today).today.length, 1);

// Reorders: brackets every ~21 days, last 35 days ago (due); covers once 200 days ago (stopped); boxes every 30 days, last 10 (not due).
const inv = [];
for (let k = 0; k < 5; k++) inv.push({ customer: 'Example Ltd', contactId: 'c1', date: ago(35 + k * 21), net: 500, lines: [{ description: 'Bracket BRK-1', qty: 10, amount: 500 }] });
for (let k = 0; k < 3; k++) inv.push({ customer: 'Example Ltd', contactId: 'c1', date: ago(10 + k * 30), net: 300, lines: [{ description: 'Laser cut box 2mm, folded', qty: 2, amount: 300 }] });
for (let k = 0; k < 3; k++) inv.push({ customer: 'Other Ltd', contactId: 'c2', date: ago(200 + k * 14), net: 100, lines: [{ description: 'Cover', qty: 1, amount: 100 }] });
const base = customerBase(inv, today);
const due = reordersDue(base, today);
assert.deepEqual(due.map(d => [d.customer, d.item, d.every]), [['Example Ltd', 'Bracket BRK-1', 21]]);

const more = couldBuyMore(base, [{ customer: 'Example Ltd', procs: { Laser: {}, Fold: {} } }]);
assert.equal(more.length, 1);
assert.deepEqual(more[0].missing, ['powder coating', 'welding']);
assert.equal(couldBuyMore(base, []).find(x => x.customer === 'Other Ltd'), undefined, 'too few orders, and nothing to tell from "Cover"');

const tl = timeline({ key: 'example ltd'.replace(/ ltd$/, ''), jobs: [], invoices: inv, quotes: [], actions: [], tasks: [], enquiries: [] });
assert.ok(tl.length >= 0);
const key = base.find(c => c.customer === 'Example Ltd').key;
const t2 = timeline({ key, jobs: [{ customer: 'Example Ltd', so: 'SO-1', ordered: ago(1), id: 9 }], invoices: inv, actions: [{ customer: 'Example Ltd', kind: 'call', note: 'Rang Sam', at: today + 'T09:00:00Z', id: 1 }] });
assert.equal(t2[0].kind, 'call'); assert.equal(t2[1].kind, 'order');

assert.equal(trendWords({ yearNet: 1200, prevNet: 1000 }), 'growing on the year before');
assert.equal(trendWords({ yearNet: 0, prevNet: 1000 }), 'nothing in the last year');
// morning: the counts on Home's tiles (Mandy's two panels, Levi's Sales this week).
const tg = { overdue: [1], today: [1, 2], soon: [], later: [] };
assert.deepEqual(morning({ enquiries: [{ kind: 'enquiry', status: 'new' }, { kind: 'enquiry', status: 'answered' }, { kind: 'mail', status: 'new' }], tasks: tg, chase: [1, 2], won: 3, noDrawing: [1], noContact: [1, 2] }),
  { enquiries: 1, overdueTasks: 1, todayTasks: 2, chase: 2, reorders: 0, quiet: 0, won: 3, noDrawing: 1, noContact: 2 });
assert.equal(morning({ tasks: tg }).won, null, 'won quotes not read yet');
console.log('crm: ok');

// Sorting: a known customer writing about something that exists already is not a new enquiry.
assert.ok(refersToExisting('Quantity change to 16 washers (previously 8), amended PO to follow'));
assert.ok(refersToExisting('Does the quoted price for the profile parts (SO2778) include folding?'));
assert.ok(refersToExisting('Our PO-P31734 is attached'));
assert.ok(!refersToExisting('Could you quote for 50 brackets, 3mm mild steel, drawing attached?'));
assert.equal(sortEmail('enquiry', { known: true, text: 'amended PO to follow' }), 'customer');
assert.equal(sortEmail('enquiry', { known: false, text: 'amended PO to follow' }), 'enquiry', 'a stranger is never re-sorted');
assert.equal(sortEmail('enquiry', { known: true, text: 'quote for 50 brackets please' }), 'enquiry', 'a known customer asking for new work');
assert.equal(sortEmail('other', { known: true, text: 'SO-1234' }), 'other');
const idx2 = customerIndex([{ key: 'sampleworks', customer: 'Sample Works Ltd', email: 'buyer@sampleworks.example' }]);
const names = new Map([['sampleworks', 'Sample Works Ltd'], ['exampleracers', 'Example Racers Ltd']]);
assert.equal(emailCustomer(idx2, 'jo@sampleworks.example', '', names), 'sampleworks', 'by domain');
assert.equal(emailCustomer(idx2, 'kim@gmail.com', 'Example Racers Limited', names), 'exampleracers', 'by the company name the AI read');
assert.equal(emailCustomer(idx2, 'kim@gmail.com', 'Nobody Ltd', names), '');
console.log('crm sorting: ok');

// Quote turnaround (25 Oct): enquiry in to quote out.
{
  const { quoteTurnaround } = await import('../src/core/crm.js');
  const at = '2026-10-21T12:00:00Z', h = n => new Date(Date.parse(at) - n * 36e5).toISOString();
  const quotes = [{ spId: 1, quoteNo: 'Q-1', customer: 'Alpha Ltd', quoteDate: '2026-10-20' }, { spId: 2, quoteNo: 'Q-2', customer: 'Beta Ltd', quoteDate: '2026-10-15' }, { spId: 3, quoteNo: 'Q-3', customer: 'Beta Ltd', quoteDate: '2026-09-01' }];
  const enq = [
    { id: 1, kind: 'enquiry', status: 'won', receivedAt: h(40), company: 'Alpha Ltd', quoteSpId: 1 },                                   // linked: received 19 Oct 20:00, quote dated 20 Oct (5pm) → 21 hours
    { id: 2, kind: 'enquiry', status: 'quoted', receivedAt: h(100), handledAt: h(70), company: 'Gamma Ltd' },                           // marked Quoted 30 hours later
    { id: 3, kind: 'enquiry', status: 'replied', receivedAt: '2026-10-13T09:00:00Z', company: 'Beta Ltd', customerKey: 'beta' },        // matched to Q-2 (15 Oct 5pm, 56 hours), not the old Q-3
    { id: 4, kind: 'enquiry', status: 'replied', receivedAt: h(80), company: 'Delta Ltd' },                                             // answered, no quote after 80 hours
    { id: 5, kind: 'enquiry', status: 'new', receivedAt: h(50), company: 'Epsilon Ltd' },                                               // not even answered, 50 hours
    { id: 6, kind: 'enquiry', status: 'new', receivedAt: h(10), company: 'Fresh Ltd' },                                                 // 10 hours: too soon to worry
    { id: 7, kind: 'enquiry', status: 'ignored', receivedAt: h(300), company: 'Spam' }, { id: 8, kind: 'customer', status: 'new', receivedAt: h(300) },
    { id: 9, kind: 'enquiry', status: 'quoted', receivedAt: h(24 * 100), handledAt: h(24 * 99), company: 'Old Ltd' }];                // over 90 days ago: out of the window
  const tr = quoteTurnaround(enq, quotes, at);
  assert.deepEqual(tr.list.map(q => [q.id, q.hours, q.how, q.quoteNo]), [[1, 21, 'linked', 'Q-1'], [2, 30, 'marked', ''], [3, 56, 'matched', 'Q-2']]);
  assert.deepEqual([tr.quoted, tr.medianHours, tr.within24, tr.within48, tr.overWeek], [3, 30, 1, 2, 0]);
  assert.deepEqual(tr.waiting.map(w => [w.id, w.hours, w.replied]), [[4, 80, true], [5, 50, false]], 'past 48 hours with no quote, longest first');
  assert.equal(quoteTurnaround([], [], at).medianHours, null);
  console.log('crm turnaround: ok');
}
