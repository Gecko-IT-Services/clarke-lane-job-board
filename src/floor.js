/**
 * Shop floor: the shared walk-up touchscreen. Station tiles first; a station (or All jobs) shows one
 * card per job with its whole route of processes as big steps to tap. What waits where comes from
 * floorQueue() / floorStations() in core/jobs.js (tested); this file only draws it.
 * h: the formatting helpers from app.js. Never shows prices.
 */
import { floorQueue, floorStations, nextStep, partsLeft, dayNo, needed, allDone, nextDue, deliveryLabel, SHORT } from './core/jobs.js';

const count = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const clockHtml = now => `<b>${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;

export function renderShopFloor({ jobs, today, station, now, kiosk }, h) {
  const { esc, fmt, fmtTime, TICK } = h;
  const bar = inner => `<div class="kbar">${inner}<div class="clock" id="fclock">${clockHtml(now)}</div></div>`;

  if (!station) {
    const tiles = floorStations(jobs, today).map(s => `<button type="button" class="tile${s.late ? ' hot' : ''}${s.waiting ? '' : ' idle'}" data-station="${esc(s.p)}">
      <span class="nm">${esc(s.p)}</span><span><span class="ct"><b>${s.waiting}</b>${s.waiting === 1 ? 'job' : 'jobs'} waiting</span>
      ${s.late ? `<span class="tag late">${s.late} late</span>` : s.waiting ? '<span class="tag ok">On time</span>' : '<span class="tag">Nothing waiting</span>'}</span></button>`).join('');
    return `<div class="kiosk">${bar('<div><h2>Shop floor</h2><p class="sub">Tap your station</p></div>')}
      <div class="tiles">${tiles}</div>
      <div class="kfoot"><button type="button" class="btn" data-station="all">All jobs <em>${floorQueue(jobs, 'all').length}</em></button>
        <button type="button" class="btn" data-kiosk="${kiosk ? 'off' : 'on'}" aria-pressed="${!!kiosk}">${kiosk ? 'Leave kiosk mode' : 'Kiosk mode'}</button>
        <span class="note">Updates by itself. Goes back to this screen after 2 minutes untouched.</span></div></div>`;
  }

  const isAll = station === 'all', list = floorQueue(jobs, station), open = isAll ? list : floorQueue(jobs, 'all');
  const parts = j => partsLeft(j).map(r =>
    `<span><b>${r.left}</b> × ${esc(r.part)}${r.next && r.next !== r.left ? ` (${r.next} for the next delivery)` : ''}</span>`).join('');
  const card = (j, i) => {
    const held = j.status === 'held', ready = !held && allDone(j), due = nextDue(j);
    const late = due && due < today, days = late ? dayNo(today) - dayNo(due) : 0, soon = !late && due && dayNo(due) - dayNo(today) <= 7;
    const ahead = j.priority != null && open.slice(open.indexOf(j) + 1).some(o => nextDue(o) < due);   // above a job due sooner
    const chips = [late ? `<span class="tag late">${count(days, 'day')} late</span>` : due ? `<span class="tag${soon ? ' soon' : ''}">Due ${fmt(due)}</span>` : '',
      deliveryLabel(j) ? `<span class="tag">${deliveryLabel(j)}</span>` : '', ahead ? '<span class="tag late">Brought forward</span>' : ''].join('');
    const steps = needed(j).map(p => {
      const s = j.procs[p], label = s.done ? `${p} done ${fmtTime(s.at)}. Tap to undo.` : `Tap when ${p} is done`;
      return `<button type="button" class="step${s.done ? ' done' : ''}${p === station ? ' here' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}" aria-label="${esc(label)} on ${esc(j.so)}"${held ? ' disabled' : ''}>
        <span class="bx">${s.done ? TICK : ''}</span><span><b>${esc(SHORT[p])}</b><small>${s.done ? `Done ${esc(fmtTime(s.at))}` : p === station ? 'Tap when done' : 'To do'}</small></span></button>`;
    }).join('<span class="arrow" aria-hidden="true">→</span>');
    const n = needed(j), done = n.filter(p => j.procs[p].done).length;
    const status = held ? '<span class="tag late">On hold — don’t start</span> The office has paused this job'
      : ready ? '<span class="tag ok">✓ Ready to dispatch</span> All processes done, back to the office'
      : `${done} of ${n.length} done · next: <b>${esc(nextStep(j))}</b>`;
    return `<article class="fcard${late ? ' late' : ''}${held ? ' held' : ''}${ready ? ' ready' : ''}">
      <div class="ftop"><span class="pos">${i + 1}</span><div><div class="cu">${esc(j.customer)}<span class="so">${esc(j.so)}</span></div><div class="parts">${parts(j)}</div></div>
        <div class="side">${chips}<button type="button" class="btn" data-open="${j.id}">Job details</button></div></div>
      <div class="route">${steps}</div><p class="fstat">${status}</p></article>`;
  };
  const sub = isAll ? 'Tap any step when it is finished · tap a green step to undo it' : `${count(list.length, 'job')} waiting for ${esc(station)} · do them in this order`;
  const empty = isAll ? 'No open jobs.' : `Nothing waiting for ${esc(station)}.`;
  return `<div class="kiosk">${bar(`<button type="button" class="back" data-stations="1">← Stations</button><div><h2>${isAll ? 'All jobs' : esc(station)}</h2><p class="sub">${sub}</p></div>`)}
    <div class="fq">${list.length ? list.map(card).join('') : `<p class="allclear ok">${empty}</p>`}</div></div>`;
}
