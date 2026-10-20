/**
 * Sales orders: every order with what has been dispatched and invoiced. Home's cards, then one table
 * switching Outstanding / Dispatched / On hold / Cancelled; a search looks through every order. The
 * lists and sums come from salesSummary() in core/jobs.js (tested); this file only draws them.
 * h: the formatting helpers from app.js.
 */
import { salesSummary, stage, nextDue, value, despatchStatus, invoiceStatus, compareValues, selectionTotals } from './core/jobs.js';
import { card } from './home.js';
import { icon } from './icons.js';

const orders = n => `${n} order${n === 1 ? '' : 's'}`;

export function renderSalesOrders({ jobs, md = false, today, view, search, form, selected = new Set() }, h) {
  const { esc, fmt, gbp, dueChip, match } = h;
  const s = salesSummary(jobs, today);
  const cards = [
    card('bad', 'late', s.late.length, md && s.late.length ? `Late · ${gbp(s.lateValue)}` : 'Late', s.late.length > 0),
    card('warn', 'hold', s.held.length, md && s.held.length ? `On hold · ${gbp(s.heldValue)}` : 'On hold', s.held.length > 0),
    // Totals are the MD's (Levi); the office sees counts. Each order's own value still shows in its row.
    md ? card('warn', 'invoice', gbp(s.uninvoicedValue), `Dispatched, not invoiced${s.uninvoiced ? ' · ' + orders(s.uninvoiced) : ''}`, s.uninvoicedValue > 0)
      : card('warn', 'invoice', s.uninvoiced || 0, 'Dispatched, not invoiced', s.uninvoicedValue > 0),
    md ? card('info', 'book', gbp(s.outstandingValue), `Outstanding · ${orders(s.outstanding.length)}`, s.outstanding.length > 0)
      : card('info', 'book', s.outstanding.length, 'Outstanding orders', s.outstanding.length > 0),
  ].join('');

  const VIEWS = {
    outstanding: { list: s.outstanding, tab: 'Outstanding', title: 'Outstanding orders', sub: 'soonest due first', empty: 'Nothing outstanding — every order has gone out.' },
    dispatched: { list: s.dispatched.slice(0, 50), n: s.dispatched.length, tab: 'Dispatched', title: 'Dispatched', sub: 'latest 50, newest first', empty: 'No orders here.' },
    held: { list: s.held, tab: 'On hold', title: 'On hold', sub: 'soonest due first', empty: 'No orders here.' },
    cancelled: { list: s.cancelled, tab: 'Cancelled', title: 'Cancelled', sub: 'newest first', empty: 'No orders here.' },
  };
  const v = VIEWS[view] ? view : 'outstanding', V = VIEWS[v];
  const q = (search || '').trim().toLowerCase();
  const list = q ? jobs.filter(j => match(j, q)).sort((a, b) => compareValues(a.ordered, b.ordered, -1) || compareValues(a.so, b.so, -1)) : V.list;

  const chip = (t, ok) => `<span class="chip${ok ? ' ok' : ''}">${t}</span>`;
  const progress = j => [j.status === 'cancelled' ? chip('Cancelled') : chip(despatchStatus(j), despatchStatus(j) === 'Dispatched'),
    chip(invoiceStatus(j), invoiceStatus(j) === 'Invoiced'), j.status === 'held' ? '<span class="chip late">On hold</span>' : ''].join(' ');
  const pick = j => `<td class="pick"><input type="checkbox" data-pick="${j.id}" ${selected.has(j.id) ? 'checked' : ''} aria-label="Select ${esc(j.so)} for the total"></td>`;
  const row = j => `<tr data-open="${j.id}"${selected.has(j.id) ? ' class="picked"' : ''}>${pick(j)}<td><b>${esc(j.customer)}</b><span class="ref mono">${esc(j.so)} · ${j.po ? esc(j.po) : 'no PO'}</span></td>
    <td>${fmt(j.ordered)}</td><td>${stage(j) === 'completed' || j.status === 'cancelled' ? '' : dueChip(nextDue(j))}</td>
    <td>${progress(j)}</td><td class="num">${gbp(value(j), 2)}</td></tr>`;
  const all = list.length && list.every(j => selected.has(j.id));
  const head = `<thead><tr><th class="pick"><input type="checkbox" data-pickall="${list.map(j => j.id).join(',')}" ${all ? 'checked' : ''} aria-label="Select every order shown"></th><th>Customer</th><th>Ordered</th><th>Next due</th><th>Progress</th><th class="num">Net</th></tr></thead>`;
  const table = list.length
    ? `<div class="tbl-wrap"><table class="lines home orders">${head}<tbody>${list.map(row).join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear${!q && v === 'outstanding' ? ' ok' : ''}">${q ? 'No orders match that search.' : V.empty}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Which sales orders to show">${Object.entries(VIEWS).map(([k, x]) =>
    `<button type="button" data-orderview="${k}" aria-pressed="${k === v}">${x.tab} <em>${x.n ?? x.list.length}</em></button>`).join('')}</div>`;
  const find = `<input type="search" id="osearch" placeholder="Search order, customer or PO" aria-label="Search sales orders" value="${esc(search || '')}">`;

  // The running total of ticked orders: stays in the corner while you tick (Levi, 20 Oct).
  const t = selectionTotals(jobs, selected);
  const bar = t.count ? `<aside class="selbar" aria-live="polite"><b>${orders(t.count)} selected</b>
    ${t.money ? `<span>Order value <b>${gbp(t.value, 2)}</b></span><span>Still to dispatch <b>${gbp(t.remaining, 2)}</b></span>` : '<span class="note">Some have no prices</span>'}
    <button class="btn sm" type="button" data-pickclear>Clear</button></aside>` : '';
  return `<div class="home">
    <div class="hhead"><div><h2>Sales orders</h2><p class="sub">Every order, with what has been dispatched and invoiced. Click one to open it.</p></div>
      ${form ? '' : `<div class="hbtns"><button class="btn" type="button" data-tab="customers" title="Contact book: buyers, goods in and delivery addresses">Customers</button><button class="btn" type="button" data-tab="parts" title="Repeat parts and their drawings">Parts</button><button class="btn" type="button" data-tab="metal" title="Ask several suppliers for metal prices and compare them">Metal prices</button><button class="btn pri" type="button" data-neworder>${icon('plus')}New order</button></div>`}</div>
    ${form || ''}
    <div class="hcards">${cards}</div>
    <section><div class="hsec-h"><h3>${q ? 'Search results' : V.title}</h3><span class="note">${q ? `${orders(list.length)} found` : V.sub}</span>${seg}${find}</div>${table}<p class="note">Tick orders to see their total in the corner.</p></section>
    ${bar}
  </div>`;
}
