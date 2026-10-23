import assert from 'node:assert/strict';
import { winStats, chanceAt, customerFactor, pipeline, chaseList, monthGap, customerBase, quietCustomers, customerFacts, quoteChaseEmail, GENERAL_CURVE, quoteValue } from '../src/core/sales.js';

const today = '2026-10-20';
const ago = d => new Date(Date.parse(today + 'T12:00:00Z') - d * 864e5).toISOString().slice(0, 10);
let id = 1;
const q = (customer, daysAgo, value, won = null, extra = {}) => ({ spId: id++, quoteNo: 'Q-' + id, customer, status: won != null ? 'Ordered' : 'Quote', contactName: 'Sam Buyer', contactEmail: 's@example.com',
  quoteDate: ago(daysAgo), wonDate: won != null ? ago(daysAgo - won) : '', sellTotal: value, carriage: 0, ...extra });

// Too little history: the general curve.
const few = [q('A Ltd', 100, 500, 5), q('B Ltd', 90, 300)];
assert.equal(winStats(few, {}, today).own, false);
assert.deepEqual(winStats(few, {}, today).curve, GENERAL_CURVE);

// Enough history: 20 decided quotes, 8 won (each within 10 days), A Ltd wins most.
const hist = [];
for (let i = 0; i < 8; i++) hist.push(q(i < 6 ? 'A Ltd' : 'B Ltd', 70 + i, 1000, 3 + i));
for (let i = 0; i < 12; i++) hist.push(q(i < 2 ? 'A Ltd' : 'C Ltd', 65 + i, 800));
const st = winStats(hist, {}, today);
assert.equal(st.own, true);
assert.equal(st.decided, 20); assert.equal(st.won, 8); assert.equal(st.rate, 0.4);
assert.equal(st.avgWon, 1000);
assert.equal(st.medianDays, 6.5);
assert.ok(st.curve[0][1] === 0.4, 'at day 0 every quote is still open: 8 of 20');
assert.equal(st.timingUnknown, false);
assert.equal(st.p80Days, 9);
// None of his were ordered after 30 days, but a curve point never falls under half the general curve (0.12 / 2).
assert.equal(st.curve.find(([a]) => a === 30)[1], 0.06, 'half the general curve at 30 days');
for (const [a, p] of st.curve) assert.ok(p >= GENERAL_CURVE.find(([x]) => x === a)[1] / 2, `day ${a} not under half the general curve`);
assert.ok(customerFactor(st, 'A Ltd') > 1.5 && customerFactor(st, 'C Ltd') < 0.6);
assert.equal(chanceAt([[0, 0.4], [10, 0.2]], 5), 0.30000000000000004);


// No real ordered dates (Philip, 21 Oct): every won quote's date is its quote date (SharePoint's last change),
// so the timing is unknown; the win rate is still his, the timing is the general curve, and nothing is dead before 60 days.
const flat = [];
for (let i = 0; i < 8; i++) flat.push(q(i < 6 ? 'A Ltd' : 'B Ltd', 70 + i, 1000, 0));
for (let i = 0; i < 12; i++) flat.push(q(i < 2 ? 'A Ltd' : 'C Ltd', 65 + i, 800));
const fs = winStats(flat, {}, today);
assert.equal(fs.own, true); assert.equal(fs.timingUnknown, true);
assert.equal(fs.rate, 0.4, 'his own win rate still counts');
assert.equal(fs.medianDays, null); assert.equal(fs.p80Days, null);
assert.deepEqual(fs.curve, GENERAL_CURVE);
assert.ok(Math.abs(chanceAt(fs.curve, 7) - 0.3) < 1e-9, 'a week-old quote is about 30% before the customer factor, not 1%');
const week = q('D Ltd', 7, 1000), fp = pipeline([...flat, week, q('C Ltd', 50, 500)], {}, [], fs, today);
assert.ok(Math.abs(fp.find(x => x.spId === week.spId).chance - 0.3) < 1e-9, 'a new customer at 7 days: 30%, not 1-3%');
assert.equal(fp.find(x => x.age === 50).stage, 'cold', 'not dead before the 60-day default');
assert.equal(pipeline([q('C Ltd', 61, 500)], {}, [], fs, today)[0].stage, 'dead', 'dead after 60 days');
// Fewer than 5 won quotes with real timing is not enough either.
const thin = flat.map((x, i) => i < 3 ? { ...x, wonDate: ago(70 + i - 5) } : x);
assert.equal(winStats(thin, {}, today).timingUnknown, true);

