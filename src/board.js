/**
 * Jobs: what is being made, in the running order. Home's cards, then one table switching All open /
 * Not started / In progress / Finished, with one tick pill per process the job needs. The lists come from
 * boardLists() and dashboard() in core/jobs.js (tested); this file only draws them.
 * h: the formatting helpers from app.js. Returns the visible rows too, for moving jobs.
 */
import { boardLists, dashboard, byRunningOrder, needed, allDone, nextDue, value, lastDespatch, deliveryDates, left, monthProgress, SHORT } from './core/jobs.js';
import { card } from './home.js';
import { monthPanel } from './gauge.js';
import { icon } from './icons.js';

export function renderBoard({ jobs, today, office, md = false, monthXero = { x: null, note: '' }, stageKey, search, anyPlaced, breakeven = null, target = null, editTarget = false, byValue = false }, h) {
  const { esc, fmt, fmtTime, gbp, dueChip, statusChips, match, TICK } = h;
  const B = boardLists(jobs), d = dashboard(jobs, today);
  const L = { ...B, open: [...B.upcoming, ...B.current].sort(byRunningOrder) };
  const rank = new Map([...L.upcoming, ...L.current].sort(byRunningOrder).map((j, i) => [j.id, i + 1]));
  const cards = [
    card('bad', 'late', d.late.length, md && d.late.length && d.lateValue != null ? `Late · ${gbp(d.lateValue)}` : 'Late', d.late.length > 0),
    card('info', 'start', L.upcoming.length, 'Not started', false),
    card('info', 'making', L.current.length, 'In progress', L.current.length > 0),
    card('ok', 'ready', d.ready.length, 'Ready to dispatch', d.ready.length > 0),
  ].join('');

  const STAGES = { open: 'All open', upcoming: 'Not started', current: 'In progress', completed: 'Finished' };
  const st = STAGES[stageKey] ? stageKey : 'open', done = st === 'completed';
  const q = (search || '').trim().toLowerCase();
  const all = L[st].filter(j => !q || match(j, q));
  const sorted = md && byValue && !done;   // biggest first, to pick what to bring forward; the running order is unchanged
  if (sorted) all.sort((a, b) => (value(b, { remaining: true }) || 0) - (value(a, { remaining: true }) || 0));
  const list = done && !q ? all.slice(0, 50) : all;
  const canMove = office && !done && !q && !sorted, canTop = office && !done && !q;
  const toSend = list.reduce((a, j) => a + (value(j, { remaining: true }) || 0), 0);

  const pill = (j, p) => {
    const s = j.procs[p], title = s.done ? `${p} done by ${s.by}, ${fmtTime(s.at)}` : `Mark ${p} done`;
    const held = j.status === 'held' && !office;   // the floor can't tick a held job here either (same rule as Shop floor)
    return `<button type="button" class="pt${s.done ? ' done' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}" title="${esc(held ? 'On hold' : title)}"${held ? ' disabled' : ''}><span class="bx">${s.done ? TICK : ''}</span>${esc(SHORT[p])}</button>`;
  };
  const mv = (j, how, sym, label, off) => `<button type="button" class="btn sm" data-move="${how}" data-job="${j.id}" title="${label}" aria-label="${label}: ${esc(j.so)}" ${off ? 'disabled' : ''}>${sym}</button>`;
  const ord = j => (done ? '' : sorted ? `<td class="ord"><span class="n ${j.priority != null ? 'placed' : ''}" title="Place in the running order">${rank.get(j.id) ?? ''}</span>${canTop ? `<span class="mv">${mv(j, 'top', '⤒', 'Bring to the top')}</span>` : ''}</td>` : `<td class="ord">${canMove ? `<span class="grip" data-grip="${j.id}" title="Drag to move ${esc(j.so)} up or down" aria-hidden="true">⠿</span>` : ''}<span class="n ${j.priority != null ? 'placed' : ''}" title="${j.priority != null ? 'Brought forward' : 'In date order'}">${rank.get(j.id) ?? ''}</span>${canMove
    ? `<span class="mv">${mv(j, 'top', '⤒', 'Bring to the top')}${mv(j, 'up', '▲', 'Up one', list[0] === j)}${mv(j, 'down', '▼', 'Down one', list[list.length - 1] === j)}</span>` : ''}</td>`);
  // The office changes the due date from the list: the chip opens a date picker. With more than one
  // delivery date, only the next delivery moves (its lines still to send); Amend changes the rest.
  const due = j => {
    const nd = nextDue(j);
    if (!office) return dueChip(nd);
    const later = deliveryDates(j).filter(x => x > nd && j.lines.some(l => l.due === x && left(j, l) > 0)).length;
    return `<span class="duepick"><button type="button" class="duebtn" data-duepick="${j.id}" title="Change the due date${later ? ' of the next delivery' : ''}">${dueChip(nd)}<span class="pen">${icon('edit')}</span></button>
      <input type="date" data-setdue="${j.id}" data-from="${esc(nd || '')}" value="${esc(nd || '')}" aria-label="Due date for ${esc(j.so)}" tabindex="-1"></span>${later ? `<span class="note">+${later} later</span>` : ''}`;
  };
  const row = j => `<tr data-open="${j.id}" data-row="${j.id}" class="${!done && allDone(j) && j.status === 'open' ? 'ready' : ''}">${ord(j)}
    <td><b>${esc(j.customer)}</b><span class="ref mono">${esc(j.so)} · ${j.po ? esc(j.po) : 'no PO'}</span><div class="chips">${statusChips(j)}</div></td>
    <td>${done ? `<span class="chip">sent ${fmt(lastDespatch(j))}</span>` : due(j)}</td>
    <td>${needed(j).map(p => pill(j, p)).join('') || '<span class="note">No processes</span>'}</td>
    ${office ? `<td class="num">${gbp(done ? value(j) : value(j, { remaining: true }), 2)}</td>` : ''}</tr>`;
  const head = `<thead><tr>${done ? '' : '<th class="ord">Order</th>'}<th>Customer</th><th>${done ? 'Dispatched' : 'Due'}</th><th>Processes</th>${office ? `<th class="num">${done || !md ? (done ? 'Value' : 'Outstanding') : `<button type="button" class="thsort${sorted ? ' on' : ''}" data-jobsort title="${sorted ? 'Back to the running order' : 'Biggest jobs first'}">Outstanding ${sorted ? '▼' : '⇅'}</button>`}</th>` : ''}</tr></thead>`;
  const empty = jobs.length ? (q ? 'No jobs match that search.' : 'No jobs here.')
    : (office ? 'No jobs yet. Make one from Won quotes, or press New order on Sales orders.' : 'No jobs yet. They appear here once the office creates them.');
  const table = list.length
    ? `<div class="tbl-wrap"><table class="lines home board">${head}<tbody>${list.map(row).join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear">${empty}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Job stage">${Object.entries(STAGES).map(([k, t]) =>
    `<button type="button" data-stage="${k}" aria-pressed="${k === st}">${t} <em>${L[k].length}</em></button>`).join('')}</div>`;
  const find = `<input type="search" id="search" placeholder="Search customer, SO, PO or part" aria-label="Search jobs" value="${esc(search || '')}">`;
  const sub = done ? (q ? `${list.length} found` : 'latest 50, newest first') : `${sorted ? 'biggest first' : 'soonest due first, unless brought forward'}${md && list.length ? ` · ${gbp(toSend)} still to dispatch` : ''}`;
  const note = `Click a process to tick it. Click a row for the full order.${office && !done
    ? (sorted ? ' Sorted by value: ⤒ brings a job to the top of the running order. Click Outstanding again to go back and drag.'
      : canMove ? ' Click a due date to change it. Drag ⠿, or use ⤒ ▲ ▼, to bring a job forward; the shop floor follows this order.' : ' Clear the search to move jobs.') : ''}${office && anyPlaced && !done
    ? ' <button type="button" class="btn link sm" data-move="reset">Put everything back in date order</button>' : ''}`;

  // This month against break-even and the ideal target (MD only). The figures are typed in on the board, never in the code.
  const month = md && !done ? monthPanel({ mp: monthProgress(jobs, today, monthXero.x), xeroNote: monthXero.note, breakeven, target, edit: editTarget,
    name: new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) }, { gbp, esc, fmt }) : '';

  return { list, html: `<div class="home">
    <div class="hhead"><div><h2>Jobs</h2><p class="sub">What is being made, in the running order. Tick a process when it is finished.</p></div>
      <div class="hbtns"><button class="btn" type="button" data-tab="dispatch">${icon('truck')}Dispatch</button></div></div>
    <div class="hcards">${cards}</div>
    ${month}
    <section><div class="hsec-h"><h3>${STAGES[st]}</h3><span class="note">${sub}</span>${seg}${find}</div>${table}<p class="note">${note}</p></section>
  </div>` };
}
