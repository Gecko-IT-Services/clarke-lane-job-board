/**
 * Keith's Accounts page (Philip, 23 Oct): what the board knows that Xero does not, for the accountant only. Draft
 * invoices waiting to be approved with their proof of delivery, the month-end cut-off, purchase orders against the
 * supplier bills (with price differences), and money coming in. Read only. Pure: tested in tests/accounts.mjs.
 */
import { left, round2, despatchValue, dayNo } from './jobs.js';
import { normName, looksSame } from './xero.js';

const plus = (iso, n) => { const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthOf = s => String(s || '').slice(0, 7);
const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
/** Two amounts that are not the same to the penny. */
const offByPennies = (a, b) => Math.abs(round2(a) - round2(b)) >= 0.01;
/** A bill that is not the order's amount: more than £1 and more than 1% apart. */
export const differs = (bill, order) => Math.abs(bill - order) > Math.max(1, Math.abs(order) * 0.01);

/**
 * Draft invoices the board sent to Xero and nobody has approved yet, with what backs them: the delivery note, who
 * signed, and checks against the board. inv: Map(invoice id → { status, number, net, contact, date }).
 * Flags: 'amount' (Xero's net is not the board's for that delivery: changed in Xero since), 'contact' (Xero's
 * customer has no word in common with the order's), 'unsigned' (nobody recorded as signing). Flagged ones first.
 */
export function draftsToApprove(jobs, inv) {
  const rows = [];
  for (const j of jobs || []) for (const d of j.despatches || []) {
    const x = d.xero?.id ? inv?.get(d.xero.id) : null;
    if (!x || !['DRAFT', 'SUBMITTED'].includes(x.status)) continue;
    const boardNet = despatchValue(j, d), flags = [];
    if (x.net != null && boardNet != null && offByPennies(x.net, boardNet)) flags.push('amount');
    if (x.contact && !looksSame(j.customer, x.contact)) flags.push('contact');
    if (!d.receivedBy && !d.deliveryNote) flags.push('unsigned');
    rows.push({ job: j, d, inv: x, boardNet, flags });
  }
  return rows.sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0) || String(a.d.deliveredOn || '').localeCompare(String(b.d.deliveredOn || '')));
}

/**
 * Month-end cut-off, as at today: delivered but not invoiced (the accrual), dispatched and not yet delivered, and the
 * order book still to make, by when it is due (late, the rest of this month, next month, later). Values net, from the
 * board's prices.
 */
export function cutOff(jobs, today) {
  const m = monthOf(today), m2 = nextMonth(m);
  const delivered = [], transit = [], book = { late: 0, thisMonth: 0, nextMonth: 0, later: 0 };
  for (const j of jobs || []) {
    if (j.status === 'cancelled' || j.preview) continue;
    for (const d of j.despatches || []) {
      if (d.xero || d.cancelled) continue;
      (d.deliveredOn ? delivered : transit).push({ job: j, d, value: despatchValue(j, d) || 0 });
    }
    for (const l of j.lines || []) {
      const v = left(j, l) * (l.price || 0); if (!v) continue;
      const k = l.due < today ? 'late' : monthOf(l.due) === m ? 'thisMonth' : monthOf(l.due) === m2 ? 'nextMonth' : 'later';
      book[k] = round2(book[k] + v);
    }
  }
  const sum = list => round2(list.reduce((a, x) => a + x.value, 0));
  delivered.sort((a, b) => String(a.d.deliveredOn).localeCompare(String(b.d.deliveredOn)));
  return { delivered, deliveredTotal: sum(delivered), deliveredThisMonth: sum(delivered.filter(x => monthOf(x.d.deliveredOn) === m)),
    transit, transitTotal: sum(transit), book: { ...book, total: round2(book.late + book.thisMonth + book.nextMonth + book.later) } };
}

/** A customer Xero names as in administration, liquidation and the like (Philip, 24 Oct: "INDO Lighting Ltd - IN
 *  ADMINISTRATION"): money unlikely to come in, kept apart from what can still be chased. */
export const doubtful = name => /\bin (administration|liquidation|receivership)\b|\b(administrators?|liquidators?|receivership|dissolved|insolven(t|cy)|ceased trading)\b/i.test(String(name || ''));

/**
 * Money coming in: unpaid approved invoices (debts route) by when they are due (overdue, the next 7 days, 8–30
 * days, later), and what the order book should invoice in the next 4 weeks. Customers in administration or
 * liquidation are counted apart as doubtful, in none of the other figures. The overdue invoices come oldest first
 * (late) and grouped by customer, most owed first, each with its oldest invoice and the last chase from the board
 * (customers). chases: [{ customer, at, by }].
 */
