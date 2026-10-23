/**
 * Keith's monthly pack (Philip, 23 Oct): the management accounts for a month from Xero's reports, plus what only the
 * board knows (orders booked, the order book, deliveries not invoiced, on-time delivery). Reads Xero's report layout
 * (rows of sections, each with rows and a total) without relying on exact headings, so "Trading Income" or
 * "Turnover", "Less Operating Expenses" or "Administrative Costs" all land in the right place. Pure: tests/pack.mjs.
 */
import { round2, left } from './jobs.js';

const num = v => { const n = Number(String(v ?? '').replace(/[,£\s]/g, '')); return Number.isFinite(n) ? n : 0; };
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const pad = n => String(n).padStart(2, '0');

/** Xero's report ({ titles, rows }) → { titles, columns, sections: [{ title, rows: [{ label, values }], total }] }. */
export function readReport(rep) {
  const rows = rep?.rows || [];
  const header = rows.find(r => r.RowType === 'Header');
  const columns = (header?.Cells || []).slice(1).map(c => String(c?.Value ?? ''));
  const vals = cells => columns.map((_, i) => num(cells?.[i + 1]?.Value));
  const sections = rows.filter(r => r.RowType === 'Section').map(s => {
    const inner = s.Rows || [], t = inner.find(r => r.RowType === 'SummaryRow');
    return { title: String(s.Title || ''), rows: inner.filter(r => r.RowType === 'Row').map(r => ({ label: String(r.Cells?.[0]?.Value ?? '').trim(), values: vals(r.Cells) })),
      total: t ? { label: String(t.Cells?.[0]?.Value ?? '').trim(), values: vals(t.Cells) } : null };
  });
  return { titles: rep?.titles || [], columns, sections };
}
const zeros = r => r.columns.map(() => 0);
const add = (a, b) => a.map((x, i) => round2(x + (b[i] || 0)));
const sectionTotal = (r, s) => s.total ? s.total.values : s.rows.reduce((a, x) => add(a, x.values), zeros(r));
/** The first row (or total) anywhere whose label matches. */
function lineOf(r, re) {
  for (const s of r.sections) for (const x of [...s.rows, ...(s.total ? [s.total] : [])]) if (re.test(x.label)) return x.values;
  return null;
}

/**
 * A profit and loss report → per column { column, sales, cos, gross, other, overheads, net, gm, nm } (gm, nm: % of
 * sales), and the cost of sales and overhead lines. Gross and net profit are Xero's own rows when it has them.
 */
export function plFigures(rep) {
  const r = readReport(rep), z = zeros(r);
  const pick = test => r.sections.filter(s => test(s.title.toLowerCase()));
  const sum = secs => secs.reduce((a, s) => add(a, sectionTotal(r, s)), z);
  const salesS = pick(t => /income|turnover|revenue|sales/.test(t) && !/other income|cost/.test(t));
  const otherS = pick(t => /other income/.test(t));
  const cosS = pick(t => /cost of sales|direct cost|cost of goods/.test(t));
  const ovhS = pick(t => /expense|overhead|administrative|operating cost/.test(t) && !/cost of sales|direct cost/.test(t));
  const sales = sum(salesS), other = sum(otherS), cos = sum(cosS), overheads = sum(ovhS);
  const gross = lineOf(r, /^gross profit$/i) || sales.map((x, i) => round2(x - cos[i]));
  const net = lineOf(r, /^net (profit|loss)$|^profit for the (period|year)$/i) || gross.map((x, i) => round2(x + other[i] - overheads[i]));
  return { columns: r.columns, cols: r.columns.map((column, i) => ({ column, sales: sales[i], cos: cos[i], gross: gross[i], other: other[i],
      overheads: overheads[i], net: net[i], gm: pct(gross[i], sales[i]), nm: pct(net[i], sales[i]) })),
    cosLines: cosS.flatMap(s => s.rows), overheadLines: ovhS.flatMap(s => s.rows) };
}

