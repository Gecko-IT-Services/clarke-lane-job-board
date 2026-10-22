/**
 * Work sent out (Philip, 20 Oct): powder coating, plating, and whole subcontracted jobs are done by another company. This replaces
 * the whiteboard: what is out, where, since when and when it is due back; what is ready to go; what came
 * back lately. Pure: no window. Tested in tests/outwork.mjs.
 * row: { id, jobId, process, supplier, items, finish, sentOn, dueBack, backOn, note, sentBy, backBy }
 */
import { floorQueue, partsLeft, nextStep, dayNo } from './jobs.js';

export const OUT_PROCESSES = ['P/Coat Paint', 'Plating / Anodising', 'Subcontracted'];

/** Due back by default: five working days after it went (weekends skipped). */
export function defaultDueBack(sentOn, workingDays = 5) {
  const d = new Date(sentOn + 'T12:00:00Z');
  for (let left = workingDays; left > 0;) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() % 6) left--; }
  return d.toISOString().slice(0, 10);
}

/** What goes out, as typed on the whiteboard: "40 × Bracket, 10 × Cover". */
export const itemsFor = job => partsLeft(job).map(r => `${r.left} × ${r.part}`).join(', ');

/** A colour or finish named on the order's lines or notes (RAL 9005, black anodise, zinc plated), or ''. */
export function finishFor(job, process) {
  const text = [...job.lines.map(l => l.part), job.notes || ''].join(' ');
  const m = process === 'P/Coat Paint'
    ? text.match(/\bRAL\s*-?\s*\d{4}(?:\s+(?:satin|gloss|matt|semi[- ]gloss|textured?|fine\s+texture))?/i) || text.match(/\b(?:satin|gloss|matt)\s+(?:black|white|grey)\b/i)
    : text.match(/\b(?:clear|black|silver)\s+anodi[sz]\w*|\bzinc\s+plat\w*(?:\s+(?:clear|yellow|black))?|\bpassivat\w*/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

/** Is a job out for this process right now? The open row, or null. */
export const outNow = (rows, jobId, process) => (rows || []).find(r => r.jobId === jobId && r.process === process && !r.backOn) || null;

/**
 * The whiteboard. out: everything not back, grouped by supplier (most overdue first in each);
 * ready: open jobs whose next step is a sent-out process and are not out; back: returned in the last `days`.
 * Each out row gains { job, daysOut, late (days overdue), dueToday }.
 */
export function outBoard(rows, jobs, today, days = 14) {
  const byId = new Map((jobs || []).map(j => [j.id, j]));
  const t = dayNo(today);
  const out = (rows || []).filter(r => !r.backOn && byId.has(r.jobId)).map(r => {
    const late = r.dueBack && dayNo(r.dueBack) < t ? t - dayNo(r.dueBack) : 0;
    return { ...r, job: byId.get(r.jobId), daysOut: t - dayNo(r.sentOn), late, dueToday: r.dueBack === today };
  });
  const groups = new Map();
  for (const r of out) { const k = r.supplier.trim().toLowerCase(); const g = groups.get(k) || { supplier: r.supplier.trim(), rows: [] }; g.rows.push(r); groups.set(k, g); }
  for (const g of groups.values()) g.rows.sort((a, b) => b.late - a.late || (a.dueBack || '9').localeCompare(b.dueBack || '9') || a.sentOn.localeCompare(b.sentOn));
  const suppliers = [...groups.values()].sort((a, b) => Math.max(...b.rows.map(r => r.late)) - Math.max(...a.rows.map(r => r.late)) || a.supplier.localeCompare(b.supplier));
  const ready = floorQueue(jobs || [], 'all').filter(j => j.status === 'open' && OUT_PROCESSES.includes(nextStep(j)) && !outNow(rows, j.id, nextStep(j)))
    .map(j => ({ job: j, process: nextStep(j) }));
  const back = (rows || []).filter(r => r.backOn && t - dayNo(r.backOn) <= days && byId.has(r.jobId))
    .map(r => ({ ...r, job: byId.get(r.jobId) })).sort((a, b) => b.backOn.localeCompare(a.backOn) || b.id - a.id);
  return { suppliers, out, ready, back, late: out.filter(r => r.late > 0) };
}

/** Companies used before, most recent first, for the supplier box. */
export function suppliersUsed(rows) {
  const seen = new Map();
  for (const r of [...(rows || [])].sort((a, b) => b.sentOn.localeCompare(a.sentOn) || b.id - a.id)) {
    const k = r.supplier.trim().toLowerCase(); if (k && !seen.has(k)) seen.set(k, r.supplier.trim());
  }
  return [...seen.values()];
}

/** Checks a send-out form. Returns an error message, or ''. */
export function checkSend(f, today) {
  if (!OUT_PROCESSES.includes(f.process)) return 'Choose what it is going out for.';
  if (!String(f.supplier || '').trim()) return 'Say which company it is going to.';
  if (!f.sentOn) return 'Put in the date it went.';
  if (today && f.sentOn > today) return 'The date it went is in the future.';
  if (f.dueBack && f.dueBack < f.sentOn) return 'The due back date is before the date it went.';
  return '';
}
