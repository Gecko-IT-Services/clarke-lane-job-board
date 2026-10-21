/**
 * Shop floor: the shared walk-up touchscreen. Station tiles first; a station (or All jobs) shows one
 * card per job with its whole route of processes as big steps to tap. What waits where comes from
 * floorQueue() / floorStations() in core/jobs.js (tested); this file only draws it.
 * h: the formatting helpers from app.js. Never shows prices.
 */
import { jobMood } from './core/mood.js';
import { moodIcon } from './mood.js';
import { floorQueue, floorStations, nextStep, partsLeft, lineHtml, dayNo, needed, allDone, nextDue, deliveryLabel, SHORT } from './core/jobs.js';
import { OUT_PROCESSES, outBoard, outNow, suppliersUsed } from './core/outwork.js';
import { noteSummary, newNotes } from './core/notes.js';
import { floorNoteStrip } from './notes.js';

const count = (n, w, many = w + 's') => `${n} ${n === 1 ? w : many}`;
export const clockHtml = now => `<b>${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;

export function renderShopFloor({ jobs, today, station, now, kiosk, canMove = false, outwork = [], outForm = null, canRemove = false, notes = [], office = false }, h) {
  const { esc, fmt, fmtTime, TICK } = h;
  const bar = inner => `<div class="kbar">${inner}<div class="clock" id="fclock">${clockHtml(now)}</div></div>`;

  if (outForm) return sendForm(jobs, outwork, outForm, canRemove, today, bar, h);
  if (station === 'out') return outView(jobs, outwork, today, bar, h);

  if (!station) {
    const ob = outBoard(outwork, jobs, today);
    const outTile = `<button type="button" class="tile${ob.late.length ? ' hot' : ''}${ob.out.length || ob.ready.length ? '' : ' idle'}" data-station="out">
      <span class="nm">Sent out</span><span><span class="ct"><b>${ob.out.length}</b>at other companies</span>
      ${ob.late.length ? `<span class="tag late">${ob.late.length} overdue back</span>` : ''}${ob.ready.length ? `<span class="tag soon">${ob.ready.length} ready to go</span>` : !ob.late.length ? '<span class="tag">Powder coat, plating</span>' : ''}</span></button>`;
    const tiles = floorStations(jobs, today).map(s => `<button type="button" class="tile${s.late ? ' hot' : ''}${s.waiting ? '' : ' idle'}" data-station="${esc(s.p)}">
      <span class="nm">${esc(s.p)}</span><span><span class="ct"><b>${s.waiting}</b>${s.waiting === 1 ? 'job' : 'jobs'} waiting</span>
      ${s.late ? `<span class="tag late">${s.late} late</span>` : s.waiting ? '<span class="tag ok">On time</span>' : '<span class="tag">Nothing waiting</span>'}</span></button>`).join('');
    const fresh = newNotes(notes, office, floorQueue(jobs, 'all'));
    const noteBar = fresh.length ? `<button type="button" class="fnotebar" data-station="all"><b>${fresh.length === 1 ? '1 new note' : fresh.length + ' new notes'}</b> from ${office ? 'the shop floor' : 'the office'}: “${esc(fresh[0].body)}”<span>See all jobs →</span></button>` : '';
    return `<div class="kiosk">${bar('<div><h2>Shop floor</h2><p class="sub">Tap your station</p></div>')}${noteBar}
      <div class="tiles">${tiles}${outTile}</div>
      <div class="kfoot"><button type="button" class="btn" data-station="all">All jobs <em>${floorQueue(jobs, 'all').length}</em></button>
        <button type="button" class="btn" data-kiosk="${kiosk ? 'off' : 'on'}" aria-pressed="${!!kiosk}">${kiosk ? 'Leave kiosk mode' : 'Kiosk mode'}</button>
        <button type="button" class="btn" data-tvopen title="The whiteboard for the workshop TV: display only, updates by itself. Esc comes back here.">TV board</button>
        <span class="note">Updates by itself. Goes back to this screen after 2 minutes untouched.</span></div></div>`;
  }

  const isAll = station === 'all', list = floorQueue(jobs, station), open = isAll ? list : floorQueue(jobs, 'all');
  const parts = j => partsLeft(j).map(r =>
    `<span><b>${r.left}</b> × ${lineHtml({ partNo: r.partNo, part: r.desc }, esc)}${r.next && r.next !== r.left ? ` (${r.next} for the next delivery)` : ''}</span>`).join('');
  // Station order (Levi and Mandy only, 20 Oct): move a job up or down at this station alone.
  const moving = canMove && !isAll, placed = moving && list.some(j => j.procs[station].place != null);
  const move = (j, i) => !moving ? `<span class="pos">${i + 1}</span>`
    : `<span class="smove"><span class="pos">${i + 1}</span><span class="sbtns">
        <button type="button" class="btn" data-smove="top" data-job="${j.id}" aria-label="${esc(j.so)} to the top at ${esc(station)}" ${i === 0 ? 'disabled' : ''}>⤒</button>
        <button type="button" class="btn" data-smove="up" data-job="${j.id}" aria-label="${esc(j.so)} up one at ${esc(station)}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" class="btn" data-smove="down" data-job="${j.id}" aria-label="${esc(j.so)} down one at ${esc(station)}" ${i === list.length - 1 ? 'disabled' : ''}>▼</button></span></span>`;
  const card = (j, i) => {
    const held = j.status === 'held', ready = !held && allDone(j), due = nextDue(j);
    const late = due && due < today, days = late ? dayNo(today) - dayNo(due) : 0, soon = !late && due && dayNo(due) - dayNo(today) <= 7;
    const ahead = (j.priority != null && open.slice(open.indexOf(j) + 1).some(o => nextDue(o) < due))   // above a job due sooner
      || (!isAll && j.procs[station].place != null && list.slice(i + 1).some(o => nextDue(o) < due));
    const chips = [`<span class="fmood">${moodIcon(jobMood({ held, ready, late, soon }))}</span>`, late ? `<span class="tag late">${count(days, 'day')} late</span>` : due ? `<span class="tag${soon ? ' soon' : ''}">Due ${fmt(due)}</span>` : '',
      deliveryLabel(j) ? `<span class="tag">${deliveryLabel(j)}</span>` : '', ahead ? '<span class="tag late">Brought forward</span>' : ''].join('');
    const steps = needed(j).map(p => {
      const s = j.procs[p], label = s.done ? `${p} done ${fmtTime(s.at)}. Tap to undo.` : `Tap when ${p} is done`;
      return `<button type="button" class="step${s.done ? ' done' : ''}${p === station ? ' here' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}" aria-label="${esc(label)} on ${esc(j.so)}"${held ? ' disabled' : ''}>
        <span class="bx">${s.done ? TICK : ''}</span><span><b>${esc(SHORT[p])}</b><small>${s.done ? `Done ${esc(fmtTime(s.at))}` : p === station ? 'Tap when done' : 'To do'}</small></span></button>`;
    }).join('<span class="arrow" aria-hidden="true">→</span>');
    // Powder coat and plating go to another company: send it, or show where it is and take it back in.
    const outs = OUT_PROCESSES.filter(p => j.procs[p] && !j.procs[p].done).map(p => {
      const o = outNow(outwork, j.id, p);
      if (o) return `<div class="outline"><span class="tag${o.dueBack && o.dueBack < today ? ' late' : ' soon'}">${esc(SHORT[p])} out at ${esc(o.supplier)}</span>
        <span>went ${esc(fmt(o.sentOn))}${o.dueBack ? `, ${o.dueBack < today ? '<b>due back ' + esc(fmt(o.dueBack)) + '</b>' : 'due back ' + esc(fmt(o.dueBack))}` : ''}</span>
        <button type="button" class="btn" data-outback="${o.id}"${held ? ' disabled' : ''}>Back in</button><button type="button" class="btn" data-outedit="${o.id}">Change</button></div>`;
      return p === station || nextStep(j) === p
        ? `<div class="outline"><button type="button" class="btn" data-sendout="${esc(p)}" data-job="${j.id}"${held ? ' disabled' : ''}>Send out for ${esc(SHORT[p])}</button></div>` : '';
    }).join('');
    const n = needed(j), done = n.filter(p => j.procs[p].done).length;
    const status = held ? '<span class="tag late">On hold — don’t start</span> The office has paused this job'
      : ready ? '<span class="tag ok">✓ Ready to dispatch</span> All processes done, back to the office'
      : `${done} of ${n.length} done · next: <b>${esc(nextStep(j))}</b>`;
    return `<article class="fcard${late ? ' late' : ''}${held ? ' held' : ''}${ready ? ' ready' : ''}">
      <div class="ftop">${move(j, i)}<div><div class="cu">${esc(j.customer)}<span class="so">${esc(j.so)}</span></div><div class="parts">${parts(j)}</div></div>
        <div class="side">${chips}${j.files?.length ? `<button type="button" class="btn" data-drawing="${j.files[0].id}" data-job="${j.id}">${j.files.length > 1 ? `Drawings (${j.files.length})` : 'Drawing'}</button>` : ''}<button type="button" class="btn" data-open="${j.id}">Job details</button></div></div>
      <div class="route">${steps}</div>${outs}${floorNoteStrip(noteSummary(notes, j.id, office), j.id, h)}<p class="fstat">${status}</p></article>`;
  };
  const sub = isAll ? 'Tap any step when it is finished · tap a green step to undo it' : `${count(list.length, 'job')} waiting for ${esc(station)} · do them in this order`;
  const empty = isAll ? 'No open jobs.' : `Nothing waiting for ${esc(station)}.`;
  const reset = placed ? `<button type="button" class="btn" data-smove="reset" data-st="${esc(station)}" title="Clear the moves made at this station; it follows the running order from Jobs again">Back to the running order</button>` : '';
  return `<div class="kiosk">${bar(`<button type="button" class="back" data-stations="1">← Stations</button><div><h2>${isAll ? 'All jobs' : esc(station)}</h2><p class="sub">${sub}${moving ? ' · ⤒ ▲ ▼ change the order here only' : ''}</p></div>${reset}`)}
    <div class="fq">${list.length ? list.map(card).join('') : `<p class="allclear ok">${empty}</p>`}</div></div>`;
}

/** The whiteboard: what is at each company, what is ready to go, what came back lately. */
function outView(jobs, outwork, today, bar, h) {
  const { esc, fmt } = h;
  const b = outBoard(outwork, jobs, today);
  const due = r => !r.dueBack ? '<span class="tag">No due date</span>' : r.late ? `<span class="tag late">${count(r.late, 'day')} overdue · ${esc(fmt(r.dueBack))}</span>`
    : r.dueToday ? '<span class="tag soon">Due back today</span>' : `<span class="tag">Due back ${esc(fmt(r.dueBack))}</span>`;
  const row = r => `<article class="fcard orow${r.late ? ' late' : ''}"><div class="ftop"><div><div class="cu">${esc(r.job.customer)}<span class="so">${esc(r.job.so)}</span></div>
      <div class="parts"><span>${esc(r.items || 'Items not listed')}</span>${r.finish ? `<span><b>${esc(r.finish)}</b></span>` : ''}</div>
      <p class="fstat">${esc(SHORT[r.process])} · went ${esc(fmt(r.sentOn))} (${r.daysOut ? count(r.daysOut, 'day') + ' ago' : 'today'}) by ${esc(r.sentBy)}${r.note ? ` · ${esc(r.note)}` : ''}</p></div>
      <div class="side">${due(r)}<button type="button" class="btn" data-outback="${r.id}">Back in</button><button type="button" class="btn" data-outedit="${r.id}">Change</button></div></div></article>`;
  const groups = b.suppliers.map(g => `<section class="ogroup"><h3>${esc(g.supplier)} <small>${count(g.rows.length, 'job')}</small></h3><div class="fq">${g.rows.map(row).join('')}</div></section>`).join('');
  const ready = b.ready.length ? `<section class="ogroup"><h3>Ready to go out <small>${count(b.ready.length, 'job')}</small></h3><div class="fq">${b.ready.map(({ job: j, process: p }) => `<article class="fcard orow"><div class="ftop"><div>
      <div class="cu">${esc(j.customer)}<span class="so">${esc(j.so)}</span></div><div class="parts">${partsLeft(j).map(r => `<span><b>${r.left}</b> × ${lineHtml({ partNo: r.partNo, part: r.desc }, esc)}</span>`).join('')}</div>
      <p class="fstat">Next: <b>${esc(p)}</b></p></div><div class="side"><button type="button" class="btn" data-sendout="${esc(p)}" data-job="${j.id}">Send out</button></div></div></article>`).join('')}</div></section>` : '';
  const back = b.back.length ? `<section class="ogroup"><h3>Back in the last 2 weeks</h3><table class="lines oback"><thead><tr><th>Order</th><th>Company</th><th>What</th><th>Went</th><th>Back</th></tr></thead><tbody>
      ${b.back.map(r => `<tr><td><b>${esc(r.job.so)}</b> ${esc(r.job.customer)}</td><td>${esc(r.supplier)}</td><td>${esc(SHORT[r.process])}${r.finish ? ' · ' + esc(r.finish) : ''}</td><td>${esc(fmt(r.sentOn))}</td><td>${esc(fmt(r.backOn))}${r.backBy ? ' · ' + esc(r.backBy) : ''}</td></tr>`).join('')}</tbody></table></section>` : '';
  const sub = b.out.length ? `${count(b.out.length, 'job')} at ${count(b.suppliers.length, 'company', 'companies')}${b.late.length ? ` · <b>${b.late.length} overdue back</b>` : ''}` : 'Nothing out at the moment';
  return `<div class="kiosk">${bar(`<button type="button" class="back" data-stations="1">← Stations</button><div><h2>Sent out</h2><p class="sub">${sub} · powder coat and plating done by other companies</p></div>`)}
    ${groups || '<p class="allclear ok">Nothing is out at another company.</p>'}${ready}${back}</div>`;
}

/** Sending a job out, or changing a send. f: { id?, jobId, process, supplier, items, finish, sentOn, dueBack, note }. */
function sendForm(jobs, outwork, f, canRemove, today, bar, h) {
  const { esc } = h;
  const j = jobs.find(x => x.id === f.jobId);
  const choices = j ? OUT_PROCESSES.filter(p => j.procs[p]) : [f.process];
  const sups = suppliersUsed(outwork);
  return `<div class="kiosk">${bar(`<button type="button" class="back" data-outcancel="1">← Cancel</button><div><h2>${f.id ? 'Change' : 'Send out'} ${esc(j?.so || '')}</h2><p class="sub">${esc(j?.customer || '')}</p></div>`)}
    <form class="oform" id="outf" autocomplete="off">
      ${choices.length > 1 ? `<label class="fl">Going out for<select id="out-proc">${choices.map(p => `<option${p === f.process ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : `<input type="hidden" id="out-proc" value="${esc(f.process)}">`}
      <label class="fl">Company<input type="text" id="out-sup" list="out-sups" required value="${esc(f.supplier)}" placeholder="Who is doing the ${esc(f.process === "P/Coat Paint" ? "powder coat" : "plating")}"><datalist id="out-sups">${sups.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist></label>
      <label class="fl">What is going<textarea id="out-items" rows="2">${esc(f.items)}</textarea></label>
      <label class="fl">${f.process === 'P/Coat Paint' ? 'Colour' : 'Finish'}<input type="text" id="out-fin" value="${esc(f.finish)}" placeholder="${f.process === 'P/Coat Paint' ? 'e.g. RAL 9005 satin' : 'e.g. clear anodise'}"></label>
      <div class="row2"><label class="fl">Went on<input type="date" id="out-sent" required value="${esc(f.sentOn)}" max="${esc(today)}"></label>
        <label class="fl">Due back<input type="date" id="out-due" value="${esc(f.dueBack || '')}"${f.dueTouched ? ' data-touched="1"' : ''}></label></div>
      <label class="fl">Note<input type="text" id="out-note" value="${esc(f.note)}" placeholder="e.g. 2 stillages, collected by their van"></label>
      <p class="bad" id="out-err" hidden></p>
      <div class="kfoot"><button type="submit" class="btn pri">${f.id ? 'Save' : 'Sent out'}</button><button type="button" class="btn" data-outcancel="1">Cancel</button>
        ${f.id && canRemove ? `<button type="button" class="btn" data-outremove="${f.id}">Remove</button>` : ''}</div>
    </form></div>`;
}