export function moneyIn(debts, jobs, chases, today) {
  const b = { overdue: 0, week: 0, month: 0, later: 0, doubtful: 0 };
  const late = [], doubt = [];
  const lastChase = name => (chases || []).filter(c => normName(c.customer) === normName(name)).sort((p, q) => String(q.at).localeCompare(String(p.at)))[0] || null;
  for (const x of debts || []) {
    const days = x.due ? dayNo(today) - dayNo(x.due) : null;
    if (doubtful(x.customer)) { b.doubtful = round2(b.doubtful + (x.owed || 0)); doubt.push({ ...x, days }); continue; }
    const k = !x.due || x.due < today ? 'overdue' : dayNo(x.due) - dayNo(today) <= 7 ? 'week' : dayNo(x.due) - dayNo(today) <= 30 ? 'month' : 'later';
    b[k] = round2(b[k] + (x.owed || 0));
    if (k === 'overdue') late.push({ ...x, days, chased: lastChase(x.customer) });
  }
  late.sort((p, q) => String(p.due).localeCompare(String(q.due)));
  const group = list => { const by = new Map();
    for (const x of list) { const k = normName(x.customer), g = by.get(k) || { customer: x.customer, invoices: [], owed: 0, oldest: x.due, days: x.days, chased: x.chased ?? null };
      g.invoices.push(x); g.owed = round2(g.owed + (x.owed || 0)); if (x.due && (!g.oldest || x.due < g.oldest)) { g.oldest = x.due; g.days = x.days; } by.set(k, g); }
    return [...by.values()].sort((p, q) => q.owed - p.owed); };
  const to = plus(today, 28);
  const toInvoice = round2((jobs || []).filter(j => j.status !== 'cancelled' && !j.preview)
    .reduce((a, j) => a + j.lines.filter(l => l.due <= to).reduce((s, l) => s + left(j, l) * (l.price || 0), 0), 0));
  return { ...b, late, customers: group(late), doubtfulCustomers: group(doubt), toInvoice };
}

/** "PO-4338", "4338" or "PO 04338" → "4338"; '' when there is no number. */
export const poNo = s => ((String(s || '').match(/\d{3,}/) || [''])[0]).replace(/^0+/, '');
const numbersIn = s => (String(s || '').match(/\d{3,}/g) || []).map(n => n.replace(/^0+/, ''));
const lineKey = l => (l.code ? 'c:' + l.code.toUpperCase() : 'd:' + String(l.description || '').toLowerCase().replace(/[^a-z0-9]+/g, ''));

/**
 * Purchase orders against supplier bills (Xero's, last 120 days). A bill belongs to an order when it is from the same
 * supplier and its reference or number quotes the order's number; failing that, the one bill from that supplier
 * dated within 60 days of the order for the same amount (marked 'likely'). Each order gets:
 *   flags: 'price' (the bills come to a different amount), 'unit' (a line's unit price differs), 'nobill' (approved,
 *          over 3 weeks old, no bill), 'billednobill' (Xero says billed but no bill quotes it); [] is fine.
 *   diff: bills minus order, net. units: [{ description, qty, order, bill }] for the lines that differ.
 * Draft orders are listed with no flags. extraBills: bills from suppliers with orders here that match no order.
 */
export function matchPurchases(pos, bills, today) {
  const used = new Set(), list = bills || [];
  const rows = (pos || []).map(po => {
    const n = poNo(po.number);
    const hit = n ? list.filter(b => b.supplierId === po.supplierId && numbersIn(`${b.reference} ${b.number}`).includes(n)) : [];
    hit.forEach(b => used.add(b.id));
    return { po, bills: hit, how: hit.length ? 'reference' : null };
  });
  for (const r of rows) {
    if (r.bills.length || r.po.status === 'DRAFT') continue;
    const near = list.filter(b => !used.has(b.id) && b.supplierId === r.po.supplierId && b.date >= plus(r.po.date, -3) && b.date <= plus(r.po.date, 60) && !differs(b.net, r.po.net));
    if (near.length === 1) { r.bills = near; r.how = 'likely'; used.add(near[0].id); }
  }
  for (const r of rows) {
    const billNet = round2(r.bills.reduce((a, b) => a + b.net, 0));
    r.billNet = billNet; r.diff = round2(billNet - r.po.net); r.units = []; r.flags = [];
    if (r.po.status === 'DRAFT') continue;
    if (!r.bills.length) {
      if (r.po.status === 'BILLED') r.flags.push('billednobill');
      else if (dayNo(today) - dayNo(r.po.date) > 21) r.flags.push('nobill');
      continue;
    }
    if (differs(billNet, r.po.net)) r.flags.push('price');
    const billLines = new Map(r.bills.flatMap(b => b.lines || []).map(l => [lineKey(l), l]));
    for (const l of r.po.lines || []) {
      const b = billLines.get(lineKey(l));
      if (b && Math.abs(b.unit - l.unit) > Math.max(0.005, Math.abs(l.unit) * 0.005)) r.units.push({ description: l.description, qty: l.qty, order: l.unit, bill: b.unit });
    }
    if (r.units.length) r.flags.push('unit');
  }
  const suppliers = new Set((pos || []).map(p => p.supplierId));
  const extraBills = list.filter(b => !used.has(b.id) && suppliers.has(b.supplierId)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  rows.sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0) || String(b.po.date).localeCompare(String(a.po.date)));
  return { rows, extraBills };
}

