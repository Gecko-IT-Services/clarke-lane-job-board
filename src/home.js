/**
 * Home: problems first. Four summary cards, the stations with work waiting, then one table that
 * switches between "Needs attention" and "Going out". The numbers and the row order come from
 * dashboard() and attention() in core/jobs.js (tested); this file only draws them.
 * h: the formatting helpers from app.js.
 */
import { dashboard, attention, PROCESSES, needed, allDone, deliveryLabel, nextDue, value, despatchValue } from './core/jobs.js';

const ICON = {
  late: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  soon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ready: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  book: '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>',
  quote: '<path d="M4 4h16v12H5l-1 4z"/><path d="M8 9h8M8 12h5"/>',
  hold: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  invoice: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  start: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l1 8v6H4v-6z"/>',
  making: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** A summary card. It only takes its colour when there is something to see. label/shown are HTML: escape before passing. */
export const card = (tone, ic, shown, label, on) =>
  `<div class="hcard${on ? ' t-' + tone : ''}"><span class="ic">${icon(ic)}</span><div><b>${shown}</b><span>${label}</span></div></div>`;

export function renderHome({ jobs, me, office, today, wonQuotes, view }, h) {
  const { esc, fmt, gbp } = h;
  const d = dashboard(jobs, today);
  const hour = new Date().getHours();
  const hello = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${office && me?.name ? ', ' + esc(me.name.split(' ')[0]) : ''}`;
  const longDate = new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const btns = office
    ? '<button class="btn" type="button" data-tab="dispatch">Dispatch</button><button class="btn pri" type="button" data-neworder>New order</button>'
    : '<button class="btn pri" type="button" data-tab="floor">Shop floor</button>';

  const cards = [
    card('bad', 'late', d.late.length, office && d.late.length && d.lateValue != null ? `Running late · ${gbp(d.lateValue)}` : 'Running late', d.late.length > 0),
    card('warn', 'soon', d.soon.length, 'Due in the next 7 days', d.soon.length > 0),
    card('ok', 'ready', d.ready.length, 'Ready to dispatch', d.ready.length > 0),
    office && d.orderBook != null ? card('info', 'book', gbp(d.orderBook), `Order book · ${d.open.length} open`, d.open.length > 0)
      : card('info', 'book', d.open.length, 'Open jobs', d.open.length > 0),
  ].join('');

  const busy = PROCESSES.filter(p => d.stations[p]).sort((a, b) => d.stations[b] - d.stations[a]);
  const most = Math.max(1, ...busy.map(p => d.stations[p]));
  const snap = busy.length
    ? `<div class="snap">${busy.map(p => {
      const n = d.stations[p], late = d.stationLate[p];
      return `<button type="button" class="st" data-gostation="${esc(p)}" title="Open the shop floor at ${esc(p)}">
        <span class="r1"><b>${esc(p)}</b><span>${n} <small>${n === 1 ? 'job' : 'jobs'}</small></span></span>
        ${late ? `<span class="chip late">${late} late</span>` : '<span class="chip ok">On time</span>'}
        <span class="sbar${late ? ' late' : ''}"><span style="width:${Math.round(100 * n / most)}%"></span></span></button>`;
    }).join('')}</div>`
    : '<p class="note">Nothing waiting at any station.</p>';

  const todo = j => { const l = needed(j).filter(p => !j.procs[p].done); return l.length ? l.map(p => `<span class="chip">${esc(p)}</span>`).join(' ') : 'Nothing left'; };
  const who = (name, ref) => `<b>${esc(name)}</b><span class="ref mono">${esc(ref)}</span>`;
  const money = v => (office ? `<td class="num">${gbp(v, 2)}</td>` : '');
  const ref = j => j.so + (deliveryLabel(j) ? ' · ' + deliveryLabel(j).toLowerCase() : '');
  const openBtn = j => `<button class="btn sm" type="button" data-open="${j.id}">Open</button>`;
  const dispatchBtn = j => `<button class="btn sm pri" type="button" data-desp="${j.id}">Dispatch</button>`;
  const jobRow = (j, status, action) => `<tr data-open="${j.id}"><td>${who(j.customer, ref(j))}</td><td>${fmt(nextDue(j))}</td>
    <td>${todo(j)}</td><td>${status}</td>${money(value(j, { remaining: true }))}<td class="act">${action}</td></tr>`;
  const heldChip = j => (j.status === 'held' ? ' <span class="chip soon">On hold</span>' : '');

  const ROW = {
    late: r => jobRow(r.job, `<span class="chip late">${plural(r.days, 'day')} late</span>${heldChip(r.job)}`, openBtn(r.job)),
    risk: r => jobRow(r.job, '<span class="chip soon">At risk</span>', openBtn(r.job)),
    held: r => jobRow(r.job, '<span class="chip soon">On hold</span>', openBtn(r.job)),
    ready: r => jobRow(r.job, '<span class="chip ok">Ready</span>', dispatchBtn(r.job)),
    quotes: r => `<tr><td>${who(`${plural(r.count, 'won quote')} waiting`, 'Won quotes tab')}</td><td></td>
      <td>Make ${r.count === 1 ? 'it a sales order' : 'them sales orders'}</td><td><span class="chip">Won quote</span></td>${money(null)}
      <td class="act"><button class="btn sm" type="button" data-tab="quotes">Make order</button></td></tr>`,
    invoice: r => `<tr data-open="${r.job.id}"><td>${who(r.job.customer, r.despatch.dn)}</td><td>Delivered ${fmt(r.despatch.deliveredOn)}</td>
      <td>Invoice it</td><td><span class="chip">To invoice</span></td>${money(despatchValue(r.job, r.despatch))}
      <td class="act"><button class="btn sm" type="button" data-tab="dispatch">Send to Xero</button></td></tr>`,
  };
  const outRow = j => {
    const ready = j.status === 'open' && allDone(j);
    const status = j.status === 'held' ? '<span class="chip soon">On hold</span>' : ready ? '<span class="chip ok">Ready</span>' : '<span class="chip soon">Being made</span>';
    return jobRow(j, status, ready ? dispatchBtn(j) : openBtn(j));
  };

  const rows = attention(d, { office, wonQuotes: wonQuotes || 0 });
  const isOut = view === 'out';
  const body = isOut ? d.goingOut.map(outRow) : rows.map(r => ROW[r.kind](r));
  const head = `<thead><tr><th>Customer</th><th>Due</th><th>Still to do</th><th>Status</th>${office ? '<th class="num">Value</th>' : ''}<th class="act"><span class="sr">Action</span></th></tr></thead>`;
  const table = body.length
    ? `<div class="tbl-wrap"><table class="lines home">${head}<tbody>${body.join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear${isOut ? '' : ' ok'}">${isOut ? 'Nothing due out before next Friday.' : 'All clear — nothing late, at risk or waiting.'}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Show">
    <button type="button" data-homeview="attention" aria-pressed="${!isOut}">Needs attention <em>${rows.length}</em></button>
    <button type="button" data-homeview="out" aria-pressed="${isOut}">Going out <em>${d.goingOut.length}</em></button></div>`;

  return `<div class="home">
    <div class="hhead"><div><h2>${hello}</h2><p class="sub">${longDate} · ${d.ticksToday} process${d.ticksToday === 1 ? '' : 'es'} ticked off today</p></div><div class="hbtns">${btns}</div></div>
    <div class="hcards">${cards}</div>
    <section><div class="hsec-h"><h3>Station snapshot</h3><span class="note">open jobs still needing each process</span><a href="#floor" data-tab="floor">Open shop floor →</a></div>${snap}</section>
    <section><div class="hsec-h"><h3>${isOut ? 'Going out this week and next' : 'Needs attention'}</h3>${seg}</div>${table}</section>
  </div>`;
}
