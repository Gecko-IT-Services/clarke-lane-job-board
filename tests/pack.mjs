// Keith's monthly pack: reading Xero's reports, and the facts the pack and the AI use. Made-up figures.
import assert from 'node:assert/strict';
const { readReport, plFigures, balanceFigures, bankFigures, lastMonths, monthName, packFacts } = await import('../src/core/pack.js');

// Xero's layout: a header row, then sections of rows with a summary row.
const cell = v => ({ Value: String(v) });
const row = (label, ...v) => ({ RowType: 'Row', Cells: [cell(label), ...v.map(cell)] });
const total = (label, ...v) => ({ RowType: 'SummaryRow', Cells: [cell(label), ...v.map(cell)] });
const report = (cols, ...sections) => ({ titles: ['Profit and Loss'], rows: [{ RowType: 'Header', Cells: [cell(''), ...cols.map(cell)] },
  ...sections.map(([Title, ...Rows]) => ({ RowType: 'Section', Title, Rows }))] });

// — The profit and loss, two columns, Xero's UK headings. —
const pl = report(['Sep 2026', 'Aug 2026'],
  ['Trading Income', row('Sales', '100,000.00', '80000'), row('Sales - Delivery', '2000', '1000'), total('Total Trading Income', '102000', '81000')],
  ['Cost of Sales', row('Materials', '40000', '30000'), row('Subcontract', '6000', '4000'), total('Total Cost of Sales', '46000', '34000')],
  ['', row('Gross Profit', '56000', '47000')],
  ['Operating Expenses', row('Rent', '5000', '5000'), row('Wages and Salaries', '30000', '0'), total('Total Operating Expenses', '35000', '5000')],
  ['', row('Net Profit', '21000', '42000')]);
assert.deepEqual(readReport(pl).columns, ['Sep 2026', 'Aug 2026']);
assert.equal(readReport(pl).sections[0].rows[0].values[0], 100000, 'commas are read');
const f = plFigures(pl);
assert.deepEqual(f.cols[0], { column: 'Sep 2026', sales: 102000, cos: 46000, gross: 56000, other: 0, overheads: 35000, net: 21000, gm: 54.9, nm: 20.6 });
assert.equal(f.cols[1].nm, 51.9, 'August: no wages posted, so the margin looks too good (payroll comes into Xero in April)');
assert.deepEqual(f.cosLines.map(l => l.label), ['Materials', 'Subcontract']);

// Other headings, no Gross or Net Profit rows: worked out.
const pl2 = report(['Total'], ['Turnover', row('Sales', '500')], ['Less Cost of Sales', row('Steel', '200')], ['Plus Other Income', row('Interest', '10')], ['Administrative Costs', row('Insurance', '50')]);
assert.deepEqual(plFigures(pl2).cols[0], { column: 'Total', sales: 500, cos: 200, gross: 300, other: 10, overheads: 50, net: 260, gm: 60, nm: 52 });
assert.deepEqual(plFigures({ rows: [] }).cols, [], 'an empty report is no columns, not an error');

// — The balance sheet. —
const bs = report(['30 Sep 2026', '31 Aug 2026'],
  ['Bank', row('Business Current Account', '30000', '25000'), total('Total Bank', '30000', '25000')],
  ['Current Assets', row('Accounts Receivable', '120000', '110000'), total('Total Current Assets', '120000', '110000')],
  ['', row('Total Assets', '150000', '135000')],
  ['Current Liabilities', row('Accounts Payable', '45000', '40000'), row('VAT', '15000', '12000'), total('Total Current Liabilities', '60000', '52000')],
  ['', row('Net Assets', '90000', '83000')]);
const b = balanceFigures(bs).cols[0];
assert.deepEqual([b.cash, b.debtors, b.creditors, b.vat, b.currentAssets, b.currentLiabilities, b.netAssets], [30000, 120000, 45000, 15000, 150000, 60000, 90000],
  'current assets take in the bank when Xero lists the bank on its own');

// — The bank summary. —
const bank = report(['Opening Balance', 'Cash Received', 'Cash Spent', 'Closing Balance'], ['', row('Business Current Account', '25000', '100000', '95000', '30000'), total('Total', '25000', '100000', '95000', '30000')]);
assert.deepEqual(bankFigures(bank), { opening: 25000, received: 100000, spent: 95000, closing: 30000 });

