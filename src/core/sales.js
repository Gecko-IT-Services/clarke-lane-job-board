/**
 * Sales (Levi, 20 Oct): his open quotes to follow up, what his own quote history says about winning, the gap
 * to his monthly target, and the customers who have gone quiet. Every number comes from his data (the quote
 * calculator, the board's orders, Xero's invoices); when there is too little history the board says so and
 * uses a cautious general curve. Pure: no window. Tested in tests/sales.mjs.
 * quote: { spId, quoteNo, customer, status, contactName, contactEmail, quoteDate, wonDate, sellTotal, carriage }
 * follow: { [spId]: { state: 'open'|'lost', lostReason, nextOn, note } }   actions: [{ spId, kind, at, note }]
 */
import { normName } from './xero.js';

const dayNo = s => Math.round(Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') / 864e5);
const r2 = n => (n < 0 ? -1 : 1) * Math.round(Math.round(Math.abs(n) * 1e8) / 1e6) / 100;   // to the penny, half up, after flattening float noise (7 × 0.145 is 1.0149999…)
const median = xs => { const a = [...xs].sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const pct = (xs, p) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };

export const quoteValue = q => r2((Number(q.sellTotal) || 0) + (Number(q.carriage) || 0));
const LOST_STATUS = /lost|declin|reject|cancel|dead|no ?go/i;
export const isWon = q => q.status === 'Ordered';
const lostByStatus = q => !isWon(q) && LOST_STATUS.test(q.status || '');

/** A cautious general curve (share of quotes still open at that age that are later ordered), used until Levi's own history is big enough. */
export const GENERAL_CURVE = [[0, 0.35], [7, 0.3], [14, 0.22], [30, 0.12], [60, 0.05], [90, 0.02]];
export const MIN_HISTORY = 15;   // decided quotes before his own figures are trusted
const DECIDED_AFTER = 60;        // a quote not ordered after 60 days counts as not won, for the history

/**
 * What his quote history says. Quotes dated in the last `months`; a quote counts once it is won, marked lost,
 * or older than 60 days. Returns win rates (by count and value), how long won quotes take, the chance a quote
 * still open at each age is ordered later (curve), and per-customer win rates. timingUnknown: there is enough
 * history but no real ordered dates, so the rates are his and the timing is the general curve.
 */
export function winStats(quotes, follow, today, months = 12) {
  const from = dayNo(today) - Math.round(months * 30.44), t = dayNo(today);
  const lost = q => lostByStatus(q) || follow?.[q.spId]?.state === 'lost';
  const decided = quotes.filter(q => q.quoteDate && dayNo(q.quoteDate) >= from && (isWon(q) || lost(q) || t - dayNo(q.quoteDate) >= DECIDED_AFTER));
  const won = decided.filter(isWon);
  const days = won.map(q => Math.max(0, dayNo(q.wonDate || q.quoteDate) - dayNo(q.quoteDate)));
  const own = decided.length >= MIN_HISTORY;
  // Is the timing usable? The quote calculator has no ordered date, so a won quote's date falls back to when the
  // SharePoint item was last changed, which for most is the day it was quoted. Then every won quote looks ordered
  // on day 0, nothing still open after a week ever looks won, and the curve said 1% for everything (Philip, 21 Oct:
  // "every open quote shows 1-3%"). With no real timing, his own win RATE still counts but the timing is general.
  const p80 = pct(days, 0.8), timingUnknown = own && (p80 == null || p80 <= 1 || days.filter(d => d > 0).length < 5);
  const general = a => GENERAL_CURVE.find(([x]) => x === a)[1];
  const curve = own && !timingUnknown ? GENERAL_CURVE.map(([a]) => {
    const still = decided.filter(q => (isWon(q) ? dayNo(q.wonDate || q.quoteDate) - dayNo(q.quoteDate) > a : t - dayNo(q.quoteDate) > a));
    const later = still.filter(isWon).length;
    // Never under half the general curve: a thin history must not declare every older quote dead.
    return [a, Math.max(0.01, general(a) / 2, still.length ? later / still.length : 0)];
  }) : GENERAL_CURVE;
  const byCust = new Map();
  for (const q of decided) { const k = normName(q.customer); const c = byCust.get(k) || { customer: q.customer, decided: 0, won: 0, wonValue: 0 }; c.decided++; if (isWon(q)) { c.won++; c.wonValue = r2(c.wonValue + quoteValue(q)); } byCust.set(k, c); }
  const sum = xs => r2(xs.reduce((a, q) => a + quoteValue(q), 0));
  const rate = decided.length ? won.length / decided.length : null;
  return { own, timingUnknown, decided: decided.length, won: won.length, rate, rateValue: sum(decided) ? sum(won) / sum(decided) : null,
    avgWon: won.length ? r2(sum(won) / won.length) : null, medianDays: timingUnknown ? null : median(days), p80Days: timingUnknown ? null : p80, curve, byCustomer: byCust };
}

/** Chance from the curve for a quote this many days old (straight line between the points). */
export function chanceAt(curve, age) {
  if (age <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) if (age <= curve[i][0]) {
    const [a0, p0] = curve[i - 1], [a1, p1] = curve[i]; return p0 + (p1 - p0) * (age - a0) / (a1 - a0);
  }
  return curve.at(-1)[1];
}
/** This customer's win rate against the overall one, smoothed so two quotes do not swing it. */
export function customerFactor(stats, customer) {
  if (!stats.rate) return 1;
  const c = stats.byCustomer.get(normName(customer)); if (!c) return 1;
  const k = 3, smoothed = (c.won + k * stats.rate) / (c.decided + k);
  return Math.min(2.5, Math.max(0.3, smoothed / stats.rate));
}

/**
 * Every open quote with its stage, chance and likely value. Stages: 'due' (follow-up date reached), 'booked'
 * (a follow-up date ahead), 'fresh' (under a week), 'follow' (worth chasing now), 'cold', 'dead'. Lost and won
 * quotes are not open. deadAfter: days after which almost none of his quotes are ordered.
 */
export function pipeline(quotes, follow, actions, stats, today) {
  const t = dayNo(today);
  const deadAfter = stats.own && !stats.timingUnknown && stats.p80Days != null ? Math.max(45, Math.round(stats.p80Days * 1.5)) : 60;
  const last = new Map();
  for (const a of actions || []) { const p = last.get(a.spId); if (!p || a.at > p.at) last.set(a.spId, a); }
  return quotes.filter(q => !isWon(q) && !lostByStatus(q) && follow?.[q.spId]?.state !== 'lost').map(q => {
    const age = q.quoteDate ? Math.max(0, t - dayNo(q.quoteDate)) : 0, f = follow?.[q.spId] || {}, la = last.get(q.spId) || null;
    const chance = Math.min(0.9, chanceAt(stats.curve, age) * customerFactor(stats, q.customer));
    const sinceTouch = la ? t - dayNo(la.at) : null;
    const stage = f.nextOn && f.nextOn <= today ? 'due' : f.nextOn ? 'booked' : age >= deadAfter ? 'dead' : age < 7 ? 'fresh'
      : sinceTouch != null && sinceTouch < 7 ? 'booked' : age >= deadAfter * 0.6 ? 'cold' : 'follow';
    return { ...q, value: quoteValue(q), age, chance, likely: r2(quoteValue(q) * chance), stage, nextOn: f.nextOn || null, note: f.note || '', lastAction: la, sinceTouch };
  }).sort((a, b) => b.likely - a.likely || a.age - b.age);
}
export const STAGES = { due: 'Follow-up due', follow: 'Follow up now', fresh: 'Fresh', booked: 'Follow-up booked', cold: 'Going cold', dead: 'Likely dead' };

/** Chase these today: due follow-ups first, then quotes worth chasing, by likely value. */
export const chaseList = (open, n = 8) => [...open.filter(q => q.stage === 'due'), ...open.filter(q => q.stage === 'follow' || q.stage === 'cold')].slice(0, n);

/**
 * The month against Levi's target: orders booked this month (the board's sales orders by order date, plus
 * quotes marked Ordered this month that are not orders yet), the gap, what the open quotes are likely to bring,
 * and how many more quotes that gap means at his win rate and average order.
 */
export function monthGap({ target, jobs, quotes, open, stats, today, jobValue }) {
  const m = today.slice(0, 7);
  const booked = r2((jobs || []).filter(j => j.status !== 'cancelled' && !j.preview && (j.ordered || '').slice(0, 7) === m).reduce((a, j) => a + (jobValue(j) || 0), 0)
    + (quotes || []).filter(q => isWon(q) && (q.wonDate || '').slice(0, 7) === m && !q.jobId && !q.dismissed).reduce((a, q) => a + quoteValue(q), 0));   // a job's own value is counted above; a dismissed quote was never an order
  const likely = r2((open || []).filter(q => q.stage !== 'dead').reduce((a, q) => a + q.likely, 0));
  const gap = target ? r2(Math.max(0, target - booked)) : null;
  const perQuote = stats.rate && stats.avgWon ? stats.rate * stats.avgWon : null;
  const afterLikely = gap != null ? r2(Math.max(0, gap - likely)) : null;
  return { target: target || null, booked, gap, likely, afterLikely, quotesNeeded: afterLikely && perQuote ? Math.ceil(afterLikely / perQuote) : afterLikely === 0 ? 0 : null, perQuote: perQuote ? r2(perQuote) : null };
}

/**
 * The customer base from invoices (Xero, plus any history passed in the same shape): per customer how much they
 * spend, how often they order, when they last did, what they buy, and whether they have gone quiet.
 * invoices: [{ contactId, customer, date, net, lines: [{ description, code, qty, amount }] }]. Credit notes are negative.
 */
export function customerBase(invoices, today) {
  const t = dayNo(today), by = new Map();
  for (const x of invoices || []) {
    if (!x.date || !x.customer) continue;
    const k = normName(x.customer), c = by.get(k) || { key: k, customer: x.customer, contactId: x.contactId || '', invoices: [], items: new Map() };
    c.invoices.push(x);
    for (const l of x.lines || []) {
      const name = String(l.description || '').split('\n')[0].trim(); if (!name || /^(carriage|delivery|postage)/i.test(name)) continue;
      const ik = name.toLowerCase(), it = c.items.get(ik) || { item: name, code: l.code || '', times: 0, qty: 0, last: '', dates: [] };
      it.times++; it.qty += Number(l.qty) || 0; if (x.date > it.last) it.last = x.date; it.dates.push(x.date); c.items.set(ik, it);
    }
    by.set(k, c);
  }
  return [...by.values()].map(c => {
    const dates = [...new Set(c.invoices.filter(x => x.net > 0).map(x => x.date))].sort();
    const gaps = dates.slice(1).map((d, i) => dayNo(d) - dayNo(dates[i])).filter(g => g > 0);
    const yearNet = r2(c.invoices.filter(x => t - dayNo(x.date) <= 365).reduce((a, x) => a + (Number(x.net) || 0), 0));
    const prevNet = r2(c.invoices.filter(x => t - dayNo(x.date) > 365 && t - dayNo(x.date) <= 730).reduce((a, x) => a + (Number(x.net) || 0), 0));
    const last = dates.at(-1) || null, since = last ? t - dayNo(last) : null, usual = median(gaps);
    // Quiet: a regular customer (3+ orders) whose silence is well past their usual gap and over 6 weeks.
    const quiet = dates.length >= 3 && usual != null && since > Math.max(42, usual * 2);
    const lapsed = dates.length >= 2 && since > 180;
    const allItems = [...c.items.values()].sort((a, b) => b.times - a.times || b.last.localeCompare(a.last)), items = allItems.slice(0, 6);
    return { key: c.key, customer: c.customer, contactId: c.contactId, orders: dates.length, first: dates[0] || null, last, since, usual: usual == null ? null : Math.round(usual),
      yearNet, prevNet, quiet, lapsed, items, allItems, invoices: c.invoices, worth: r2(Math.max(yearNet, prevNet)) };
  }).sort((a, b) => b.worth - a.worth);
}

/** Who to get back in touch with: quiet regulars and lapsed customers, the most valuable first. */
export const quietCustomers = base => base.filter(c => (c.quiet || c.lapsed) && c.worth > 0).sort((a, b) => b.worth - a.worth);

/**
 * The facts an AI email may use about one customer, and nothing else: names, what they buy and when, how often,
 * open quotes, and Levi's own angle. No prices or totals (a sales email never quotes them unless Levi writes one).
 */
export function customerFacts(c, { person = '', openQuotes = [], angle = '', from, company = 'Clarke Lane Engineering' }) {
  return {
    company, from, customer: c.customer, contactFirstName: String(person || '').split(' ')[0] || '',
    lastOrdered: c.last, usualDaysBetweenOrders: c.usual, ordersOnRecord: c.orders, quietForDays: c.since,
    theyBuy: c.items.map(i => ({ item: i.item, timesOrdered: i.times, lastOrdered: i.last })),
    openQuotes: openQuotes.map(q => ({ quoteNo: q.quoteNo, date: q.quoteDate })),
    whatWeDo: 'Laser cutting, folding, cutting and drilling, tapping and countersinking, inserts, welding, powder coating and painting, plating and anodising (through partners), and rolling, for sheet metal parts and fabrications.',
    angleFromLevi: String(angle || '').slice(0, 600),
  };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** A short, polite chase for one open quote (no AI). */
export function quoteChaseEmail(q, from, company = 'Clarke Lane Engineering Ltd') {
  const first = String(q.contactName || '').split(' ')[0];
  const subject = `Your quote ${q.quoteNo} from ${company.replace(/ Ltd$/, '')}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
<p>${first ? `Hi ${esc(first)},` : 'Hello,'}</p>
<p>I just wanted to follow up on quote <b>${esc(q.quoteNo)}</b>${q.quoteDate ? ` we sent over on ${esc(new Date(q.quoteDate + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }))}` : ''}. Is there anything you'd like us to look at again, such as quantities, material, finish or lead time?</p>
<p>If you're ready to go ahead, just reply to this email with your order number and we'll get it booked in.</p>
<p>Kind regards,<br>${esc(from)}<br>${esc(company)}</p></div>`;
  return { subject, html };
}
/** The AI's { subject, paragraphs } as the email body, signed by the sender. */
export function aiEmailHtml({ paragraphs, greeting }, from, company = 'Clarke Lane Engineering Ltd') {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
<p>${esc(greeting || 'Hello,')}</p>${(paragraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}
<p>Kind regards,<br>${esc(from)}<br>${esc(company)}</p></div>`;
}
