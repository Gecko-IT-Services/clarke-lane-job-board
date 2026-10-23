/**
 * Keith's Accounts page (Philip, 23 Oct): for the accounts login only. Four sections, each what the board knows that
 * Xero does not: drafts to approve with their proof of delivery, the month-end cut-off, purchase orders against the
 * supplier bills, and money coming in. Read only: nothing here changes Xero or the board. The figures come from
 * core/accounts.js (tested); this file only draws them. h: the formatting helpers from app.js.
 */
import { card } from './home.js';
import { draftsToApprove, cutOff, moneyIn, matchPurchases, outworkWithoutBill } from './core/accounts.js';
import { lineHtml } from './core/jobs.js';

const STATUS = { DRAFT: 'Draft', SUBMITTED: 'Awaiting approval', AUTHORISED: 'Approved', BILLED: 'Billed' };

export function renderAccounts({ jobs, today, me, inv, invErr, debts, debtErr, purchases, purErr, outwork, chases, view = 'look', loading }, h) {
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

  // 4. Money coming in.
  const m = debts ? moneyIn(debts, jobs, chases, today) : null;
  const inBox = `<section class="panel acc"><div class="ph"><h3>Money coming in</h3><span class="note">approved invoices not yet paid, by due date</span></div>
    ${!m ? wait(debtErr, 'Unpaid invoices') : `<div class="acc-kv">
      <div class="${m.overdue ? 'bad' : ''}"><b>${money(m.overdue)}</b><span>Overdue</span></div><div><b>${money(m.week)}</b><span>Due in the next 7 days</span></div>
      <div><b>${money(m.month)}</b><span>Due in 8 to 30 days</span></div><div><b>${money(m.later)}</b><span>Later</span></div>
      <div><b>${money(m.toInvoice)}</b><span>To invoice in the next 4 weeks (order book due by then)</span></div></div>
      ${m.late.length ? `<div class="tbl-wrap"><table class="lines home"><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th class="num">Owed</th><th>Last chased</th></tr></thead><tbody>
        ${m.late.slice(0, 25).map(x => `<tr><td class="mono">${esc(x.number)}</td><td>${esc(x.customer)}</td><td>${fmt(x.due)}${x.days != null ? ` <span class="note">${x.days} days</span>` : ''}</td><td class="num">${money(x.owed)}</td>
          <td>${x.chased ? `${fmt(x.chased.at.slice(0, 10))} by ${esc(x.chased.by)}` : '<span class="note">not from the board</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}`}</section>`;

  const cards = [
    card('warn', 'invoice', drafts ? drafts.length : '…', 'Drafts to approve', !!drafts?.some(r => r.flags.length)),
    card('info', 'truck', money(c.deliveredTotal), 'Delivered, not invoiced', c.deliveredTotal > 0),
    card('warn', 'doc', p ? look : '…', 'Purchase orders to check', look > 0),
    card('warn', 'late', m ? money(m.overdue) : '…', 'Overdue', !!m?.overdue),
  ].join('');
  return `<div class="home acc-page"><div class="hhead"><div><h2>Accounts</h2><p class="sub">For ${esc(me?.name || 'Keith')}. Read only: nothing here changes Xero or the board.</p></div>
      <div class="hbtns"><button class="btn" type="button" data-accrefresh ${loading ? 'disabled' : ''}>${loading ? 'Reading Xero…' : 'Read Xero again'}</button></div></div>
    <div class="hcards">${cards}</div>${draftBox}${poBox}${cutBox}${inBox}</div>`;
}
