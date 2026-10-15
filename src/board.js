/**
 * Jobs: what is being made, in the running order. Home's cards, then one table switching Not started /
 * In progress / Finished, with one tick pill per process the job needs. The lists come from
 * boardLists() and dashboard() in core/jobs.js (tested); this file only draws them.
 * h: the formatting helpers from app.js. Returns the visible rows too, for moving jobs.
 */
import { boardLists, dashboard, byRunningOrder, needed, allDone, nextDue, value, lastDespatch, SHORT } from './core/jobs.js';
import { card } from './home.js';

export function renderBoard({ jobs, today, office, stageKey, search, anyPlaced }, h) {
  const { esc, fmt, fmtTime, gbp, dueChip, statusChips, match, TICK } = h;
  const L = boardLists(jobs), d = dashboard(jobs, today);
  const rank = new Map([...L.upcoming, ...L.current].sort(byRunningOrder).map((j, i) => [j.id, i + 1]));
  const cards = [
    card('bad', 'late', d.late.length, office && d.late.length && d.lateValue != null ? `Late · ${gbp(d.lateValue)}` : 'Late', d.late.length > 0),
    card('info', 'start', L.upcoming.length, 'Not started', false),
    card('info', 'making', L.current.length, 'In progress', L.current.length > 0),
    card('ok', 'ready', d.ready.length, 'Ready to dispatch', d.ready.length > 0),
  ].join('');

  const STAGES = { upcoming: 'Not started', current: 'In progress', completed: 'Finished' };
  const st = STAGES[stageKey] ? stageKey : 'current', done = st === 'completed';
  const q = (search || '').trim().toLowerCase();
  const all = L[st].filter(j => !q || match(j, q));
  const list = done && !q ? all.slice(0, 50) : all;
  const canMove = office && !done && !q;
  const toSend = list.reduce((a, j) => a + (value(j, { remaining: true }) || 0), 0);

  const pill = (j, p) => {
    const s = j.procs[p], title = s.done ? `${p} done by ${s.by}, ${fmtTime(s.at)}` : `Mark ${p} done`;
    return `<button type="button" class="pt${s.done ? ' done' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}" title="${esc(title)}"><span class="bx">${s.done ? TICK : ''}</span>${esc(SHORT[p])}</button>`;
  };
  const mv = (j, how, sym, label, off) => `<button type="button" class="btn sm" data-move="${how}" data-job="${j.id}" title="${label}" aria-label="${label}: ${esc(j.so)}" ${off ? 'disabled' : ''}>${sym}</button>`;
  const ord = j => (done ? '' : `<td class="ord"><span class="n ${j.priority != null ? 'placed' : ''}" title="${j.priority != null ? 'Brought forward' : 'In date order'}">${rank.get(j.id) ?? ''}</span>${canMove
    ? `<span class="mv">${mv(j, 'top', '⤒', 'Bring to the top')}${mv(j, 'up', '▲', 'Up one', list[0] === j)}${mv(j, 'down', '▼', 'Down one', list[list.length - 1] === j)}</span>` : ''}</td>`);
  const row = j => `<tr data-open="${j.id}" class="${!done && allDone(j) && j.status === 'open' ? 'ready' : ''}">${ord(j)}
    <td><b>${esc(j.customer)}</b><span class="ref mono">${esc(j.so)} · ${j.po ? esc(j.po) : 'no PO'}</span><div class="chips">${statusChips(j)}</div></td>
    <td>${done ? `<span class="chip">sent ${fmt(lastDespatch(j))}</span>` : dueChip(nextDue(j))}</td>
    <td>${needed(j).map(p => pill(j, p)).join('') || '<span class="note">No processes</span>'}</td>
    ${office ? `<td class="num">${gbp(done ? value(j) : value(j, { remaining: true }), 2)}</td>` : ''}</tr>`;
  const head = `<thead><tr>${done ? '' : '<th class="ord">Order</th>'}<th>Customer</th><th>${done ? 'Dispatched' : 'Due'}</th><th>Processes</th>${office ? `<th class="num">${done ? 'Value' : 'Outstanding'}</th>` : ''}</tr></thead>`;
  const empty = jobs.length ? (q ? 'No jobs match that search.' : 'No jobs here.')
    : (office ? 'No jobs yet. Make one from Won quotes, or press New order on Sales orders.' : 'No jobs yet. They appear here once the office creates them.');
  const table = list.length
    ? `<div class="tbl-wrap"><table class="lines home board">${head}<tbody>${list.map(row).join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear">${empty}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Job stage">${Object.entries(STAGES).map(([k, t]) =>
    `<button type="button" data-stage="${k}" aria-pressed="${k === st}">${t} <em>${L[k].length}</em></button>`).join('')}</div>`;
  const find = `<input type="search" id="search" placeholder="Search customer, SO, PO or part" aria-label="Search jobs" value="${esc(search || '')}">`;
  const sub = done ? (q ? `${list.length} found` : 'latest 50, newest first') : `running order${office && list.length ? ` · ${gbp(toSend)} still to dispatch` : ''}`;
  const note = `Click a process to tick it. Click a row for the full order.${office && !done
    ? (canMove ? ' Use ⤒ ▲ ▼ to bring a job forward; the shop floor follows this order.' : ' Clear the search to move jobs.') : ''}${office && anyPlaced && !done
    ? ' <button type="button" class="btn link sm" data-move="reset">Put everything back in date order</button>' : ''}`;

  return { list, html: `<div class="home">
    <div class="hhead"><div><h2>Jobs</h2><p class="sub">What is being made, in the running order. Tick a process when it is finished.</p></div>
      <div class="hbtns"><button class="btn" type="button" data-tab="dispatch">Dispatch</button></div></div>
    <div class="hcards">${cards}</div>
    <section><div class="hsec-h"><h3>${STAGES[st]}</h3><span class="note">${sub}</span>${seg}${find}</div>${table}<p class="note">${note}</p></section>
  </div>` };
}
