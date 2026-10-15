/**
 * Home: the morning view. What is late, what is due this week, what is ready to go, where work is
 * queuing, and (office only) the money waiting. Numbers come from dashboard() in core/jobs.js
 * (tested); this file only draws them. h: the formatting helpers from app.js.
 */
import { dashboard, PROCESSES, needed, deliveryLabel, nextDue, value } from './core/jobs.js';

export function renderHome({ jobs, me, office, today, wonQuotes }, h) {
  const { esc, fmt, fmtLong, gbp, dueChip } = h;
  const d = dashboard(jobs, today);
  const hour = new Date().getHours();
  const hello = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${me?.name ? ', ' + esc(me.name.split(' ')[0]) : ''}`;

  const tile = (n, label, sub, { tone = '', href = '', tab = '' } = {}) =>
    `<a class="tile ${tone}" ${tab ? `href="#${tab}" data-tab="${tab}"` : `href="${href}"`}><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</a>`;
  const tiles = [
    tile(d.late.length, 'Running late', d.late.length && office ? `${gbp(d.lateValue)} still to send` : d.late.length ? 'past their due date' : 'nothing late', { tone: d.late.length ? 'bad' : 'ok', href: '#home-late' }),
    tile(d.soon.length, 'Due in the next 7 days', '', { tone: d.soon.length ? 'warn' : '', href: '#home-soon' }),
    tile(d.ready.length, 'Ready to dispatch', 'every process ticked', { tone: d.ready.length ? 'go' : '', tab: 'dispatch' }),
    tile(d.out.length, 'Out for delivery', 'not marked delivered yet', { tab: 'dispatch' }),
    office ? tile(d.toXero.length, 'Waiting for Xero', d.toXero.length ? `${gbp(d.toXeroValue, 2)} to invoice` : 'all invoiced', { tone: d.toXero.length ? 'warn' : '', tab: 'dispatch' }) : '',
    office ? tile(wonQuotes ?? '…', 'Won quotes waiting', 'to become sales orders', { tone: wonQuotes ? 'warn' : '', tab: 'quotes' }) : '',
    office ? tile(gbp(d.orderBook), 'Order book', `${d.open.length} open orders, still to send`, { tab: 'orders' }) : tile(d.open.length, 'Open jobs', 'on the board', { tab: 'jobs' }),
    office ? tile(gbp(d.thisWeekValue), 'Dispatched this week', `${d.thisWeek.length} dispatch note${d.thisWeek.length === 1 ? '' : 's'} since Monday`, { tab: 'dispatch' }) : '',
  ].join('');

  const left = j => needed(j).filter(p => !j.procs[p].done);
  const row = (j, lead) => `<tr data-open="${j.id}">${lead}<td class="mono">${esc(j.so)}</td><td style="text-align:left"><b>${esc(j.customer)}</b>${j.status === 'held' ? ' <span class="chip late">On hold</span>' : ''}</td>
    <td>${fmt(nextDue(j))}${deliveryLabel(j) ? ` <span class="note">${deliveryLabel(j)}</span>` : ''}</td>
    <td style="text-align:left">${left(j).length ? left(j).map(p => `<span class="chip">${esc(p)}</span>`).join(' ') : '<span class="chip ok">Ready to dispatch</span>'}</td>
    ${office ? `<td class="num">${gbp(value(j, { remaining: true }), 2)}</td>` : ''}</tr>`;
  const head = first => `<thead><tr>${first}<th>Order</th><th style="text-align:left">Customer</th><th>Due</th><th style="text-align:left">Still to do</th>${office ? '<th>Outstanding</th>' : ''}</tr></thead>`;

  const lateTable = d.late.length
    ? `<div class="tbl-wrap"><table class="lines home">${head('<th>Late by</th>')}<tbody>${d.late.map(x => row(x.job, `<td><span class="chip late">${x.days} day${x.days === 1 ? '' : 's'}</span></td>`)).join('')}</tbody></table></div>
       <p class="note">Worst first. Click a job to open it.${office ? ' To get one done sooner, bring it forward on Jobs (⤒); if the customer has agreed a new date, Amend the order.' : ''}</p>`
    : '<div class="empty">Nothing is late.</div>';
  const soonTable = d.soon.length
    ? `<div class="tbl-wrap"><table class="lines home">${head('<th>Due</th>')}<tbody>${d.soon.map(j => row(j, `<td>${dueChip(nextDue(j))}</td>`)).join('')}</tbody></table></div>`
    : '<div class="empty">Nothing due in the next 7 days.</div>';

  const most = Math.max(1, ...PROCESSES.map(p => d.stations[p]));
  const bars = PROCESSES.map(p => `<button type="button" class="bar" data-gostation="${esc(p)}" title="Open the shop floor at ${esc(p)}">
      <span class="lbl">${esc(p)}</span><span class="track"><span class="fill" style="width:${Math.round(100 * d.stations[p] / most)}%"></span></span><b>${d.stations[p]}</b></button>`).join('');

  return `<div class="sec-h"><h2>${hello}</h2><span class="sub">${fmtLong(today)}. ${d.ticksToday} process${d.ticksToday === 1 ? '' : 'es'} ticked off today.</span></div>
    <div class="tiles">${tiles}</div>
    <div class="homegrid">
      <section class="panel ${d.late.length ? 'late' : ''}" id="home-late"><h3>Running late <span class="note">${d.late.length}</span></h3>${lateTable}</section>
      <section class="panel" id="home-soon"><h3>Due in the next 7 days <span class="note">${d.soon.length}</span></h3>${soonTable}</section>
      <section class="panel"><h3>Waiting at each station</h3><p class="note">Open jobs still needing each process. Tap one to open the shop floor at that station.</p><div class="bars">${bars}</div></section>
      ${d.held.length ? `<section class="panel"><h3>On hold <span class="note">${d.held.length}</span></h3><div class="tbl-wrap"><table class="lines home">${head('')}<tbody>${d.held.map(j => row(j, '')).join('')}</tbody></table></div></section>` : ''}
    </div>`;
}
