/**
 * Notes on a job, drawn (Philip, 21 Oct): the conversation on a job's details, the strip on a shop floor card,
 * and Home's list of what the shop floor has said. Logic in core/notes.js (tested); this file only draws.
 * office: true for Levi and Mandy. Notes are words only: never a price, the shop floor reads them.
 */
import { notesFor, isNew, noteWhen } from './core/notes.js';

/** The conversation on a job's details, with the box to add one. name: who is writing ('' = ask, on the shop floor). */
export function notesPanel({ notes, job, office, name, canRemove, now = new Date() }, h) {
  const { esc } = h;
  const list = notesFor(notes, job.id);
  const bubble = n => `<li class="jn${n.fromFloor ? ' floor' : ' office'}${isNew(n, office) ? ' new' : ''}">
      <div class="jnb">${esc(n.body)}</div>
      <div class="jnm"><b>${esc(n.byName)}</b>${n.fromFloor ? ' · shop floor' : ''} · ${esc(noteWhen(n.at, now))}
        ${n.seenBy ? `<span class="jns">✓ Seen by ${esc(n.seenBy)}</span>` : isNew(n, office) ? `<button class="btn sm pri" type="button" data-noteseen="${n.id}">Got it</button>` : '<span class="note">not seen yet</span>'}
        ${canRemove ? `<button class="btn sm link" type="button" data-notedel="${n.id}" title="Remove this note">Remove</button>` : ''}</div></li>`;
  return `<div class="panel jnotes" id="jnotes"><h3>Notes ${office ? 'for the shop floor' : 'with the office'} <span class="note">${list.length ? list.length : ''}</span></h3>
    ${list.length ? `<ul class="jnl">${list.map(bubble).join('')}</ul>` : `<p class="note">${office ? 'Nothing yet. Notes show on the shop floor tablets and the workshop TV.' : 'Nothing yet. Ask the office anything about this job here.'}</p>`}
    <form class="jnf" id="notef" data-job="${job.id}" autocomplete="off">
      ${office ? '' : `<label class="fl jnname">Your name<input type="text" id="note-by" required value="${esc(name)}" placeholder="e.g. Dave"></label>`}
      <label class="fl">${office ? 'Add a note for the shop floor' : list.length ? 'Reply' : 'Add a note'}<textarea id="note-body" rows="2" maxlength="1000" required placeholder="${office ? 'e.g. Customer wants these packed in boxes of 10' : 'e.g. Short of 3mm sheet for the last 20'}"></textarea></label>
      <div class="actions"><button class="btn pri" type="submit">Post note</button>${office ? '<span class="note">No prices: the shop floor sees notes.</span>' : ''}</div></form></div>`;
}

/** A shop floor card's strip: the newest note, and Got it when it is new. s: noteSummary(). */
export function floorNoteStrip(s, jobId, h) {
  const { esc } = h;
  if (!s) return '';
  const n = s.last, fresh = s.fresh > 0;
  return `<div class="fnote${fresh ? ' new' : ''}"><span class="tag${fresh ? ' soon' : ''}">${fresh ? (s.fresh === 1 ? 'New note' : `${s.fresh} new notes`) : 'Note'}</span>
    <span class="fnb">“${esc(n.body)}” <small>${esc(n.byName)}</small></span>
    ${fresh && !n.fromFloor ? `<button type="button" class="btn" data-noteseen="${n.id}">Got it</button>` : ''}
    <button type="button" class="btn" data-open="${jobId}" data-tonotes="1">${s.count > 1 ? `Notes (${s.count})` : 'Reply'}</button></div>`;
}

/** Home: what the shop floor has said that nobody in the office has seen. list: newNotes(..., true). */
export function floorNotesBox(list, jobs, h) {
  const { esc } = h;
  if (!list.length) return '';
  const job = id => jobs.find(j => j.id === id);
  return `<div class="panel fnotes"><h3>From the shop floor <span class="note">${list.length} new</span></h3><ul class="tasks">${list.slice(0, 8).map(n => { const j = job(n.jobId);
    return `<li><button class="btn link sm mono" type="button" data-open="${n.jobId}" data-tonotes="1">${esc(j?.so || '')}</button> <span>${esc(j?.customer || '')}</span>
      <b>“${esc(n.body)}”</b> <span class="note">${esc(n.byName)}, ${esc(noteWhen(n.at))}</span>
      <button class="btn sm" type="button" data-noteseen="${n.id}">Got it</button></li>`; }).join('')}</ul></div>`;
}