// The pipeline: stages and order.
const open = [q('A Ltd', 2, 2000), q('C Ltd', 12, 5000), q('A Ltd', 20, 1000), q('C Ltd', 200, 9000)];
const follow = { [open[2].spId]: { state: 'open', nextOn: ago(1) } };
const p = pipeline([...hist, ...open], follow, [], st, today);
const by = Object.fromEntries(p.map(x => [x.spId, x]));
assert.equal(by[open[0].spId].stage, 'fresh');
assert.equal(by[open[2].spId].stage, 'due');
assert.equal(by[open[3].spId].stage, 'dead');
assert.ok(!p.some(x => x.status === 'Ordered'), 'won quotes are not open');
assert.equal(chaseList(p)[0].spId, open[2].spId, 'due follow-ups first');
const lostFollow = { [open[1].spId]: { state: 'lost', lostReason: 'Price' } };
assert.ok(!pipeline(open, lostFollow, [], st, today).some(x => x.spId === open[1].spId));
// A chase in the last week books it.
assert.equal(pipeline([open[1]], {}, [{ spId: open[1].spId, kind: 'email', at: ago(2) + 'T09:00:00Z' }], st, today)[0].stage, 'booked');

// The month.
const jobs = [{ status: 'open', ordered: '2026-10-05', v: 3000 }, { status: 'cancelled', ordered: '2026-10-06', v: 900 }, { status: 'open', ordered: '2026-09-30', v: 700 }];
const mg = monthGap({ target: 10000, jobs, quotes: [q('A Ltd', 10, 500, 2)], open: p, stats: st, today, jobValue: j => j.v });
assert.equal(monthGap({ target: 10000, jobs, quotes: [q('A Ltd', 10, 500, 2), q('B Ltd', 10, 700, 2, { dismissed: true })], open: p, stats: st, today, jobValue: j => j.v }).booked, mg.booked, 'a dismissed "Ordered" quote is not booked');
assert.equal(mg.booked, 3500);
assert.equal(mg.gap, 6500);
assert.ok(mg.likely > 0 && mg.afterLikely === Math.round((6500 - mg.likely) * 100) / 100);
assert.equal(mg.perQuote, 400);
assert.equal(mg.quotesNeeded, Math.ceil(mg.afterLikely / 400));
assert.equal(monthGap({ target: null, jobs, quotes: [], open: [], stats: st, today, jobValue: j => j.v }).gap, null);

// The customer base.
const inv = [];
for (let m = 0; m < 6; m++) inv.push({ contactId: 'c1', customer: 'Regular Ltd', date: ago(120 + m * 21), net: 1000, lines: [{ description: 'Bracket BRK-1', qty: 10, amount: 1000 }, { description: 'Carriage', qty: 1, amount: 20 }] });
inv.push({ contactId: 'c2', customer: 'Steady Ltd', date: ago(10), net: 500, lines: [] }, { contactId: 'c2', customer: 'Steady Ltd', date: ago(40), net: 500, lines: [] }, { contactId: 'c2', customer: 'Steady Ltd', date: ago(70), net: 500, lines: [] });
inv.push({ contactId: 'c3', customer: 'Gone Ltd', date: ago(400), net: 2000, lines: [] }, { contactId: 'c3', customer: 'Gone Ltd', date: ago(300), net: 2000, lines: [] });
const base = customerBase(inv, today);
const reg = base.find(c => c.customer === 'Regular Ltd');
assert.equal(reg.orders, 6); assert.equal(reg.usual, 21); assert.equal(reg.since, 120); assert.equal(reg.quiet, true);
assert.deepEqual(reg.items.map(i => i.item), ['Bracket BRK-1'], 'carriage is not something they buy');
assert.equal(base.find(c => c.customer === 'Steady Ltd').quiet, false);
assert.equal(base.find(c => c.customer === 'Gone Ltd').lapsed, true);
assert.deepEqual(quietCustomers(base).map(c => c.customer), ['Regular Ltd', 'Gone Ltd']);

const facts = customerFacts(reg, { person: 'Sam Buyer', from: 'Levi', angle: 'We have laser capacity next week' });
assert.equal(facts.contactFirstName, 'Sam');
assert.ok(!JSON.stringify(facts).match(/1000|yearNet|worth/), 'no money in the facts');
assert.equal(facts.angleFromLevi, 'We have laser capacity next week');

const e = quoteChaseEmail(open[1], 'Levi');
assert.ok(e.subject.includes(open[1].quoteNo) && e.html.includes('Hi Sam') && e.html.includes('Levi'));
assert.equal(quoteValue({ sellTotal: 100.1, carriage: 20.2 }), 120.3);
console.log('sales: ok');