/** A balance sheet (this month end, the one before) → { cash, debtors, creditors, vat, currentAssets, currentLiabilities, netAssets } per column. */
export function balanceFigures(rep) {
  const r = readReport(rep), z = zeros(r);
  const sec = re => r.sections.find(s => re.test(s.title));
  const bank = sec(/bank/i);
  const get = (...res) => { for (const re of res) { const v = lineOf(r, re); if (v) return v; } return z; };
  const ca = sec(/^current assets$/i), cl = sec(/^current liabilities$/i);
  const f = { cash: bank ? sectionTotal(r, bank) : get(/^total bank$/i),
    debtors: get(/accounts receivable/i, /trade debtors/i, /^debtors$/i),
    creditors: get(/accounts payable/i, /trade creditors/i, /^creditors$/i),
    vat: get(/^vat$/i, /^vat (liability|control|owed)/i, /^vat/i),
    currentAssets: get(/^total current assets$/i), currentLiabilities: get(/^total current liabilities$/i), netAssets: get(/^net assets$/i) };
  if (ca && !f.currentAssets.some(Boolean)) f.currentAssets = sectionTotal(r, ca);
  if (bank) f.currentAssets = add(f.currentAssets, f.cash);   // Xero lists the bank on its own; it is a current asset all the same
  if (cl && !f.currentLiabilities.some(Boolean)) f.currentLiabilities = sectionTotal(r, cl);
  return { columns: r.columns, cols: r.columns.map((column, i) => Object.fromEntries([['column', column], ...Object.entries(f).map(([k, v]) => [k, v[i] || 0])])) };
}

/** A bank summary → { opening, received, spent, closing } for all accounts together. */
export function bankFigures(rep) {
  const r = readReport(rep), at = re => r.columns.findIndex(c => re.test(c));
  const s = r.sections[0]; if (!s) return { opening: 0, received: 0, spent: 0, closing: 0 };
  const t = s.total ? s.total.values : sectionTotal(r, s), v = i => (i < 0 ? 0 : t[i] || 0);
  return { opening: v(at(/opening/i)), received: v(at(/received/i)), spent: v(at(/spent/i)), closing: v(at(/closing/i)) };
}

/** '2026-09' moved by k months: shift('2026-01', -2) = '2025-11'. */
export const shiftMonth = (ym, k) => { let [y, m] = ym.split('-').map(Number); m += k; while (m < 1) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; } return `${y}-${pad(m)}`; };
/** '2026-09' → 'Sep 2026', the same in every browser (some write "Sept"). */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortMonth = ym => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/**
 * Where a month sits in the financial year (Philip, 24 Oct: October is Clarke Lane's first period). fyStart:
 * '2025-10-01'. → { period: 12, isYearEnd: true, yearEnd: '2026-09-30', label: 'year ending 30 September 2026' }.
 */
export function finYear(ym, fyStart) {
  const start = String(fyStart || '').slice(0, 7); if (!/^\d{4}-\d{2}$/.test(start)) return null;
  const [y1, m1] = start.split('-').map(Number), [y2, m2] = ym.split('-').map(Number);
  const period = (y2 - y1) * 12 + (m2 - m1) + 1, endYm = shiftMonth(start, 11);
  const [ey, em] = endYm.split('-').map(Number), last = new Date(Date.UTC(ey, em, 0)).getUTCDate();
  const yearEnd = `${endYm}-${pad(last)}`;
  return { period, isYearEnd: period === 12, yearEnd, label: `year ending ${last} ${new Date(Date.UTC(ey, em - 1, 15)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })} ${ey}` };
}
/** The complete months before today, newest first: '2026-09', '2026-08', … */
export function lastMonths(today, n = 12) {
  let [y, m] = today.slice(0, 7).split('-').map(Number);
  return Array.from({ length: n }, () => { m -= 1; if (!m) { m = 12; y -= 1; } return `${y}-${pad(m)}`; });
}
export const monthName = ym => new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/**
 * Everything the pack shows, and the facts the AI writes from. pack: the Xero function's answer ({ month, fyStart,
 * reports }); jobs: the board's; invoices: Xero's sales invoices for the month ({ customer, net }); today.
 */
