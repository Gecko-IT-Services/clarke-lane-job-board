/**
 * The workshop TV (Philip, 20 Oct): the whiteboard by the machines, drawn by the board. One row per open job
 * in the running order; a column per process with the whiteboard's marks (tick = done, star = still to do,
 * blank = not needed), plus where powder coat or plating is out, the due date and a short note.
 * Display only. Pure: no window. Tested in tests/tv.mjs.
 */
import { PROCESSES, floorQueue, needed, nextStep, allDone, nextDue, deliveryLabel, dayNo } from './jobs.js';
import { outNow } from './outwork.js';
import { noteSummary } from './notes.js';

/** A cell: 'none' (not needed), 'done', 'next' (the job's next step), 'todo', or 'out' (at another company). */
export function tvRows(jobs, outwork, today, notes = []) {
  return floorQueue(jobs || [], 'all').map(j => {
    const next = nextStep(j), held = j.status === 'held';
    const cells = Object.fromEntries(PROCESSES.map(p => {
      const s = j.procs[p];
      if (!s) return [p, { state: 'none' }];
      if (s.done) return [p, { state: 'done' }];
      const o = outNow(outwork, j.id, p);
      if (o) return [p, { state: 'out', supplier: o.supplier, dueBack: o.dueBack, late: !!(o.dueBack && o.dueBack < today) }];
      return [p, { state: p === next && !held ? 'next' : 'todo' }];
    }));
    const due = nextDue(j), late = due && due < today ? dayNo(today) - dayNo(due) : 0;
    const out = PROCESSES.map(p => cells[p]).find(c => c.state === 'out');
    const note = held ? 'On hold' : allDone(j) ? 'Ready to dispatch'
      : out ? `At ${out.supplier}` : deliveryLabel(j);
    const js = noteSummary(notes, j.id, false);   // as the shop floor sees it: new = not yet Got it
    return { id: j.id, jobNote: js ? { body: js.last.body, by: js.last.byName, fresh: js.fresh > 0 } : null, so: j.so, customer: j.customer, cells, due, late, soon: !late && due && dayNo(due) - dayNo(today) <= 3, held, ready: !held && allDone(j),
      outLate: !!out?.late, outBack: out?.dueBack || null, note, steps: needed(j).length };
  });
}

/** Processes worth a column: all nine, so the TV reads like the whiteboard (Rolling only when a job needs it). */
export const tvColumns = rows => PROCESSES.filter(p => p !== 'Rolling' || rows.some(r => r.cells[p].state !== 'none'));

/** Rows on page n (0-based) of `per`, and how many pages; n wraps round. */
export function tvPage(rows, per, n) {
  const pages = Math.max(1, Math.ceil(rows.length / per)), i = ((n % pages) + pages) % pages;
  return { rows: rows.slice(i * per, i * per + per), page: i, pages };
}