/**
 * Work sent out (powder coat, plating) with no bill from that company dated on or after it went, once two weeks have
 * passed: by company, oldest first. outwork: the board's rows { supplier, sentOn, jobId }; bills as above.
 */
export function outworkWithoutBill(outwork, bills, today) {
  const by = new Map();
  for (const o of outwork || []) {
    if (!o.supplier || !o.sentOn || dayNo(today) - dayNo(o.sentOn) <= 14) continue;
    if ((bills || []).some(b => b.date >= o.sentOn && looksSame(o.supplier, b.supplier))) continue;
    const k = normName(o.supplier), g = by.get(k) || { supplier: o.supplier, sends: [], since: o.sentOn };
    g.sends.push(o); if (o.sentOn < g.since) g.since = o.sentOn; by.set(k, g);
  }
  return [...by.values()].sort((a, b) => a.since.localeCompare(b.since));
}

/* ---------- Keith's chase emails (Philip, 24 Oct) ---------- */
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = n => '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const long = s => (s ? new Date(s.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/**
 * What the AI is told for a chase: the customer, the contact's first name, each invoice (number, dates, owed, days
 * overdue), the total, the oldest, and when they were chased before. g: a group from moneyIn().customers.
 */
export function chaseFacts(g, { person = '', chases = [], today }) {
  const before = (chases || []).filter(c => normName(c.customer) === normName(g.customer)).map(c => String(c.at).slice(0, 10)).sort().reverse();
  return { customer: g.customer, contactFirstName: String(person || '').trim().split(/\s+/)[0] || '',
    invoices: g.invoices.map(x => ({ number: x.number, date: x.date || '', due: x.due || '', owed: x.owed, daysOverdue: x.days })),
    totalOwed: g.owed, oldestDaysOverdue: g.days, chasedBefore: before.slice(0, 5),
    chasedInLast30Days: before.some(d => dayNo(today) - dayNo(d) <= 30), from: 'Keith, Accounts' };
}

/**
 * The email: the AI's greeting and paragraphs around a table the board builds itself from Xero (invoice, date, due,
 * amount, pay-online link), and the sign-off. ai: { subject, greeting, before: [..], after: [..] }; links: { id: url }.
 */
export function chaseHtml(ai, g, { links = {}, from = 'Keith', company = 'Clarke Lane Engineering Ltd' } = {}) {
  const td = 'padding:4px 12px 4px 0', p = xs => (xs || []).map(t => `<p>${escH(t)}</p>`).join('');
  const rows = g.invoices.map(x => `<tr><td style="${td}">${escH(x.number)}${x.reference ? ` <span style="color:#666">(${escH(x.reference)})</span>` : ''}</td><td style="${td}">${escH(long(x.date))}</td>
    <td style="${td}">${escH(long(x.due))}</td><td style="${td};text-align:right">${escH(money(x.owed))}</td><td style="padding:4px 0">${links[x.id] ? `<a href="${escH(links[x.id])}">View and pay online</a>` : ''}</td></tr>`).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
<p>${escH(ai.greeting || 'Hello,')}</p>${p(ai.before)}
<table style="border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;${td}">Invoice</th><th style="text-align:left;${td}">Date</th><th style="text-align:left;${td}">Due</th><th style="text-align:right;${td}">Amount due</th><th></th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="padding:6px 12px 0 0"><b>Total overdue</b></td><td style="padding:6px 12px 0 0;text-align:right"><b>${escH(money(g.owed))}</b></td><td></td></tr></tfoot></table>
${p(ai.after)}<p>Kind regards,<br>${escH(from)}<br>Accounts, ${escH(company)}</p></div>`;
}