// Price review and spending less than last year (25 Oct).
{
  const { priceReview, spendChanges, PRICE_REVIEWED } = await import('../src/core/sales.js');
  const inv = (customer, date, item, qty, amount, code = '') => ({ contactId: 'c', customer, date, net: amount, lines: [{ description: item, code, qty, amount }] });
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(inv('Flat Ltd', ago(30 + i * 90), 'Bracket', 10, 124));                 // £12.40 each for 480 days
  for (let i = 0; i < 6; i++) rows.push(inv('Moved Ltd', ago(30 + i * 90), 'Plate', 10, i < 4 ? 150 : 120));    // put up to £15 ten months ago
  rows.push(inv('Flat Ltd', ago(10), 'Carriage', 1, 15), inv('Once Ltd', ago(500), 'Hopper', 1, 900), inv('Once Ltd', ago(20), 'Hopper', 1, 900));
  const base = customerBase(rows, today), pr = priceReview(base, [], today);
  assert.deepEqual(pr.map(p => [p.customer, p.item, p.price, p.times]), [['Flat Ltd', 'Bracket', 12.4, 6]], 'Moved Ltd changed its price this year; carriage and a part sold twice are left out');
  assert.deepEqual([pr[0].since, pr[0].days, pr[0].yearValue, pr[0].yearQty, pr[0].uplift], [ago(480), 480, 496, 40, 24.8], 'four of the six invoices fall in the last 12 months');
  assert.equal(priceReview(base, [{ customer: 'Flat Ltd', kind: 'note', note: PRICE_REVIEWED + 'Bracket', at: ago(3) + 'T10:00:00Z' }], today).length, 0, 'reviewed: off the list');
  assert.equal(priceReview(base, [{ customer: 'Flat Ltd', kind: 'note', note: PRICE_REVIEWED + 'Bracket', at: ago(400) + 'T10:00:00Z' }], today).length, 1, 'a review over a year ago no longer counts');
  assert.equal(priceReview(base, [], today, { staleDays: 200 }).length, 2, 'with a shorter yardstick Moved Ltd (ten months) shows too');

  const sp = [];
  for (let i = 0; i < 12; i++) sp.push(inv('Down Ltd', ago(20 + i * 30), 'Panel', 1, 600), inv('Down Ltd', ago(380 + i * 30), 'Panel', 1, 1800));
  for (let i = 0; i < 12; i++) sp.push(inv('Up Ltd', ago(20 + i * 30), 'Lid', 1, 900), inv('Up Ltd', ago(380 + i * 30), 'Lid', 1, 500));
  for (let i = 0; i < 4; i++) sp.push(inv('Small Ltd', ago(20 + i * 30), 'Clip', 1, 100), inv('Small Ltd', ago(380 + i * 30), 'Clip', 1, 200));   // under £1,000 before: too small to call
  for (let i = 0; i < 6; i++) sp.push(inv('Gone Ltd', ago(200 + i * 30), 'Tray', 1, 300), inv('Gone Ltd', ago(400 + i * 30), 'Tray', 1, 900));   // lapsed: on the get-back-in-touch list, not here
  const s = spendChanges(customerBase(sp, today), today, ago(720));
  assert.deepEqual(s.down.map(r => [r.customer, r.yearNet, r.prevNet, r.change, r.pct]), [['Down Ltd', 7200, 21600, -14400, -67]]);
  assert.deepEqual(s.up.map(r => [r.customer, r.change]), [['Up Ltd', 4800]]);
  assert.equal(s.partial, false);
  assert.equal(spendChanges(customerBase(sp, today), today, ago(500)).partial, true, 'under two years of invoices: say so');
  console.log('sales prices and spend: ok');
}

// The AI follow-up on a quote (25 Oct): what it may know, and what it may not (the price).
{
  const { quoteChaseFacts } = await import('../src/core/sales.js');
  const q = { spId: 7, quoteNo: 'Q-0320', customer: 'Example Customer Ltd', contactName: 'Sam Buyer', quoteDate: ago(12), age: 12 };
  const lines = [{ lineNo: 1, qty: 10, sellTotal: 290.25, desc: 'Valve guard', thickness: 2, material: 'Zintec' }, { lineNo: 2, qty: 4, sellTotal: 80, desc: 'Cover plate', thickness: '', material: '' }];
  const actions = [{ spId: 7, kind: 'email', at: ago(5) + 'T10:00:00Z' }, { spId: 7, kind: 'call', at: ago(3) + 'T10:00:00Z' }, { spId: 8, kind: 'email', at: ago(1) + 'T10:00:00Z' }];
  const f = quoteChaseFacts(q, { lines, actions, customer: { orders: 5, last: ago(40) }, question: 'Does the price include folding?', angle: 'we could fit it in next week', from: 'Levi', today });
  assert.deepEqual(f.whatWasQuoted, ['10 × Valve guard 2mm Zintec', '4 × Cover plate']);
  assert.deepEqual([f.followUpsSoFar, f.lastFollowUp, f.callsSoFar, f.regularCustomer, f.contactFirstName, f.daysSinceQuote], [1, ago(5), 1, true, 'Sam', 12], 'only this quote\'s chases count');
  assert.ok(!JSON.stringify(f).includes('290') && !JSON.stringify(f).includes('sellTotal'), 'no price goes to the AI');
  assert.equal(quoteChaseFacts(q, { from: 'Levi' }).regularCustomer, false);
  console.log('sales quote chase facts: ok');
}
