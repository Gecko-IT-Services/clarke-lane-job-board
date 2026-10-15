/**
 * Won quotes: quotes Levi has marked Ordered (and Xero sales orders imported at changeover) waiting
 * to become sales orders, oldest first, with the ones already made and the ones marked not a job a
 * switch away. The lists, ages and totals come from wonQuotes() in core/jobs.js (tested); this file
 * only draws them, with Home's cards and table. h: the formatting helpers from app.js.
 */
import { wonQuotes, quoteAgeTone } from './core/jobs.js';
import { card } from './home.js';
import { icon } from './icons.js';

const days = n => `${n} day${n === 1 ? '' : 's'}`;

export function renderWon({ rows, today, view, reading, error, converting, open, detail }, h) {
  const { esc, fmt, gbp } = h;
  const w = wonQuotes(rows, today);
  const oldTone = w.oldest ? quoteAgeTone(w.oldest.age) : '';
  const unsure = reading || !!error;   // SharePoint not read: the numbers would only count Xero imports
  const cards = [
    // Each card opens the list behind its number (the oldest one opens that quote's lines).
    card('warn', 'quote', unsure ? '—' : w.waiting.length, w.waiting.length ? `Waiting · ${gbp(w.waitingValue)}` : 'Waiting', !reading && w.waiting.length > 0,
      'data-wondrill="waiting" title="Show the quotes waiting"'),
    card(oldTone === 'late' ? 'bad' : 'warn', 'late', !unsure && w.oldest ? days(w.oldest.age) : '—',
      !unsure && w.oldest ? `Oldest waiting · ${esc(w.oldest.customer)}` : 'Oldest waiting', !unsure && oldTone !== '',
      w.oldest ? `data-wondrill="oldest" data-key="${esc(w.oldest.key)}" title="Open the oldest quote"` : ''),
    card('ok', 'ready', unsure ? '—' : w.madeThisWeek, 'Made into orders this week', !unsure && w.madeThisWeek > 0, 'data-wondrill="week" title="Show the ones made this week"'),
    card('info', 'book', unsure ? '—' : gbp(w.wonMonthValue), `Won this month · ${w.wonMonth} quote${w.wonMonth === 1 ? '' : 's'}`, !reading && w.wonMonth > 0,
      'data-wondrill="month" title="Show everything won this month"'),
  ].join('');

  const who = r => `<b>${esc(r.customer)}</b><span class="ref mono">${esc(r.ref)} · ${r.kind === 'xero' ? 'Xero import' : 'quote'}</span>`;
  const won = r => `${r.date ? fmt(r.date) : '—'}${r.age != null ? ` <span class="chip ${quoteAgeTone(r.age)}">${days(r.age)}</span>` : ''}`;
  const act = r => {
    if (r.state === 'job') return `<button class="btn sm" type="button" data-open="${r.jobId}">Open ${esc(r.so)}</button>`;
    if (r.state === 'dismissed') return r.kind === 'xero'
      ? `<button class="btn sm" type="button" data-xrestore="${esc(r.xeroId)}">Put back</button>`
      : `<button class="btn sm" type="button" data-restore="${r.spId}">Put back</button>`;
    if (r.kind !== 'xero' && converting === r.spId) return '<span class="note">Reading the lines…</span>';
    const make = r.kind === 'xero' ? `data-fromxero="${esc(r.xeroId)}"` : `data-start="${r.spId}"`;
    const drop = r.kind === 'xero'
      ? `data-xdismiss="${esc(r.xeroId)}" title="Stop offering this sales order here. Xero is not changed."`
      : `data-dismiss="${r.spId}" title="Stop offering this quote here. The quote itself is not changed."`;
    return `<button class="btn sm pri" type="button" ${make}>Create sales order</button> <button class="btn sm" type="button" ${drop}>Not a job</button>`;
  };
  const isOpen = r => open === r.key;
  const row = r => `<tr class="${isOpen(r) ? 'open' : ''}"><td>${who(r)}<button type="button" class="btn link sm wlines" data-wonlines="${esc(r.key)}" aria-expanded="${isOpen(r)}">${isOpen(r) ? 'Hide lines' : 'Lines'}</button></td><td>${won(r)}</td><td>${esc(r.who || '')}</td>
    <td class="num">${r.net != null ? gbp(r.net, 2) : ''}</td><td class="act">${act(r)}</td></tr>
    ${isOpen(r) ? `<tr class="wdetail"><td colspan="5">${detail(r)}</td></tr>` : ''}`;

  const VIEWS = {
    waiting: { list: w.waiting, n: w.waiting.length, tab: 'Waiting', title: 'Waiting to become sales orders', sub: 'oldest first',
      empty: 'All clear — every won quote is a sales order.' },
    made: { list: w.made.slice(0, 20), n: w.made.length, tab: 'Made into orders', title: 'Made into orders', sub: 'latest 20',
      empty: 'No won quotes have been made into orders yet.' },
    gone: { list: w.gone, n: w.gone.length, tab: 'Not a job', title: 'Marked not a job', sub: 'the quotes themselves are unchanged',
      empty: 'Nothing marked not a job.' },
  };
  // Opened from a card, not on the switch: back to the three views with the ✕.
  const DRILL = {
    week: { list: w.madeWeek, title: 'Made into orders this week', sub: 'since Monday', empty: 'None made into orders this week yet.' },
    month: { list: w.month, title: 'Won this month', sub: `everything won since the 1st, not marked not a job`, empty: 'Nothing won this month yet.' },
  };
  const v = VIEWS[view] || DRILL[view] ? view : 'waiting', V = VIEWS[v] || DRILL[v];
  const head = '<thead><tr><th>Customer</th><th>Won</th><th>Contact</th><th class="num">Value</th><th class="act"><span class="sr">Action</span></th></tr></thead>';
  const table = !reading && V.list.length
    ? `<div class="tbl-wrap"><table class="lines home">${head}<tbody>${V.list.map(row).join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear${!reading && !error && v === 'waiting' ? ' ok' : ''}">${reading ? 'Reading the quotes…' : error ? 'Could not read the quotes, so this list may be incomplete.' : V.empty}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Which won quotes to show">${Object.entries(VIEWS).map(([k, x]) =>
    `<button type="button" data-wonview="${k}" aria-pressed="${k === v}">${x.tab} <em>${x.n}</em></button>`).join('')}</div>`
    + (DRILL[v] ? ` <button type="button" class="btn sm" data-wonview="waiting" title="Back to the quotes waiting">✕ Close this list</button>` : '');
  const err = error ? `<div class="err"><b>Could not read the quotes from SharePoint.</b> ${esc(error)} <button class="btn sm" type="button" data-reloadquotes>Try again</button></div>` : '';

  return `<div class="home">
    <div class="hhead"><div><h2>Won quotes</h2><p class="sub">Quotes Levi has marked Ordered in the quote calculator, and sales orders brought in from Xero</p></div>
      <div class="hbtns"><button class="btn" type="button" data-reloadquotes>${icon('refresh')}Refresh</button><button class="btn pri" type="button" data-neworder>${icon('plus')}New order</button></div></div>
    ${err}
    <div class="hcards">${cards}</div>
    <section id="won-list"><div class="hsec-h"><h3>${V.title}</h3><span class="note">${V.sub}</span>${seg}</div>${table}</section>
  </div>`;
}
