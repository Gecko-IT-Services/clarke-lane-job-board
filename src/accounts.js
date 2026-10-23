/**
 * Keith's Accounts page (Philip, 23 Oct): for the accounts login only. Four sections, each what the board knows that
 * Xero does not: drafts to approve with their proof of delivery, the month-end cut-off, purchase orders against the
 * supplier bills, and money coming in. Read only: nothing here changes Xero or the board. The figures come from
 * core/accounts.js (tested); this file only draws them. h: the formatting helpers from app.js.
 */
import { card } from './home.js';
import { draftsToApprove, cutOff, moneyIn, matchPurchases, outworkWithoutBill } from './core/accounts.js';

const STATUS = { DRAFT: 'Draft', SUBMITTED: 'Awaiting approval', AUTHORISED: 'Approved', BILLED: 'Billed' };

export function renderAccounts({ jobs, today, me, inv, invErr, debts, debtErr, purchases, purErr, outwork, chases, view = 'look', loading, switcher = '' }, h) {
  const { esc, fmt, gbp } = h;
  const money = n => gbp(n, 2);
  const chip = (t, tone = '') => `<span class="chip${tone ? ' ' + tone : ''}">${t}</span>`;
  const wait = (err, what) => err ? `<div class="err">${esc(err)}</div>` : `<p class="note">${loading ? `Reading ${what} from Xero…` : `${what} not read yet.`}</p>`;

  // 1. Drafts to approve.
  const drafts = inv ? draftsToApprove(jobs, inv) : null;
  const FLAG = {
    amount: r => chip(`Xero says ${money(r.inv.net)}, the board ${money(r.boardNet)}`, 'late'),
    contact: r => chip(`In Xero for ${esc(r.inv.contact)}`, 'late'),
    unsigned: () => chip('Nobody recorded as signing', 'soon'),
  };
  const draftRows = (drafts || []).map(r => `<tr><td class="mono">${esc(r.inv.number || 'Draft')}</td>
      <td><b>${esc(r.job.customer)}</b><span class="ref mono">${esc(r.job.so)}${r.job.po ? ' · ' + esc(r.job.po) : ''}</span></td>
      <td>${esc(r.d.dn)}<span class="ref">delivered ${fmt(r.d.deliveredOn)}${r.d.receivedBy ? ` · signed by ${esc(r.d.receivedBy)}` : r.d.deliveryNote ? ` · ${esc(r.d.deliveryNote)}` : ''}</span></td>
      <td class="num">${money(r.boardNet)}</td><td>${r.flags.map(f => FLAG[f](r)).join(' ') || chip('Matches the delivery', 'ok')}</td>
      <td class="act"><button class="btn sm" type="button" data-dn="${r.d.id}" data-job="${r.job.id}">Delivery note</button></td></tr>`).join('');
  const draftBox = `<section class="panel acc"><div class="ph"><h3>Draft invoices to approve</h3><span class="note">made by the board from delivery notes · ${drafts ? `${drafts.length} waiting` : ''}</span></div>
    ${!drafts ? wait(invErr, 'The drafts') : !drafts.length ? '<p class="allclear ok">Nothing waiting: every draft the board made has been approved.</p>'
      : `<div class="tbl-wrap"><table class="lines home"><thead><tr><th>Invoice</th><th>Customer</th><th>Delivery</th><th class="num">Board net</th><th>Check</th><th></th></tr></thead><tbody>${draftRows}</tbody></table></div>
      <p class="note">Each draft is exactly what went out on its delivery note. <b>Delivery note</b> shows the note as signed for. An amount that differs means the draft was changed in Xero after the board made it.</p>`}</section>`;

  // 2. Month-end cut-off.
  const c = cutOff(jobs, today);
  const month = new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long' });
  const cutBox = `<section class="panel acc"><div class="ph"><h3>Month-end cut-off</h3><span class="note">as at ${fmt(today)}, net</span></div>
    <div class="acc-kv">
      <div><b>${money(c.deliveredTotal)}</b><span>Delivered, not invoiced${c.deliveredThisMonth !== c.deliveredTotal ? ` (${money(c.deliveredThisMonth)} of it in ${month})` : ''}</span></div>
      <div><b>${money(c.transitTotal)}</b><span>Dispatched, not yet delivered</span></div>
      <div><b>${money(c.book.total)}</b><span>Order book still to make: ${c.book.late ? `${money(c.book.late)} late, ` : ''}${money(c.book.thisMonth)} rest of ${month}, ${money(c.book.nextMonth)} next month, ${money(c.book.later)} later</span></div></div>
    ${c.delivered.length ? `<details><summary class="btn sm">The ${c.delivered.length} delivered, not invoiced</summary><div class="tbl-wrap"><table class="lines home"><thead><tr><th>Note</th><th>Customer</th><th>Delivered</th><th class="num">Net</th></tr></thead><tbody>
      ${c.delivered.map(x => `<tr><td class="mono">${esc(x.d.dn)}</td><td>${esc(x.job.customer)}<span class="ref mono">${esc(x.job.so)}</span></td><td>${fmt(x.d.deliveredOn)}</td><td class="num">${money(x.value)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}</section>`;

  // 3. Purchase orders against bills.
  const p = purchases ? matchPurchases(purchases.pos, purchases.bills, today) : null;
  const ow = purchases ? outworkWithoutBill(outwork, purchases.bills, today) : [];
  const PF = {
    price: r => chip(`Bill ${money(r.billNet)} vs order ${money(r.po.net)} (${r.diff > 0 ? '+' : ''}${money(r.diff)})`, 'late'),
    unit: r => chip(`${r.units.length} price${r.units.length === 1 ? '' : 's'} changed`, 'late'),
    nobill: () => chip('No bill yet', 'soon'),
    billednobill: () => chip('Billed in Xero, no bill quotes it', 'soon'),
  };
  const shown = p ? (view === 'all' ? p.rows : p.rows.filter(r => r.flags.length)) : [];
  const poRows = shown.map(r => `<tr><td class="mono">${esc(r.po.number)}</td><td>${esc(r.po.supplier)}<span class="ref">${fmt(r.po.date)} · ${esc(STATUS[r.po.status] || r.po.status)}</span></td>
      <td class="num">${money(r.po.net)}</td><td>${r.bills.length ? r.bills.map(b => `${esc(b.number || 'Bill')} <span class="ref">${fmt(b.date)}${r.how === 'likely' ? ' · likely (same amount, no PO number on it)' : ''}</span>`).join('') : '<span class="note">none found</span>'}</td>
      <td class="num">${r.bills.length ? money(r.billNet) : ''}</td><td>${r.flags.map(f => PF[f](r)).join(' ') || chip('Matches', 'ok')}
      ${r.units.length ? `<div class="acc-units">${r.units.map(u => `${esc(u.description)}: ordered at ${money(u.order)}, billed at ${money(u.bill)}${u.qty ? ` × ${u.qty}` : ''}`).join('<br>')}</div>` : ''}</td></tr>`).join('');
  const look = p ? p.rows.filter(r => r.flags.length).length : 0;
  const poBox = `<section class="panel acc"><div class="ph"><h3>Purchase orders against bills</h3><span class="note">Xero, last 120 days</span>
      ${p ? `<div class="seg" role="group" aria-label="Which purchase orders"><button type="button" data-accview="look" aria-pressed="${view !== 'all'}">Needs a look <em>${look}</em></button><button type="button" data-accview="all" aria-pressed="${view === 'all'}">All <em>${p.rows.length}</em></button></div>` : ''}</div>
    ${!p ? wait(purErr, 'Purchase orders and bills') : !shown.length ? `<p class="allclear ok">${view === 'all' ? 'No purchase orders in the last 120 days.' : 'Every bill matches its purchase order.'}</p>`
      : `<div class="tbl-wrap"><table class="lines home"><thead><tr><th>PO</th><th>Supplier</th><th class="num">Ordered</th><th>Bill</th><th class="num">Billed</th><th>Check</th></tr></thead><tbody>${poRows}</tbody></table></div>`}
    ${p ? `<p class="note">A bill is matched when it is from the same supplier and quotes the PO number; otherwise the one bill for the same amount soon after is marked <i>likely</i>. Differences under £1 (or 1%) are ignored. A changed price is checked line by line by item code or description.</p>` : ''}
    ${p && p.extraBills.length ? `<details><summary class="btn sm">${p.extraBills.length} bill${p.extraBills.length === 1 ? '' : 's'} from these suppliers with no purchase order</summary><ul class="acc-list">${p.extraBills.slice(0, 30).map(b => `<li>${esc(b.supplier)} · ${esc(b.number || 'Bill')} · ${fmt(b.date)} · ${money(b.net)}${b.reference ? ` · ref ${esc(b.reference)}` : ''}</li>`).join('')}</ul></details>` : ''}
    ${ow.length ? `<div class="warn">Sent out for coating or plating, no bill from them since: ${ow.map(g => `<b>${esc(g.supplier)}</b> (${g.sends.length} job${g.sends.length === 1 ? '' : 's'} since ${fmt(g.since)})`).join(', ')}.</div>` : ''}</section>`;

  // 4. Money coming in: grouped by customer, most owed first; customers in administration kept apart (24 Oct).
  const m = debts ? moneyIn(debts, jobs, chases, today) : null;
  const pounds = n => gbp(n, 0);
  const chaseCell = x => x.chased ? `${fmt(x.chased.at.slice(0, 10))} by ${esc(x.chased.by)}` : '<span class="note">no chase email from the board</span>';
  const custRows = (list, chase = true) => list.map(g => `<tr><td><b>${esc(g.customer)}</b><span class="ref mono">${g.invoices.map(x => esc(x.number)).join(', ')}</span></td>
      <td>${g.oldest ? `${fmt(g.oldest)}${g.days != null ? ` <span class="note">${g.days} days</span>` : ''}` : ''}</td><td class="num">${money(g.owed)}</td>${chase ? `<td>${chaseCell(g)}</td>` : ''}</tr>`).join('');
  const inBox = `<section class="panel acc"><div class="ph"><h3>Money coming in</h3><span class="note">approved invoices not yet paid, by due date</span></div>
    ${!m ? wait(debtErr, 'Unpaid invoices') : `<div class="acc-kv">
      <div class="${m.overdue ? 'bad' : ''}"><b>${pounds(m.overdue)}</b><span>Overdue</span></div><div><b>${pounds(m.week)}</b><span>Due in the next 7 days</span></div>
      <div><b>${pounds(m.month)}</b><span>Due in 8 to 30 days</span></div><div><b>${pounds(m.later)}</b><span>Later</span></div>
      ${m.doubtful ? `<div><b>${pounds(m.doubtful)}</b><span>Doubtful: customers in administration or liquidation (in none of the figures above)</span></div>` : ''}
      <div><b>${pounds(m.toInvoice)}</b><span>To invoice in the next 4 weeks (order book due by then)</span></div></div>
      ${m.customers.length ? `<h4>Overdue, by customer</h4><p class="note">Every approved invoice past its due date and still unpaid, most owed first. <i>Last chased</i> shows chase emails drafted from the board only; a phone call or an email sent another way is not seen here.</p>
        <div class="tbl-wrap"><table class="lines home"><thead><tr><th>Customer and invoices</th><th>Oldest due</th><th class="num">Owed</th><th>Last chased</th></tr></thead><tbody>${custRows(m.customers)}</tbody></table></div>` : ''}
      ${m.doubtfulCustomers.length ? `<h4>Doubtful: in administration or liquidation</h4><div class="tbl-wrap"><table class="lines home"><thead><tr><th>Customer and invoices</th><th>Oldest due</th><th class="num">Owed</th></tr></thead><tbody>${custRows(m.doubtfulCustomers, false)}</tbody></table></div>` : ''}`}</section>`;

  const cards = [
    card('warn', 'invoice', drafts ? drafts.length : '…', 'Drafts to approve', !!drafts?.some(r => r.flags.length)),
    card('info', 'truck', gbp(c.deliveredTotal, 0), 'Delivered, not invoiced', c.deliveredTotal > 0),
    card('warn', 'doc', p ? look : '…', 'Purchase orders to check', look > 0),
    card('warn', 'late', m ? gbp(m.overdue, 0) : '…', m?.doubtful ? 'Overdue, not counting administration' : 'Overdue', !!m?.overdue),
  ].join('');
  return `<div class="home acc-page"><div class="hhead"><div><h2>Accounts</h2><p class="sub">For ${esc(me?.name || 'Keith')}. Read only: nothing here changes Xero or the board.</p></div>
      <div class="hbtns">${switcher}<button class="btn" type="button" data-accrefresh ${loading ? 'disabled' : ''}>${loading ? 'Reading Xero…' : 'Read Xero again'}</button></div></div>
    <div class="hcards">${cards}</div>${draftBox}${poBox}${cutBox}${inBox}</div>`;
}

/* ---------- the monthly pack (Philip, 23 Oct): management accounts for a month, for Keith to take to Rob ---------- */
const sign = n => (n > 0 ? '+' : '');
/** % change from b to a, or '' when there is nothing to compare with. */
const change = (a, b) => (b ? `${sign(a - b)}${(Math.round(((a - b) / Math.abs(b)) * 1000) / 10).toFixed(1)}%` : '');

/** The 12 months' sales as bars, oldest first: one series, so no legend; each bar names its month and value on hover. */
function trendChart(trend, gbp) {
  if (!trend?.length) return '';
  const W = 600, H = 150, pad = 18, top = Math.max(1, ...trend.map(t => t.sales)), bw = (W - pad * 2) / trend.length;
  const bars = trend.map((t, i) => {
    const h = Math.max(0, (t.sales / top) * (H - 34)), x = pad + i * bw + 2, w = Math.max(2, bw - 4), y = H - 18 - h;
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="bar${i === trend.length - 1 ? ' now' : ''}"><title>${t.month}: sales ${gbp(t.sales)}, gross margin ${t.gm ?? '–'}%</title></rect>
      <text x="${x + w / 2}" y="${H - 4}" text-anchor="middle" class="ax">${String(t.month).split(' ')[0].slice(0, 3)}</text></g>`;
  }).join('');
  const last = trend[trend.length - 1], lx = pad + (trend.length - 1) * bw + bw / 2, ly = H - 18 - (last.sales / top) * (H - 34) - 6;
  return `<svg class="ptrend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales for the last ${trend.length} months">
    <line x1="${pad}" x2="${W - pad}" y1="${H - 18}" y2="${H - 18}" class="base"/>${bars}<text x="${lx}" y="${Math.max(10, ly)}" text-anchor="middle" class="lbl">${gbp(last.sales)}</text></svg>`;
}

/** The profit and loss table: the month, the same month last year, the year to date and the same period last year. */
function plTable(f, gbp, cls = 'lines home') {
  const c = [f.figures.month, f.figures.sameMonthLastYear, f.figures.yearToDate, f.figures.sameYearToDateLastYear];
  const money = k => c.map(x => `<td class="num">${x ? gbp(x[k]) : '–'}</td>`).join('');
  const per = k => c.map(x => `<td class="num">${x && x[k] != null ? x[k].toFixed(1) + '%' : '–'}</td>`).join('');
  return `<div class="tbl-wrap"><table class="${cls}"><thead><tr><th></th><th class="num">${f.monthName}</th><th class="num">Same month last year</th><th class="num">Year to date</th><th class="num">Same period last year</th></tr></thead><tbody>
    <tr><td>Sales</td>${money('sales')}</tr><tr><td>Cost of sales</td>${money('cos')}</tr><tr class="sub"><td><b>Gross profit</b></td>${money('gross')}</tr><tr><td>Gross margin</td>${per('gm')}</tr>
    <tr><td>Overheads</td>${money('overheads')}</tr>${c.some(x => x?.other) ? `<tr><td>Other income</td>${money('other')}</tr>` : ''}
    <tr class="sub"><td><b>Net profit</b></td>${money('net')}</tr><tr><td>Net margin</td>${per('nm')}</tr></tbody></table></div>`;
}

/** The AI's commentary, as kept. */
function analysisHtml(a, esc) {
  if (!a) return '';
  const list = (t, xs) => xs?.length ? `<h4>${t}</h4><ul>${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  return `<div class="pai"><p class="phead"><b>${esc(a.headline)}</b></p><p>${esc(a.summary)}</p>
    ${(a.sections || []).map(s => list(esc(s.title), s.points)).join('')}${list('Risks to watch', a.risks)}${list('Actions for next month', a.actions)}${list('To check before presenting', a.questions)}</div>`;
}

export function renderMonthPack({ months, month, facts, packErr, loading, saved, aiBusy, aiErr, switcher = '' }, h) {
  const { esc, gbp } = h;
  const g = n => gbp(n, 0);
  const head = `<div class="hhead"><div><h2>Monthly pack</h2><p class="sub">Management accounts for ${esc(facts?.monthName || month)}, from Xero and the board.</p></div>
    <div class="hbtns">${switcher}<select class="f" data-packmonth aria-label="Which month">${months.map(m => `<option value="${m}"${m === month ? ' selected' : ''}>${new Date(m + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>`).join('')}</select>
      <button class="btn" type="button" data-packread ${loading ? 'disabled' : ''}>${loading ? 'Reading Xero…' : 'Read Xero again'}</button>
      ${facts ? '<button class="btn pri" type="button" data-packprint>Print or save PDF</button>' : ''}</div></div>`;
  if (!facts) return `<div class="home acc-page">${head}${packErr ? `<div class="err">${esc(packErr)}${/permission|scope|401|403|Reconnect/i.test(packErr) ? '<br>Xero needs one more permission for its reports: ask Levi to press <b>Reconnect</b> on the Xero tab once.' : ''}</div>` : `<p class="note">${loading ? 'Reading the month\'s reports from Xero…' : 'Choose a month.'}</p>`}</div>`;
  const m = facts.figures.month || {}, ly = facts.figures.sameMonthLastYear, ytd = facts.figures.yearToDate, lytd = facts.figures.sameYearToDateLastYear;
  const cards = [
    card('info', 'invoice', g(m.sales), `Sales in ${esc(facts.monthName.split(' ')[0])}${ly?.sales ? ` · ${change(m.sales, ly.sales)} on last year` : ''}`, true),
    card(m.gm != null && ly?.gm != null && m.gm < ly.gm ? 'warn' : 'ok', 'ready', m.gm != null ? m.gm.toFixed(1) + '%' : '–', `Gross margin${ly?.gm != null ? ` (last year ${ly.gm.toFixed(1)}%)` : ''}`, true),
    card(m.net < 0 ? 'warn' : 'ok', 'book', g(m.net), 'Net profit for the month', true),
    card('info', 'home', g(facts.bank.closing || facts.balance.cash), `Cash at the month end${facts.bank.opening ? ` · ${sign(facts.bank.closing - facts.bank.opening)}${g(facts.bank.closing - facts.bank.opening)} in the month` : ''}`, true),
  ].join('');
  const b = facts.balance, k = facts.kpis, bd = facts.board, prev = b.monthBefore;
  const vs = (now, was) => was != null ? ` <span class="note">(${sign(now - was)}${g(now - was)} on the month before)</span>` : '';
  const costs = (t, xs) => `<div><h4>${t}</h4>${xs.length ? `<table class="lines home"><tbody>${xs.map(x => `<tr><td>${esc(x.label)}</td><td class="num">${g(x.month)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">None this month.</p>'}</div>`;
  return `<div class="home acc-page">${head}<div class="hcards">${cards}</div>
    <section class="panel acc"><div class="ph"><h3>Profit and loss</h3><span class="note">net of VAT · year from ${esc(facts.fyStart)}</span></div>${plTable(facts, g)}
      ${ytd && lytd?.sales ? `<p class="note">Year to date sales are ${change(ytd.sales, lytd.sales)} on the same period last year.</p>` : ''}</section>
    <section class="panel acc"><div class="ph"><h3>Sales, last 12 months</h3></div>${trendChart(facts.trend, g)}
      <div class="tbl-wrap"><table class="lines home"><thead><tr><th>Month</th>${facts.trend.map(t => `<th class="num">${esc(String(t.month).split(' ')[0].slice(0, 3))}</th>`).join('')}</tr></thead><tbody>
        <tr><td>Sales</td>${facts.trend.map(t => `<td class="num">${g(t.sales)}</td>`).join('')}</tr><tr><td>Gross margin</td>${facts.trend.map(t => `<td class="num">${t.gm != null ? t.gm.toFixed(0) + '%' : '–'}</td>`).join('')}</tr>
        <tr><td>Net profit</td>${facts.trend.map(t => `<td class="num">${g(t.net)}</td>`).join('')}</tr></tbody></table></div></section>
    <section class="panel acc"><div class="ph"><h3>Biggest costs this month</h3></div><div class="pcols">${costs('Cost of sales', facts.biggestCosts.costOfSales)}${costs('Overheads', facts.biggestCosts.overheads)}</div></section>
    <section class="panel acc"><div class="ph"><h3>Cash and the balance sheet</h3><span class="note">at the month end</span></div>
      <div class="acc-kv"><div><b>${g(facts.bank.closing)}</b><span>In the bank: ${g(facts.bank.opening)} at the start, ${g(facts.bank.received)} in, ${g(facts.bank.spent)} out</span></div>
        <div><b>${g(b.debtors)}</b><span>Owed by customers${k.debtorDays != null ? ` · ${k.debtorDays} days of sales` : ''}${vs(b.debtors, prev?.debtors)}</span></div>
        <div><b>${g(b.creditors)}</b><span>Owed to suppliers${k.creditorDays != null ? ` · ${k.creditorDays} days of costs` : ''}${vs(b.creditors, prev?.creditors)}</span></div>
        <div><b>${g(b.vat)}</b><span>VAT owed</span></div><div><b>${b.currentRatio ?? '–'}</b><span>Current ratio (what is owed to us and in the bank, for each £1 owed out)</span></div>
        <div><b>${g(b.netAssets)}</b><span>Net assets</span></div></div></section>
    <section class="panel acc"><div class="ph"><h3>From the board</h3><span class="note">orders and deliveries, which Xero does not see</span></div>
      <div class="acc-kv"><div><b>${g(bd.ordersBooked.value)}</b><span>${bd.ordersBooked.count} order${bd.ordersBooked.count === 1 ? '' : 's'} booked in the month</span></div>
        <div><b>${g(bd.orderBookNow)}</b><span>Order book still to make, now${k.orderBookMonths >= 0.1 ? ` · ${k.orderBookMonths} months of sales` : ''}</span></div>
        <div><b>${bd.onTimePct != null ? bd.onTimePct + '%' : '–'}</b><span>${bd.deliveriesInMonth ? `of the ${bd.deliveriesInMonth} deliveries in the month went on or before their due date` : 'No deliveries made in the month'}</span></div></div>
      ${bd.topCustomers.length ? `<h4>Biggest customers in the month (invoiced in Xero)</h4><table class="lines home"><tbody>${bd.topCustomers.map(c => `<tr><td>${esc(c.customer)}</td><td class="num">${g(c.net)}</td><td class="num">${c.share != null ? c.share + '%' : ''}</td></tr>`).join('')}</tbody></table>` : ''}</section>
    <section class="panel acc"><div class="ph"><h3>Analysis</h3><span class="note">${saved ? `written ${new Date(saved.madeAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} from the figures above` : 'written by AI from the figures above'}</span>
      <div class="hbtns" style="margin-left:auto"><button class="btn${saved ? '' : ' pri'}" type="button" data-packai ${aiBusy ? 'disabled' : ''}>${aiBusy ? 'Writing…' : saved ? 'Write it again' : 'Write the analysis'}</button></div></div>
      ${aiErr ? `<div class="err">${esc(aiErr)}</div>` : ''}${saved ? analysisHtml(saved.analysis, esc) : `<p class="note">${aiBusy ? 'Reading the figures and writing the commentary: about half a minute.' : 'A plain-English commentary on the month and the year to date, with risks, actions and questions to check, for you to edit into your own words before presenting. It uses only the figures on this page.'}</p>`}
      <p class="note">Wages: payroll moves into Xero in April. Until then, wages reach Xero as the payroll bureau posts them, so a month can look light or heavy on wages.</p></section></div>`;
}

/** The pack on A4, to print or save as a PDF for Rob. */
export function packPaper(facts, saved, h) {
  const { esc, gbp } = h, g = n => gbp(n, 0), b = facts.balance, k = facts.kpis, bd = facts.board;
  return `<div class="ph">${h.logo || ''}<div><h1>Management accounts</h1><div class="dno">${esc(facts.monthName)}</div></div></div>
    ${plTable(facts, g, 'ppl')}
    <div><div class="k">Sales, last 12 months</div>${trendChart(facts.trend, g)}</div>
    <div class="two"><div><div class="k">Cash and the balance sheet</div><div class="kv">
        <span class="k">Bank at the month end</span><span>${g(facts.bank.closing)}</span><span class="k">In / out in the month</span><span>${g(facts.bank.received)} / ${g(facts.bank.spent)}</span>
        <span class="k">Owed by customers</span><span>${g(b.debtors)}${k.debtorDays != null ? ` (${k.debtorDays} days)` : ''}</span><span class="k">Owed to suppliers</span><span>${g(b.creditors)}${k.creditorDays != null ? ` (${k.creditorDays} days)` : ''}</span>
        <span class="k">VAT owed</span><span>${g(b.vat)}</span><span class="k">Net assets</span><span>${g(b.netAssets)}</span></div></div>
      <div><div class="k">Orders and deliveries</div><div class="kv">
        <span class="k">Booked in the month</span><span>${g(bd.ordersBooked.value)} (${bd.ordersBooked.count})</span><span class="k">Order book now</span><span>${g(bd.orderBookNow)}${k.orderBookMonths >= 0.1 ? ` (${k.orderBookMonths} months)` : ''}</span>
        <span class="k">On time</span><span>${bd.deliveriesInMonth ? `${bd.onTimePct}% of ${bd.deliveriesInMonth} deliveries` : 'no deliveries'}</span>
        ${bd.topCustomers.slice(0, 3).map((c, i) => `<span class="k">${i ? '' : 'Biggest customers'}</span><span>${esc(c.customer)} ${g(c.net)}${c.share != null ? ` (${c.share}%)` : ''}</span>`).join('')}</div></div></div>
    ${saved ? `<div><div class="k">Commentary</div>${analysisHtml(saved.analysis, esc)}</div>` : ''}
    <div class="foot">Clarke Lane Engineering Ltd. Management accounts for ${esc(facts.monthName)}, prepared from Xero and the job board on ${esc(facts.asAt)}. Unaudited.</div>`;
}
