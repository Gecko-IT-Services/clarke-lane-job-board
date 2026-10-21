/**
 * The workshop TV: the whiteboard, drawn by the board for a big screen nobody touches. Same columns as the
 * whiteboard (customer, job no., the processes, due date and notes), a blue tick when done, an orange star
 * when still to do (filled for the job's next step), the company's name when it is out for coating.
 * Pages through every 15 seconds when there are more jobs than fit. Rows come from tvRows() in core/tv.js.
 */
import { SHORT } from './core/jobs.js';
import { tvRows, tvColumns, tvPage } from './core/tv.js';

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 6.5"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>';
const HEAD = { 'Cut & Drill': 'Cut / Roll<br>Drill', 'Tap & C/Sink': 'Tap<br>C/Sink', 'P/Coat Paint': 'P/Coat<br>Paint', 'Plating / Anodising': 'Plating<br>Anodising' };
export const TV_ROWS = 14;

export function renderTv({ jobs, outwork, notes = [], today, now, page }, h) {
  const { esc, fmt } = h;
  const all = tvRows(jobs, outwork, today, notes), cols = tvColumns(all);
  const p = tvPage(all, TV_ROWS, page);
  const cell = c => c.state === 'done' ? `<td class="c done">${TICK}</td>`
    : c.state === 'next' ? `<td class="c next">${STAR}</td>`
    : c.state === 'todo' ? `<td class="c todo">${STAR}</td>`
    : c.state === 'out' ? `<td class="c out${c.late ? ' late' : ''}"><span>OUT</span></td>` : '<td class="c"></td>';
  const due = r => `<td class="due${r.late ? ' late' : r.soon ? ' soon' : ''}">${esc(fmt(r.due))}${r.late ? `<small>${r.late}d late</small>` : ''}</td>`;
  // A note from the office (or the shop floor) on the job comes first; the status goes underneath.
  const note = r => r.jobNote ? `<td class="note jnote${r.jobNote.fresh ? ' new' : ''}${r.held ? ' held' : ''}"><span class="tvn">${esc(r.jobNote.body)}</span><small>${esc(r.jobNote.by)}${r.note ? ' · ' + esc(r.note) : ''}</small></td>`
    : `<td class="note${r.held ? ' held' : r.ready ? ' ready' : r.outLate ? ' late' : ''}">${esc(r.note)}${r.outBack ? `<small>back ${esc(fmt(r.outBack))}</small>` : ''}</td>`;
  const rows = p.rows.map(r => `<tr class="${r.held ? 'held' : r.ready ? 'ready' : r.late ? 'late' : ''}">
      <td class="cu">${esc(r.customer)}</td><td class="so">${esc(r.so.replace(/^SO-/, ''))}</td>${cols.map(c => cell(r.cells[c])).join('')}${due(r)}${note(r)}</tr>`).join('');
  const blanks = Array.from({ length: Math.max(0, TV_ROWS - p.rows.length) }, () => `<tr class="blank"><td></td><td></td>${cols.map(() => '<td class="c"></td>').join('')}<td></td><td></td></tr>`).join('');
  const late = all.filter(r => r.late).length, ready = all.filter(r => r.ready).length, out = all.filter(r => r.note.startsWith('At ')).length;
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="tv" style="--rows:${TV_ROWS};--cols:${cols.length}">
    <header class="tvbar"><div class="tvbrand"><b>CLARKE LANE</b><span>ENGINEERING</span></div>
      <div class="tvsum"><span><b>${all.length}</b> open</span>${late ? `<span class="late"><b>${late}</b> late</span>` : ''}<span class="ready"><b>${ready}</b> ready to dispatch</span>${out ? `<span><b>${out}</b> out for coating</span>` : ''}</div>
      <div class="tvclock"><b id="tvclock">${time}</b>${esc(date)}</div></header>
    <table class="tvgrid"><thead><tr><th class="cu">Customer</th><th class="so">Job no.</th>${cols.map(c => `<th class="c">${HEAD[c] || esc(SHORT[c])}</th>`).join('')}<th class="due">Due date</th><th class="note">Notes</th></tr></thead>
      <tbody>${rows}${blanks}</tbody></table>
    <footer class="tvfoot"><span class="k done">${TICK} Done</span><span class="k next">${STAR} Next step</span><span class="k todo">${STAR} Still to do</span><span class="k out"><span>OUT</span> At another company</span>
      <span class="tvpage">${p.pages > 1 ? `Page ${p.page + 1} of ${p.pages}` : ''}</span><span class="tvhint">In the running order · updates by itself</span></footer></div>`;
}