// — Months. —
assert.deepEqual(lastMonths('2026-01-10', 3), ['2025-12', '2025-11', '2025-10']);
assert.equal(monthName('2026-09'), 'September 2026');
const { shiftMonth, shortMonth } = await import('../src/core/pack.js');
assert.deepEqual([shiftMonth('2026-01', -2), shiftMonth('2025-11', 3), shortMonth('2026-09')], ['2025-11', '2026-02', 'Sep 2026'], 'months by name, not by Xero\'s "30 Sep 26" (24 Oct)');

// — The facts: Xero's figures plus the board's. —
const one = (cols, ...s) => report(cols, ...s);
const pack = { month: '2026-09', fyStart: '2026-04-01', reports: {
  trend: report(['Sep 2026', 'Aug 2026', 'Jul 2026'], ['Trading Income', row('Sales', '102000', '81000', '90000')], ['Cost of Sales', row('Materials', '46000', '34000', '40000')],
    ['Operating Expenses', row('Rent', '5000', '5000', '5000')]),
  ytd: one(['YTD'], ['Trading Income', row('Sales', '500000')], ['Cost of Sales', row('Materials', '220000')]),
  lastYtd: one(['Last YTD'], ['Trading Income', row('Sales', '450000')], ['Cost of Sales', row('Materials', '210000')]),
  lastYearMonth: one(['Sep 2025'], ['Trading Income', row('Sales', '95000')]),
  balance: bs, bank } };
const line = (id, qty, price, due) => ({ id, qty, price, due, part: 'P' });
const jobs = [{ id: 1, status: 'open', ordered: '2026-09-04', customer: 'Example Customer Ltd', lines: [line(1, 10, 100, '2026-09-20'), line(2, 10, 100, '2026-10-20')],
    despatches: [{ id: 1, date: '2026-09-19', lines: { 1: 10 } }] },
  { id: 2, status: 'open', ordered: '2026-08-10', customer: 'Sample Works Ltd', lines: [line(3, 5, 50, '2026-09-01')], despatches: [{ id: 2, date: '2026-09-03', lines: { 3: 5 } }] },
  { id: 3, status: 'cancelled', ordered: '2026-09-10', customer: 'Gone Ltd', lines: [line(4, 1, 999, '2026-09-30')], despatches: [] }];
const fx = packFacts({ pack, jobs, invoices: [{ customer: 'Example Customer Ltd', net: 60000 }, { customer: 'Sample Works Ltd', net: 30000 }, { customer: 'Example Customer Ltd', net: 10000 }], today: '2026-10-23' });
assert.equal(fx.monthName, 'September 2026');
assert.deepEqual([fx.figures.month.sales, fx.figures.month.gross, fx.figures.sameMonthLastYear.sales, fx.figures.yearToDate.gm, fx.figures.sameYearToDateLastYear.gm], [102000, 56000, 95000, 56, 53.3]);
assert.deepEqual(fx.trend.map(t => t.month), ['Jul 2026', 'Aug 2026', 'Sep 2026'], 'oldest first for the chart and the AI');
assert.deepEqual(fx.kpis, { debtorDays: 40, creditorDays: 30, orderBookMonths: 0 },
  '£120k debtors on £273k of sales in 3 months is 40 days; £45k creditors on £135k of costs is 30; £1k left to make is no time at all');
assert.equal(fx.balance.currentRatio, 2.5, '£150k current assets (bank included) on £60k current liabilities');
assert.deepEqual(fx.bank, { opening: 25000, received: 100000, spent: 95000, closing: 30000 });
assert.deepEqual(fx.board.ordersBooked, { count: 1, value: 2000 }, 'booked in September; the cancelled one is left out');
assert.equal(fx.board.orderBookNow, 1000, 'what is left to make on open orders');
assert.deepEqual([fx.board.deliveriesInMonth, fx.board.onTimePct], [2, 50], 'one delivery a day early, one two days late');
assert.deepEqual(fx.board.topCustomers, [{ customer: 'Example Customer Ltd', net: 70000, share: 70 }, { customer: 'Sample Works Ltd', net: 30000, share: 30 }]);
assert.deepEqual(fx.biggestCosts.costOfSales, [{ label: 'Materials', month: 46000 }]);
assert.ok(JSON.stringify(fx).length < 20000, 'small enough to send to the AI');
console.log('pack: ok');