export function packFacts({ pack, jobs = [], invoices = [], today }) {
  const ym = pack.month, rp = pack.reports || {};
  const trend = plFigures(rp.trend), ytd = plFigures(rp.ytd).cols[0], lastYtd = plFigures(rp.lastYtd).cols[0], lastYear = plFigures(rp.lastYearMonth).cols[0];
  const month = trend.cols[0] || ytd, bal = balanceFigures(rp.balance), bank = bankFigures(rp.bank);
  const keep = x => x && { sales: x.sales, cos: x.cos, gross: x.gross, gm: x.gm, overheads: x.overheads, other: x.other, net: x.net, nm: x.nm };
  const three = trend.cols.slice(0, 3), avgSales = three.length ? three.reduce((a, c) => a + c.sales, 0) / three.length : 0;
  const days = (amount, per3) => (per3 > 0 ? Math.round((amount / per3) * 91) : null);
  const b = bal.cols[0] || {}, bPrev = bal.cols[1] || null;
  // From the board: orders booked in the month, the order book now, on-time deliveries in the month.
  const inMonth = s => String(s || '').slice(0, 7) === ym;
  const live = jobs.filter(j => !j.preview && j.status !== 'cancelled');
  const booked = live.filter(j => inMonth(j.ordered));
  const orderBook = round2(live.reduce((a, j) => a + j.lines.reduce((s, l) => s + left(j, l) * (l.price || 0), 0), 0));
  const sent = live.flatMap(j => (j.despatches || []).filter(d => inMonth(d.date)).map(d => {
    const due = j.lines.filter(l => (d.lines[l.id] || 0) > 0).map(l => l.due).sort()[0];
    return !due || d.date <= due;
  }));
  const byCustomer = new Map();
  for (const x of invoices || []) byCustomer.set(x.customer, round2((byCustomer.get(x.customer) || 0) + (x.net || 0)));
  const invoicedTotal = round2([...byCustomer.values()].reduce((a, v) => a + v, 0));
  const topCustomers = [...byCustomer.entries()].sort((p, q) => q[1] - p[1]).slice(0, 5).map(([customer, net]) => ({ customer, net, share: pct(net, invoicedTotal) }));
  const top = (lines, n) => lines.map(l => ({ label: l.label, month: l.values[0] || 0 })).filter(l => l.month).sort((p, q) => Math.abs(q.month) - Math.abs(p.month)).slice(0, n);
  return {
    company: 'Clarke Lane Engineering Ltd', month: ym, monthName: monthName(ym), fyStart: pack.fyStart,
    // Which month of the financial year this is (period 1 = the first), and whether it closes the year.
    financialYear: finYear(ym, pack.fyStart),
    // The month in progress (24 Oct): its figures run to this day, and last year's to the same day.
    partial: !!pack.partial, to: pack.to || null,
    figures: { month: keep(month), sameMonthLastYear: keep(lastYear), yearToDate: keep(ytd), sameYearToDateLastYear: keep(lastYtd) },
    // Named by the board, oldest first: Xero heads each column with the month's last day ("30 Sep 26"), not its name (24 Oct).
    trend: trend.cols.map((c, i) => ({ month: shortMonth(shiftMonth(ym, -i)),
      sales: c.sales, gross: c.gross, gm: c.gm, net: c.net, ...(i === 0 && pack.partial ? { soFar: true } : {}) })).reverse(),
    biggestCosts: { costOfSales: top(trend.cosLines, 6), overheads: top(trend.overheadLines, 8) },
    balance: { cash: b.cash, debtors: b.debtors, creditors: b.creditors, vat: b.vat, netAssets: b.netAssets,
      currentRatio: b.currentLiabilities ? Math.round((b.currentAssets / b.currentLiabilities) * 100) / 100 : null,
      monthBefore: bPrev && { cash: bPrev.cash, debtors: bPrev.debtors, creditors: bPrev.creditors } },
    bank,
    kpis: { debtorDays: days(b.debtors, three.reduce((a, c) => a + c.sales, 0)), creditorDays: days(b.creditors, three.reduce((a, c) => a + c.cos + c.overheads, 0)),
      orderBookMonths: avgSales > 0 ? Math.round((orderBook / avgSales) * 10) / 10 : null },
    board: { ordersBooked: { count: booked.length, value: round2(booked.reduce((a, j) => a + j.lines.reduce((s, l) => s + l.qty * (l.price || 0), 0), 0)) },
      orderBookNow: orderBook, deliveriesInMonth: sent.length, onTimePct: sent.length ? pct(sent.filter(Boolean).length, sent.length) : null,
      invoicedInXero: invoicedTotal, topCustomers },
    asAt: today,
  };
}
