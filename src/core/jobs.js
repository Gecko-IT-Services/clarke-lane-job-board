/**
 * Pure job logic: no window, no network, so it runs under Node in tests/jobs.mjs.
 *
 * A job, as the app holds it:
 * { id, so, quote, spQuoteId, customer, contactName, contactEmail, po, ordered, due,
 *   calloffs: ['YYYY-MM-DD'], notes,
 *   lines: [{ id, lineNo, part, qty, price }],            price is null for the floor role
 *   procs: { 'Laser': { done, by, at }, … },               only the processes the job needs
 *   despatches: [{ id, dn, date, by, lines: { [lineId]: qty }, xero: { no, at } | null }] }
 */

// Levi's nine, in the order of his Jobs List.
export const PROCESSES = ['Laser', 'Fold', 'Roll Drill', 'Tap', 'Insert', 'C/Sink', 'Weld',
  'P/Coat Paint', 'Plating / Anodising'];

export const SHORT = { 'Laser': 'Laser', 'Fold': 'Fold', 'Roll Drill': 'Roll drill', 'Tap': 'Tap',
  'Insert': 'Insert', 'C/Sink': 'C/Sink', 'Weld': 'Weld', 'P/Coat Paint': 'P/Coat',
  'Plating / Anodising': 'Plating' };

export const sent = (job, line) => job.despatches.reduce((a, d) => a + (d.lines[line.id] || 0), 0);
export const left = (job, line) => Math.max(0, line.qty - sent(job, line));
export const needed = job => PROCESSES.filter(p => job.procs[p]);
export const doneCount = job => needed(job).filter(p => job.procs[p].done).length;
export const allDone = job => needed(job).every(p => job.procs[p].done);

/** Net value of the whole order, or of what is still to send. null when prices are hidden. */
export function value(job, { remaining = false } = {}) {
  if (job.lines.some(l => l.price == null)) return null;
  return round2(job.lines.reduce((a, l) => a + round2((remaining ? left(job, l) : l.qty) * l.price), 0));
}
export const despatchValue = (job, d) =>
  job.lines.some(l => l.price == null) ? null
    : round2(job.lines.reduce((a, l) => a + round2((d.lines[l.id] || 0) * l.price), 0));

/** upcoming: nothing ticked or sent · current: something ticked or part sent · completed: all sent */
export function stage(job) {
  if (job.lines.every(l => left(job, l) === 0)) return 'completed';
  return (doneCount(job) || job.despatches.length) ? 'current' : 'upcoming';
}

/** The date that matters next: the next call-off, else the job's due date. */
export function nextDue(job) {
  if (!job.calloffs.length) return job.due;
  return job.calloffs[job.despatches.length] || job.calloffs[job.calloffs.length - 1];
}

export const lastDespatch = job => job.despatches.length ? job.despatches[job.despatches.length - 1].date : '';

/** Call-off dates from the first date: every 7 or 14 days, or monthly ('m'). */
export function calloffDates(first, count, every) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(first + 'T12:00:00Z');
    if (every === 'm') d.setUTCMonth(d.getUTCMonth() + i);
    else d.setUTCDate(d.getUTCDate() + i * Number(every));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Default quantity for the next despatch: an even share per call-off, else everything left. */
export function defaultDespatchQty(job, line) {
  const l = left(job, line);
  if (!job.calloffs.length) return l;
  return Math.min(l, Math.ceil(line.qty / job.calloffs.length));
}

/**
 * Processes to pre-tick from the quote lines (Mandy checks them). Tap and C/Sink are
 * not in the quote data, so they are never suggested.
 * line: { process, folds, weld, inserts, paint, plating, holes }
 */
export function suggestProcesses(lines) {
  const s = new Set();
  for (const l of lines) {
    if (/laser/i.test(l.process || '') || !l.process) s.add('Laser');
    if (l.folds > 0) s.add('Fold');
    if (l.holes > 0) s.add('Roll Drill');
    if (l.inserts > 0) s.add('Insert');
    if (l.weld > 0) s.add('Weld');
    if (l.paint) s.add('P/Coat Paint');
    if (l.plating > 0) s.add('Plating / Anodising');
  }
  return PROCESSES.filter(p => s.has(p));
}

/** The part name a job line carries, built the way Levi's app describes a line. */
export function describeLine(l) {
  const desc = String(l.desc || '').trim() || 'Part';
  const spec = [l.thickness ? `${l.thickness}mm` : '', l.material || ''].filter(Boolean).join(' ');
  return spec ? `${desc} — ${spec}` : desc;
}

/** Unit price from the quote line's sell total, to 6dp (the column's precision), so qty × unit
 *  gives back the quoted total to the penny. */
export const unitPrice = (sellTotal, qty) => qty > 0 ? Math.round((sellTotal / qty) * 1e6) / 1e6 : 0;

export const round2 = n => Math.round(n * 100) / 100;
